import { GoogleGenAI } from '@google/genai';
import pool from '../config/database.js';
import { loadFullKnowledgeDocuments, RetrievedChunk } from './embeddingService.js';

const CHAT_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY_CHARS = 40000;
const MAX_SYSTEM_CHARS = 200000;
/** Max think→retrieve→respond→validate cycles per user turn when validation is below threshold. */
const MAX_QUALITY_ROUNDS = 3;
const ALIGNMENT_PASS_THRESHOLD = 70;
const COMPLETENESS_PASS_THRESHOLD = 70;

function passesQualityGate(v: ValidationInfo): boolean {
  return (
    v.alignment_score >= ALIGNMENT_PASS_THRESHOLD &&
    v.completeness_score >= COMPLETENESS_PASS_THRESHOLD
  );
}

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('${') || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY is not configured. Set a valid key in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.substring(0, max) + '... [truncated]' : text;
}

export interface AgentTurnParams {
  personaId: string;
  personaIds?: string[];
  sessionId?: string;
  userId?: string;
  history: { role: 'user' | 'model'; text: string }[];
  userMessage: string;
  simulationInstructions?: string;
  previousThinking?: string;
  image?: string;
  mimeType?: string;
}

export interface RetrievalInfo {
  queries: string[];
  chunks: { source_type: string; source_name: string; score: number; preview: string }[];
  ragEmpty: boolean;
}

export interface ValidationInfo {
  alignment_score: number;
  completeness_score: number;
  flags: string[];
  suggestions: string[];
  completeness_flags: string[];
  completeness_suggestions: string[];
}

export interface AgentTurnResult {
  response: string;
  thinking: string;
  retrieval: RetrievalInfo;
  validation: ValidationInfo | null;
}

async function getPersonaIdentity(personaId: string): Promise<{ name: string; description: string }> {
  const result = await pool.query(
    'SELECT name, description FROM personas WHERE id = $1',
    [personaId]
  );
  if (result.rows.length === 0) throw new Error(`Persona ${personaId} not found`);
  return result.rows[0];
}

async function thinkStep(
  ai: GoogleGenAI,
  persona: { name: string; description: string },
  history: { role: 'user' | 'model'; text: string }[],
  userMessage: string,
  simulationInstructions?: string,
  previousThinking?: string,
  retryContext?: { previousResponse: string; validation: ValidationInfo }
): Promise<{ thinking: string; searchQueries: string[] }> {
  let systemPrompt = `You are ${persona.name}, ${persona.description}.

You are about to respond to a message. Complete knowledge documents (persona profile, blueprint files, session inputs, and any client business profile) will be provided in full on the next step—no search is required.
Before responding, think carefully:
- What is the user really asking or trying to achieve?
- Which parts of those documents are most relevant to this message?
- How should you stay in character while addressing it?`;

  if (retryContext) {
    const { previousResponse, validation } = retryContext;
    systemPrompt += `

### Quality revision
Your previous in-character reply scored ${validation.alignment_score}/100 on persona alignment and ${validation.completeness_score}/100 on answer completeness (fully addressing the user, substantive, not truncated or evasive). Refine your reasoning and plan for using the knowledge documents to fix any issues.
${validation.flags.length ? `Persona alignment concerns:\n${validation.flags.map(f => `- ${f}`).join('\n')}` : ''}
${validation.suggestions.length ? `Persona alignment suggestions:\n${validation.suggestions.map(s => `- ${s}`).join('\n')}` : ''}
${validation.completeness_flags.length ? `Answer completeness concerns:\n${validation.completeness_flags.map(f => `- ${f}`).join('\n')}` : ''}
${validation.completeness_suggestions.length ? `Answer completeness suggestions:\n${validation.completeness_suggestions.map(s => `- ${s}`).join('\n')}` : ''}

Previous reply (reference only—plan an improved approach):
${truncate(previousResponse, 4000)}`;
  }

  if (simulationInstructions) {
    systemPrompt += `

### Simulation context
You are participating in a simulation. Consider the following instructions when reasoning about what knowledge to retrieve and how to approach your response:
${truncate(simulationInstructions, 8000)}

Factor the simulation goals and constraints into how you will use the knowledge documents in your reply.`;
  }

  if (previousThinking) {
    systemPrompt += `

### Your reasoning from the previous turn
Build on your prior analysis rather than starting from scratch:
${truncate(previousThinking, 4000)}`;
  }

  systemPrompt += `

Output your thinking in JSON:
{
  "thinking": "your step-by-step reasoning here"
}`;

  const contents = [
    ...history.slice(-10).map(h => ({
      role: h.role,
      parts: [{ text: truncate(h.text, 5000) }],
    })),
    { role: 'user' as const, parts: [{ text: truncate(userMessage, 10000) }] },
  ];

  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text || '{}';
  try {
    const parsed = JSON.parse(text);
    return {
      thinking: parsed.thinking || '',
      searchQueries: [],
    };
  } catch {
    return { thinking: text, searchQueries: [] };
  }
}

