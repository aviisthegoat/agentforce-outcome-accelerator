import { GoogleGenAI } from '@google/genai';
import pool from '../config/database.js';
import { loadFullKnowledgeDocuments, RetrievedChunk, retrieve } from './embeddingService.js';

const CHAT_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY_CHARS = 40000;
const MAX_SYSTEM_CHARS = 200000;
/** Max think→retrieve→respond→validate cycles per user turn when validation is below threshold. */
const MAX_QUALITY_ROUNDS = 3;
const ALIGNMENT_PASS_THRESHOLD = 70;
const COMPLETENESS_PASS_THRESHOLD = 70;
const CONTEXT_FIDELITY_PASS_THRESHOLD = 65;
const ACTIONABILITY_PASS_THRESHOLD = 65;
const SAFETY_COMPLIANCE_PASS_THRESHOLD = 75;
const RETRIEVAL_TOP_K = 10;

function passesQualityGate(v: ValidationInfo): boolean {
  return (
    v.alignment_score >= ALIGNMENT_PASS_THRESHOLD &&
    v.completeness_score >= COMPLETENESS_PASS_THRESHOLD &&
    (v.context_fidelity_score ?? 0) >= CONTEXT_FIDELITY_PASS_THRESHOLD &&
    (v.actionability_score ?? 0) >= ACTIONABILITY_PASS_THRESHOLD &&
    (v.safety_compliance_score ?? 0) >= SAFETY_COMPLIANCE_PASS_THRESHOLD
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
  coachContext?: Record<string, string | null | undefined>;
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
  context_fidelity_score?: number;
  actionability_score?: number;
  sales_method_alignment_score?: number;
  safety_compliance_score?: number;
  flags: string[];
  suggestions: string[];
  completeness_flags: string[];
  completeness_suggestions: string[];
  rubric_flags?: string[];
  rubric_suggestions?: string[];
}

export interface CoachOutput {
  diagnosis: string;
  top_issues: string[];
  recommended_talk_track: string;
  next_question: string;
  risk_flags: string[];
  confidence: number;
}

export interface AgentTurnResult {
  response: string;
  thinking: string;
  retrieval: RetrievalInfo;
  validation: ValidationInfo | null;
  coach_output?: CoachOutput | null;
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

function serializeCoachContext(context?: Record<string, string | null | undefined>): string {
  if (!context) return '';
  const rows = Object.entries(context)
    .filter(([, value]) => value != null && String(value).trim())
    .map(([key, value]) => `- ${key}: ${String(value).trim()}`);
  return rows.length ? rows.join('\n') : '';
}

async function respondStep(
  ai: GoogleGenAI,
  persona: { name: string; description: string },
  history: { role: 'user' | 'model'; text: string }[],
  userMessage: string,
  thinking: string,
  retrievedContext: string,
  simulationInstructions?: string,
  coachContext?: Record<string, string | null | undefined>,
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

  const coachContextText = serializeCoachContext(coachContext);
  if (coachContextText) {
    systemPrompt += `\n\n### Coach context pack\nUse this deal context as hard grounding for your answer:\n${coachContextText}`;
  }

  systemPrompt += `

### Required output contract
Return valid JSON only:
{
  "diagnosis": "short situation diagnosis",
  "top_issues": ["issue 1", "issue 2", "issue 3"],
  "recommended_talk_track": "what the user should say next",
  "next_question": "single best follow-up question",
  "risk_flags": ["risk 1", "risk 2"],
  "confidence": 0-100
}
`;

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
      responseMimeType: 'application/json',
    },
  });

  return response.text || '{}';
}

function parseCoachOutput(text: string): CoachOutput | null {
  try {
    const parsed = JSON.parse(text || '{}');
    return {
      diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis : '',
      top_issues: Array.isArray(parsed.top_issues) ? parsed.top_issues.filter((v: unknown) => typeof v === 'string') : [],
      recommended_talk_track: typeof parsed.recommended_talk_track === 'string' ? parsed.recommended_talk_track : '',
      next_question: typeof parsed.next_question === 'string' ? parsed.next_question : '',
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.filter((v: unknown) => typeof v === 'string') : [],
      confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, Math.round(parsed.confidence))) : 50,
    };
  } catch {
    return null;
  }
}