const MAX_RETRIEVED_CONTEXT_TOTAL_CHARS = 140_000;

function buildRetrievedContextSection(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const body = chunks.map((c) => `### ${c.source_name}\n\n${c.text}`).join('\n\n---\n\n');
  const header = '### Knowledge base (full documents)\n\n';
  const full = header + body;
  if (full.length <= MAX_RETRIEVED_CONTEXT_TOTAL_CHARS) return full;
  return (
    full.slice(0, MAX_RETRIEVED_CONTEXT_TOTAL_CHARS) +
    '\n\n...[knowledge base section truncated for length]'
  );
}

async function respondStep(
  ai: GoogleGenAI,
  persona: { name: string; description: string },
  history: { role: 'user' | 'model'; text: string }[],
  userMessage: string,
  thinking: string,
  retrievedContext: string,
  simulationInstructions?: string,
  image?: string,
  mimeType?: string,
  revisionOf?: { draft: string; validation: ValidationInfo }
): Promise<string> {
  let systemPrompt = `You are ${persona.name}, ${persona.description}.
You ARE this persona. Respond in first person as them. Never describe or reference the persona—speak only as them. Stay in character.`;

  if (revisionOf) {
    const { draft, validation } = revisionOf;
    systemPrompt += `

### Revision pass
Your earlier draft scored ${validation.alignment_score}/100 on persona alignment and ${validation.completeness_score}/100 on answer completeness. Produce one improved in-character reply that addresses all feedback. Do not meta-comment about the review—just speak as the persona.
${validation.flags.length ? `Persona issues: ${validation.flags.join('; ')}` : ''}
${validation.suggestions.length ? `Persona guidance: ${validation.suggestions.join('; ')}` : ''}
${validation.completeness_flags.length ? `Completeness issues: ${validation.completeness_flags.join('; ')}` : ''}
${validation.completeness_suggestions.length ? `Completeness guidance: ${validation.completeness_suggestions.join('; ')}` : ''}

Earlier draft to replace (do not quote verbatim):
${truncate(draft, 4000)}`;
  }

  if (simulationInstructions) {
    systemPrompt += `\n\n### Simulation instructions\n${simulationInstructions}`;
  }

  if (thinking) {
    systemPrompt += `\n\n### Your earlier analysis\n${thinking}`;
  }

  if (retrievedContext) {
    systemPrompt += `\n\n${retrievedContext}`;
  }

  systemPrompt = truncate(systemPrompt, MAX_SYSTEM_CHARS);

  const userParts: any[] = [{ text: truncate(userMessage, 20000) }];
  if (image && mimeType) {
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    userParts.push({
      inlineData: { data: base64Data, mimeType },
    });
  }

  const contents = [
    ...history.map(h => ({
      role: h.role,
      parts: [{ text: truncate(h.text, 10000) }],
    })),
    { role: 'user' as const, parts: userParts },
  ];

  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  return response.text || '';
}

async function validateStep(
  ai: GoogleGenAI,
  persona: { name: string; description: string },
  userMessage: string,
  response: string,
  retrievedContext: string,
  ragEmpty: boolean,
  simulationInstructions?: string
): Promise<ValidationInfo> {
  const systemPrompt = `You are a quality-assurance reviewer evaluating an in-character reply. You must score two independent dimensions.

### Persona
Name: ${persona.name}
Description: ${truncate(persona.description, 4000)}

### User message (what the reply should address)
${truncate(userMessage, 8000)}

${ragEmpty ? '### WARNING\nNo knowledge documents were loaded (no profile text beyond the system prompt, no blueprint files, no session inputs, and no runner business profile). The reply may rely only on the short persona description in the system prompt.\n' : ''}
${simulationInstructions ? `### Simulation context\n${truncate(simulationInstructions, 2000)}\n` : ''}
${retrievedContext ? `### Knowledge that was available\n${truncate(retrievedContext, 4000)}\n` : ''}

### Task 1 — Persona alignment
Consider:
- Does the tone match the persona's likely communication style?
- Does the content reflect the persona's expertise and background?
- Are there any claims that contradict the persona's profile or knowledge?
- Is the response staying in character?
${ragEmpty ? '- Factor in that no extended knowledge documents were available — the response may be generic.\n' : ''}

### Task 2 — Answer completeness (independent of persona score)
Judge whether the reply adequately completes the job for the user message. Consider:
- Does it directly address what was asked (including all parts of a multi-part question)?
- Is it substantive enough, or overly vague, dismissive, or placeholder?
- Does it appear cut off, unfinished, or refuse to answer without good in-character reason?
- For very short user messages, a brief reply may still be complete if it appropriately answers.

Output JSON only:
{
  "alignment_score": <1-100>,
  "completeness_score": <1-100>,
  "flags": ["<persona alignment mismatch or concern>"],
  "suggestions": ["<actionable persona improvement>"],
  "completeness_flags": ["<specific completeness or answer-quality issue>"],
  "completeness_suggestions": ["<actionable improvement to fully answer the user>"]
}`;

  const result = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: [{ role: 'user', parts: [{ text: truncate(response, 8000) }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
    },
  });

  const text = result.text || '{}';
  try {
    const parsed = JSON.parse(text);
    return {
      alignment_score: typeof parsed.alignment_score === 'number' ? Math.min(100, Math.max(1, Math.round(parsed.alignment_score))) : 50,
      completeness_score:
        typeof parsed.completeness_score === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.completeness_score)))
          : 50,
      flags: Array.isArray(parsed.flags) ? parsed.flags.filter((f: unknown) => typeof f === 'string') : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: unknown) => typeof s === 'string') : [],
      completeness_flags: Array.isArray(parsed.completeness_flags)
        ? parsed.completeness_flags.filter((f: unknown) => typeof f === 'string')
        : [],
      completeness_suggestions: Array.isArray(parsed.completeness_suggestions)
        ? parsed.completeness_suggestions.filter((s: unknown) => typeof s === 'string')
        : [],
    };
  } catch {
    return {
      alignment_score: 50,
      completeness_score: 50,
      flags: ['Could not parse validation response'],
      suggestions: [],
      completeness_flags: [],
      completeness_suggestions: [],
    };
  }
}

export type AgentPipelineEvent =
  | { step: 'thinking'; status: 'active' }
  | { step: 'thinking'; status: 'done'; thinking: string; searchQueries: string[] }
  | { step: 'retrieval'; status: 'active'; queries: string[] }
  | { step: 'retrieval'; status: 'done'; chunks: { source_type: string; source_name: string; score: number; preview: string }[]; ragEmpty: boolean }
  | { step: 'responding'; status: 'active' }
  | { step: 'responding'; status: 'done'; response: string }
  | { step: 'validation'; status: 'active' }
  | { step: 'validation'; status: 'done'; validation: ValidationInfo }
  | { step: 'complete'; result: AgentTurnResult };

export async function runAgentTurn(params: AgentTurnParams): Promise<AgentTurnResult> {
  return runAgentTurnStreaming(params);
}

export async function runAgentTurnStreaming(
  params: AgentTurnParams,
  emit?: (event: AgentPipelineEvent) => void
): Promise<AgentTurnResult> {
  const { personaId, personaIds, sessionId, userId, history, userMessage, simulationInstructions, previousThinking, image, mimeType } = params;
  const write = emit || (() => {});
  const ai = getAI();
  const persona = await getPersonaIdentity(personaId);
  const effectivePersonaIds = personaIds && personaIds.length > 0 ? personaIds : [personaId];

  let fullDocuments: RetrievedChunk[] = [];
  try {
    fullDocuments = await loadFullKnowledgeDocuments(effectivePersonaIds, sessionId, userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Knowledge] loadFullKnowledgeDocuments failed:', msg);
    fullDocuments = [];
  }

  const documentQueries = fullDocuments.map((d) => d.source_name);
  const ragEmpty = fullDocuments.length === 0;

  let thinking = '';
  let response = '';
  let validation: ValidationInfo | null = null;
  let retrievalInfo: RetrievalInfo = {
    queries: documentQueries,
    chunks: [],
    ragEmpty,
  };

  for (let round = 1; round <= MAX_QUALITY_ROUNDS; round++) {
    const chainThinking = round === 1 ? previousThinking : thinking;
    const retryContext =
      round > 1 && validation
        ? { previousResponse: response, validation }
        : undefined;

    write({ step: 'thinking', status: 'active' });
    const thinkOut = await thinkStep(
      ai,
      persona,
      history,
      userMessage,
      simulationInstructions,
      chainThinking,
      retryContext
    );
    thinking = thinkOut.thinking;
    write({ step: 'thinking', status: 'done', thinking, searchQueries: [] });

    write({ step: 'retrieval', status: 'active', queries: documentQueries });
    const retrievedContext = buildRetrievedContextSection(fullDocuments);
    retrievalInfo = {
      queries: documentQueries,
      chunks: fullDocuments.map((c) => ({
        source_type: c.source_type,
        source_name: c.source_name,
        score: c.score,
        preview: `${c.text.length.toLocaleString()} chars — ${truncate(c.text, 120)}`,
      })),
      ragEmpty,
    };
    write({ step: 'retrieval', status: 'done', chunks: retrievalInfo.chunks, ragEmpty });

    const revisionOf =
      round > 1 && validation ? { draft: response, validation } : undefined;

    write({ step: 'responding', status: 'active' });
    response = await respondStep(
      ai,
      persona,
      history,
      userMessage,
      thinking,
      retrievedContext,
      simulationInstructions,
      image,
      mimeType,
      revisionOf
    );
    write({ step: 'responding', status: 'done', response });

    write({ step: 'validation', status: 'active' });
    const trimmedResponse = (response || '').trim();
    if (!trimmedResponse) {
      validation = {
        alignment_score: 25,
        completeness_score: 5,
        flags: ['Empty or whitespace-only response'],
        suggestions: ['Generate a substantive in-character reply'],
        completeness_flags: ['No answer content was produced'],
        completeness_suggestions: ['Fully respond to the user message in character'],
      };
    } else {
      try {
        validation = await validateStep(
          ai,
          persona,
          userMessage,
          response,
          retrievedContext,
          ragEmpty,
          simulationInstructions
        );
      } catch (err: any) {
        console.error(`[Validation] Failed:`, err?.message || err);
        validation = null;
      }
    }
    const validationDone = validation || {
      alignment_score: 50,
      completeness_score: 50,
      flags: ['Validation unavailable'],
      suggestions: [],
      completeness_flags: [],
      completeness_suggestions: [],
    };
    write({ step: 'validation', status: 'done', validation: validationDone });
    validation = validationDone;

    if (passesQualityGate(validation)) {
      break;
    }
  }

  const result: AgentTurnResult = { response, thinking, retrieval: retrievalInfo, validation };
  write({ step: 'complete', result });
  return result;
}