function buildFallbackCoachOutput(userMessage: string, simulationInstructions?: string): CoachOutput {
  const instructionHint = simulationInstructions
    ? `Use the simulation constraints: ${truncate(simulationInstructions, 240)}`
    : 'Use available deal context and ask one clarifying question.';
  return {
    diagnosis: 'The model returned an unstructured response, so a deterministic coaching fallback was used.',
    top_issues: [
      'Response format contract was not satisfied',
      'Action plan needs explicit next-step guidance',
      'Context grounding should be revalidated on next turn',
    ],
    recommended_talk_track: `Based on your request "${truncate(userMessage, 180)}", restate the business goal, confirm stakeholder priority, and propose one concrete next meeting outcome. ${instructionHint}`,
    next_question: 'Which stakeholder can confirm decision criteria and timeline in this cycle?',
    risk_flags: ['Output format fallback triggered', 'Review for context fidelity before execution'],
    confidence: 55,
  };
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

### Task 3 — Applied AI coach rubric
Evaluate:
- context_fidelity_score: how grounded the response is in provided business/deal/simulation context.
- actionability_score: whether it provides concrete next actions or talk tracks.
- sales_method_alignment_score: whether it aligns with explicit sales method/context if present.
- safety_compliance_score: avoid fabricated claims, risky legal/compliance advice, or manipulative behavior.

Output JSON only:
{
  "alignment_score": <1-100>,
  "completeness_score": <1-100>,
  "context_fidelity_score": <1-100>,
  "actionability_score": <1-100>,
  "sales_method_alignment_score": <1-100>,
  "safety_compliance_score": <1-100>,
  "flags": ["<persona alignment mismatch or concern>"],
  "suggestions": ["<actionable persona improvement>"],
  "completeness_flags": ["<specific completeness or answer-quality issue>"],
  "completeness_suggestions": ["<actionable improvement to fully answer the user>"],
  "rubric_flags": ["<context/actionability/sales/safety issue>"],
  "rubric_suggestions": ["<actionable rubric fix suggestion>"]
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
      context_fidelity_score:
        typeof parsed.context_fidelity_score === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.context_fidelity_score)))
          : 50,
      actionability_score:
        typeof parsed.actionability_score === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.actionability_score)))
          : 50,
      sales_method_alignment_score:
        typeof parsed.sales_method_alignment_score === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.sales_method_alignment_score)))
          : 50,
      safety_compliance_score:
        typeof parsed.safety_compliance_score === 'number'
          ? Math.min(100, Math.max(1, Math.round(parsed.safety_compliance_score)))
          : 50,
      flags: Array.isArray(parsed.flags) ? parsed.flags.filter((f: unknown) => typeof f === 'string') : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s: unknown) => typeof s === 'string') : [],
      completeness_flags: Array.isArray(parsed.completeness_flags)
        ? parsed.completeness_flags.filter((f: unknown) => typeof f === 'string')
        : [],
      completeness_suggestions: Array.isArray(parsed.completeness_suggestions)
        ? parsed.completeness_suggestions.filter((s: unknown) => typeof s === 'string')
        : [],
      rubric_flags: Array.isArray(parsed.rubric_flags)
        ? parsed.rubric_flags.filter((f: unknown) => typeof f === 'string')
        : [],
      rubric_suggestions: Array.isArray(parsed.rubric_suggestions)
        ? parsed.rubric_suggestions.filter((s: unknown) => typeof s === 'string')
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
      context_fidelity_score: 50,
      actionability_score: 50,
      sales_method_alignment_score: 50,
      safety_compliance_score: 50,
      rubric_flags: [],
      rubric_suggestions: [],
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
  const { personaId, personaIds, sessionId, userId, history, userMessage, simulationInstructions, coachContext, previousThinking, image, mimeType } = params;
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

  const personaProfileDocs = fullDocuments.filter((d) => d.source_type === 'full_persona_profile');
  const documentQueries = fullDocuments.map((d) => d.source_name);
  let rankedChunks: RetrievedChunk[] = [];
  try {
    rankedChunks = await retrieve(
      `${userMessage}\n${previousThinking || ''}`.trim(),
      effectivePersonaIds,
      sessionId,
      RETRIEVAL_TOP_K,
      userId
    );
  } catch (err: unknown) {
    console.warn('[Knowledge] targeted retrieval failed, using fallback full docs:', err);
  }
  const selectedDocs = [...personaProfileDocs, ...rankedChunks].slice(0, RETRIEVAL_TOP_K + 2);
  const ragEmpty = selectedDocs.length === 0;

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
    const retrievedContext = buildRetrievedContextSection(selectedDocs);
    retrievalInfo = {
      queries: [`targeted:${userMessage.slice(0, 80)}`, ...documentQueries],
      chunks: selectedDocs.map((c) => ({
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
      coachContext,
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
        context_fidelity_score: 5,
        actionability_score: 5,
        sales_method_alignment_score: 5,
        safety_compliance_score: 25,
        flags: ['Empty or whitespace-only response'],
        suggestions: ['Generate a substantive in-character reply'],
        completeness_flags: ['No answer content was produced'],
        completeness_suggestions: ['Fully respond to the user message in character'],
        rubric_flags: ['No grounded coaching output was generated'],
        rubric_suggestions: ['Return complete JSON coaching output with actionable next step'],
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
      context_fidelity_score: 50,
      actionability_score: 50,
      sales_method_alignment_score: 50,
      safety_compliance_score: 50,
      rubric_flags: [],
      rubric_suggestions: [],
    };
    write({ step: 'validation', status: 'done', validation: validationDone });
    validation = validationDone;

    if (passesQualityGate(validation)) {
      break;
    }
  }

  const coachOutput = parseCoachOutput(response) || buildFallbackCoachOutput(userMessage, simulationInstructions);
  const finalResponse = coachOutput
    ? `Diagnosis: ${coachOutput.diagnosis}\n\nTop issues:\n${coachOutput.top_issues.map((issue) => `- ${issue}`).join('\n')}\n\nRecommended talk track:\n${coachOutput.recommended_talk_track}\n\nNext question:\n${coachOutput.next_question}\n\nRisk flags:\n${coachOutput.risk_flags.map((risk) => `- ${risk}`).join('\n')}\n\nConfidence: ${coachOutput.confidence}%`
    : response;
  const result: AgentTurnResult = { response: finalResponse, thinking, retrieval: retrievalInfo, validation, coach_output: coachOutput };
  write({ step: 'complete', result });
  return result;
}
