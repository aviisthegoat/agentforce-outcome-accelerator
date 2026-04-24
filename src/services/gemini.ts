import { GoogleGenAI } from "@google/genai";
import type { CreateSimulationRequest } from "./simulationTemplateApi.js";
import { customerSegmentTemplate } from "../../templates/customerSegmentTemplate.js";
import { parseLastPersuasionPercentFromText } from "../utils/persuasionScore.js";

const MAX_PART_CHARS = 500000;
const MAX_SYSTEM_CHARS = 200000;

/** MIME types supported by Gemini for inline data (images, PDF, and other documents). */
export const GEMINI_ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'text/plain',
  'text/csv',
  'application/json',
] as const;

/** Accept attribute value for file inputs that should accept any file type Gemini supports. */
export const GEMINI_FILE_INPUT_ACCEPT =
  '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.heic,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg,image/webp,image/gif,image/heic,text/plain,text/csv,application/json';

/** Per-type description of expected output and behavior; passed when generating the system prompt. */
export const SIMULATION_TYPE_OUTPUT_SPECS: Record<string, string> = {
  report: 'Strict output: A single downloadable report from the {{SELECTED_PROFILE_FULL}} perspective. Exactly one paragraph of reasoning (or summary), then the full report in a structured/column format. No chat. No follow-up. Read-only output only.',
  persuasion_simulation: 'Strict output: Back-and-forth chat. At the end, the persona MUST state exactly one line: \'Persuasion: N%\' where N is an integer from 1 to 100 indicating how persuaded the agent is. Example: \'Persuasion: 75%\'. The score must be convincing and between 1-100. The UI displays this as the persuasion result. No other structured output—conversation plus this final line.',
  response_simulation: 'Strict output: Exactly one response. Must include: (1) the confidence level (e.g. percentage or score), (2) the single output—for numeric type always give a number AND its unit (e.g. "45 minutes", "$1,200", "75%"); for action/text give the chosen action or text answer—and (3) at most one paragraph of reasoning. No chat. No further interaction.',
  survey: 'Strict output: Survey results only. Persona answers the survey in the given context; prebuilt or generated surveys are allowed. Output is survey responses (suitable for CSV export) and optionally a short summary/bullets. No chat. No follow-up conversation.',
  persona_conversation: 'Moderated multi-persona conversation. Multiple personas discuss an opening line in turns; an LLM moderator decides who speaks next and when the conversation ends. Each persona responds in a separate call with full conversation context. After the conversation (or after max 20 persona turns), the moderator summarizes and answers the opening line.',
  idea_generation: 'Strict output: Exactly one response. Output MUST be a bullet list of ideas only (use "- " or "* " at the start of each line). No introductory paragraph, no chat, no follow-up. The number of ideas is specified in the configuration; output exactly that many bullet points.',
};

const truncate = (text: string, max: number) => {
  if (!text) return "";
  return text.length > max ? text.substring(0, max) + "... [Truncated for Context]" : text;
};

const extractJson = (text: string) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON from response:", text);
    throw new Error("Invalid intelligence response format. Ensure you are providing actual text content, not just a link.");
  }
};

/** Detect 503/502/504 or UNAVAILABLE and throw a user-friendly message so callers don't suggest API key/quota. */
function throwIfServiceUnavailable(error: any, defaultMessage: string): void {
  const status = error?.status ?? error?.statusCode ?? error?.code ?? error?.error?.code;
  const msg = (error?.message ?? '') + (typeof error?.error === 'object' ? JSON.stringify(error.error) : '');
  const is503 = status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('currently unavailable');
  const is502 = status === 502 || msg.includes('502');
  const is504 = status === 504 || msg.includes('504');
  if (is503 || is502 || is504) {
    throw new Error(
      `Google's Gemini API is temporarily unavailable (${status || 'service error'}). This is usually on Google's side, not your API key or quota.\n\n` +
      'Please try again in a few minutes. You can check status at https://status.cloud.google.com'
    );
  }
}

/** Check if error is retryable (503, 502, 504, UNAVAILABLE). */
function isRetryableError(error: any): boolean {
  const status = error?.status ?? error?.statusCode ?? error?.code ?? error?.error?.code;
  const msg = (error?.message ?? '') + (typeof error?.error === 'object' ? JSON.stringify(error.error) : '');
  return (
    status === 503 || status === 502 || status === 504 ||
    msg.includes('503') || msg.includes('502') || msg.includes('504') ||
    msg.includes('UNAVAILABLE') || msg.includes('currently unavailable')
  );
}

/** Retry an async operation on 503/502/504 with exponential backoff (for simulation resilience). */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxRetries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      console.warn(`Gemini API temporarily unavailable, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function runBusinessProfileGeneration(
  documentInput: string,
  mimeType: string | undefined,
  prompt: string
): Promise<string | object> {
  const hasFile = Boolean(mimeType && documentInput);
  if (hasFile) {
    let base64Data: string = documentInput;
    if (documentInput.includes(',')) base64Data = documentInput.split(',')[1];
    if (!base64Data?.trim()) throw new Error('Invalid file data.');
    return await geminiService.runSimulation(prompt, base64Data, mimeType!);
  }
  const fullPrompt = `${prompt}\n\nDOCUMENT CONTENT:\n${truncate(documentInput, 100000)}`;
  return await geminiService.generateBasic(fullPrompt, true);
}

function normalizeBusinessProfileResult(rawResult: string | object, keys: string[]): Record<string, string | null> {
  const parsed = typeof rawResult === 'string'
    ? (() => {
        const cleaned = rawResult.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1').trim();
        try {
          return JSON.parse(cleaned);
        } catch {
          return JSON.parse(rawResult);
        }
      })()
    : rawResult;
  const result: Record<string, string | null> = {};
  for (const k of keys) {
    const v = parsed[k];
    result[k] = v === undefined || v === null ? null : String(v).trim() || null;
  }
  return result;
}

export const geminiService = {
  generateBasic: async (prompt: string, isJson: boolean = false): Promise<any> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: truncate(prompt, MAX_PART_CHARS),
      });
      const text = response.text || "";
      return isJson ? extractJson(text) : text;
    } catch (error: any) {
      console.error('Gemini API error details:', {
        message: error?.message,
        status: error?.status,
        statusCode: error?.statusCode,
        code: error?.code,
        fullError: error
      });
      
      // Check if it's a 404 error
      if (error?.status === 404 || error?.statusCode === 404 || error?.message?.includes('404') || error?.code === 404) {
        throw new Error(`Gemini API 404 Error: Model not found. Available models include: gemini-2.5-flash, gemini-2.5-pro\n\nThis could mean:\n1. The model name is incorrect\n2. Your API key doesn't have access to this model\n3. The API endpoint is incorrect\n\nPlease verify your API key at https://aistudio.google.com/apikey\n\nFull error: ${error?.message || JSON.stringify(error)}`);
      }
      
      // Check if it's a quota/rate limit error
      if (error?.status === 429 || error?.statusCode === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('free_tier')) {
          throw new Error(`Free Tier Quota Exceeded: You've reached the daily limit of 20 requests per day for the Gemini API free tier.\n\nOptions:\n1. Wait until the quota resets (daily limit)\n2. Upgrade to a paid API key for higher limits\n\nCheck your usage: https://aistudio.google.com/app/apikey\n\nFull error: ${errorMsg}`);
        }
        throw new Error(`Rate Limit Exceeded: ${errorMsg}\n\nPlease retry after the specified delay.`);
      }
      
      throwIfServiceUnavailable(error, 'Failed to generate content.');
      throw new Error(`Gemini API error: ${error?.message || 'Failed to generate content. Please check your API key and quota.'}`);
    }
  },

  /**
   * Generate a realistic full name for a persona (e.g. for a job title or "advisor").
   * Returns a single string "First Last". Uses AI so no fixed default name list.
   */
  generatePersonaName: async (context: string): Promise<string> => {
    const prompt = `Generate a plausible, invented full name (first and last name only) for a person who might have this role. Return only valid JSON: {"name": "First Last"}. The value for "name" must be a real-sounding human name (e.g. "Sarah Chen", "Marcus Webb"), never a job title or role (e.g. not "Project Lead", "Marketing Director", or "Advisor"). Context/role: ${context}`;
    try {
      const parsed = await geminiService.generateBasic(prompt, true);
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
      if (name.length > 0) return name;
    } catch (e) {
      console.warn('generatePersonaName failed, using generic fallback', e);
    }
    return 'Persona';
  },

  /**
   * Specifically for extracting raw facts from messy source data like LinkedIn text.
   */
  extractFacts: async (sourceData: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      TASK: Extract every specific professional fact from the following text.
      SOURCE: ${truncate(sourceData, 50000)}
      
      EXTRACT THE FOLLOWING:
      - Full Name and Current Title
      - Exact companies and years worked
      - Specific projects or achievements mentioned
      - Key skills and technologies
      - Educational background
      - Tone of voice used in their 'About' or posts
      
      RULES:
      - If the source is just a URL, state "NO TEXT DATA PROVIDED - ONLY A LINK".
      - Only list facts present in the text.
      - Do not hallucinate details.
    `;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || "No facts extracted.";
    } catch (error: any) {
      console.error('Gemini API error:', error);
      
      // Check if it's a quota/rate limit error
      if (error?.status === 429 || error?.statusCode === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('free_tier')) {
          throw new Error(`Free Tier Quota Exceeded: You've reached the daily limit of 20 requests per day.\n\nOptions:\n1. Wait until the quota resets (daily limit)\n2. Upgrade to a paid API key\n\nCheck usage: https://aistudio.google.com/app/apikey`);
        }
        throw new Error(`Rate Limit Exceeded: ${errorMsg}`);
      }
      
      throwIfServiceUnavailable(error, 'Failed to extract facts.');
      throw new Error(`Gemini API error: ${error?.message || 'Failed to extract facts. Please check your API key and quota.'}`);
    }
  },

  generateAvatar: async (name: string, title: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      // Return fallback avatar if API key is not configured
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=256&bold=true`;
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `A clean, high-quality 2D cartoon face avatar of a ${title} named ${name}. Modern flat design style, friendly professional expression, centered, solid soft-colored background, vibrant colors, simplified features.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) {
      console.error("Image generation failed", e);
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=256&bold=true`;
  },

  generateChain: async (templateContent: string, inputs: Record<string, string>, useExtendedThinking: boolean = false, temperature?: number): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
    // Always use gemini-2.5-flash since gemini-2.5-pro is not available on free tier
    const model = 'gemini-2.5-flash';
    
    let contextString = "";
    for (const [key, value] of Object.entries(inputs)) {
      contextString += `### SOURCE DATA [${key}]:\n${truncate(value, 100000)}\n\n`;
    }

    const prompt = `
      ROLE: High-Fidelity Persona Architect.
      
      STRICT REQUIREMENT: You are creating a persona based ON THE PROVIDED SOURCE DATA ONLY. 
      If a LinkedIn profile text is provided, you must capture the specific career path, 
      actual companies, and unique personality traits found in that text.
      
      DO NOT USE GENERIC ADVICE OR "PLACEHOLDER" CORPORATE SPEAK.
      
      TEMPLATE TO FILL:
      ${templateContent}
      
      RAW SOURCE DATA (THE ONLY SOURCE OF TRUTH):
      ${contextString}
      
      INSTRUCTIONS:
      1. Map the specific professional history from the SOURCE DATA into the template.
      2. If a fact is missing from the source, leave the template field minimal rather than inventing details.
      3. Capture the 'Voice' of the individual as evidenced by their writing style in the source.
      4. Output the full Markdown document.
    `;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        ...(temperature !== undefined && temperature !== null ? { config: { temperature } } : {}),
      });

      return response.text || "";
    } catch (error: any) {
      console.error('Gemini API error:', error);
      
      // Check if it's a quota/rate limit error
      if (error?.status === 429 || error?.statusCode === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('free_tier')) {
          throw new Error(`Free Tier Quota Exceeded: You've reached the daily limit of 20 requests per day for the Gemini API free tier.\n\nOptions:\n1. Wait until the quota resets (daily limit)\n2. Upgrade to a paid API key for higher limits\n3. Reduce the number of personas being generated\n\nCheck your usage: https://aistudio.google.com/app/apikey\n\nFull error: ${errorMsg}`);
        }
        throw new Error(`Rate Limit Exceeded: ${errorMsg}\n\nPlease retry after the specified delay.`);
      }
      
      throwIfServiceUnavailable(error, 'Failed to generate chain.');
      throw new Error(`Gemini API error: ${error?.message || 'Failed to generate chain. Please check your API key and quota.'}`);
    }
  },

  /**
   * Run a specialized simulation with optional multi-modal input.
   * Uses retry with exponential backoff on 503/502/504 for resilience.
   */
  runSimulation: async (prompt: string, imageData?: string, mimeType?: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    return withRetry(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [{ text: prompt }];

    if (imageData && mimeType) {
      // imageData should already be pure base64 (without data URL prefix)
      // But handle both cases: if it has a comma (data URL), extract base64; otherwise use as-is
      let base64Data: string;
      if (imageData.includes(',')) {
        base64Data = imageData.split(',')[1];
      } else {
        base64Data = imageData;
      }
      
      // Validate base64 data is not empty
      if (!base64Data || base64Data.trim().length === 0) {
        throw new Error('Invalid file data: base64 content is empty. Please ensure the file is valid and not corrupted.');
      }
      
      // Validate base64 format (basic check)
      if (!/^[A-Za-z0-9+/=]+$/.test(base64Data.replace(/\s/g, ''))) {
        throw new Error('Invalid file data: base64 format appears to be invalid. Please try uploading the file again.');
      }
      
      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts }
      });

      return response.text || "";
    } catch (error: any) {
      console.error('Gemini API error:', error);
      
      // Check for document/file errors (e.g. empty, invalid, unsupported type)
      if (error?.status === 400 || error?.code === 400 || error?.message?.includes('400')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('no pages') || errorMsg.includes('invalid') || errorMsg.includes('empty') || errorMsg.includes('Unsupported') || errorMsg.includes('MIME')) {
          throw new Error(`File Error: The document or file appears to be empty, corrupted, invalid, or an unsupported type.\n\nPlease ensure:\n1. The file is not corrupted\n2. The file type is supported (e.g. PDF, images, text)\n3. The file is not password-protected\n4. The file size is reasonable (under 20MB)\n\nOriginal error: ${errorMsg}`);
        }
        throw new Error(`Invalid Request: ${errorMsg}`);
      }
      
      // Check if it's a quota/rate limit error
      if (error?.status === 429 || error?.statusCode === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('free_tier')) {
          throw new Error(`Free Tier Quota Exceeded: Daily limit of 20 requests reached.\n\nOptions:\n1. Wait until quota resets\n2. Upgrade to paid API key\n\nCheck usage: https://aistudio.google.com/app/apikey`);
        }
        throw new Error(`Rate Limit Exceeded: ${errorMsg}`);
      }
      
      throwIfServiceUnavailable(error, 'Failed to run simulation.');
      throw new Error(`Gemini API error: ${error?.message || 'Failed to run simulation. Please check your API key and quota.'}`);
    }
    });
  },

  /**
   * Generate Company Overview section only (one API call).
   * Fields: business_name, mission_statement, vision_statement, description_main_offerings,
   * key_features_or_benefits, unique_selling_proposition, pricing_model, website.
   */
  generateBusinessProfileCompanyOverview: async (
    documentInput: string,
    options: { mimeType?: string; companyHint?: string } = {}
  ): Promise<Record<string, string | null>> => {
    const keys = ['business_name', 'mission_statement', 'vision_statement', 'description_main_offerings', 'key_features_or_benefits', 'unique_selling_proposition', 'pricing_model', 'website'];
    const hintSection = options.companyHint?.trim()
      ? `\nThe user also provided this company identifier: "${options.companyHint.trim()}". Use your knowledge of this company to enrich where the document does not specify.`
      : '';
    const prompt = `You are an expert at extracting structured business information from documents and public knowledge.

TASK: Fill in ONLY the Company Overview section from the provided document${options.companyHint?.trim() ? ' and from your knowledge of the company' : ''}.${hintSection}

OUTPUT FORMAT: Respond with a single JSON object only. No markdown, no code fence, no explanation. Use exactly these keys (use null for any missing value):
${keys.join(', ')}

RULES:
- Extract and infer from the document; for public companies you may use known facts to fill gaps.
- Keep each value concise but informative.
- If a field cannot be determined, use null for that key.
- Output only the JSON object.`;

    const rawResult = await runBusinessProfileGeneration(documentInput, options.mimeType, prompt);
    return normalizeBusinessProfileResult(rawResult, keys);
  },

  /**
   * Generate Market & Positioning section only (one API call).
   * Includes customer_segments generated using the customer profile template.
   * Fields: customer_segments, geographic_focus, industry_served, what_differentiates, market_niche, distribution_channels.
   */
  generateBusinessProfileMarketPositioning: async (
    documentInput: string,
    options: { mimeType?: string; companyHint?: string } = {}
  ): Promise<Record<string, string | null>> => {
    const keys = ['customer_segments', 'geographic_focus', 'industry_served', 'what_differentiates', 'market_niche', 'distribution_channels'];
    const hintSection = options.companyHint?.trim()
      ? `\nThe user also provided this company identifier: "${options.companyHint.trim()}". Use your knowledge of this company to enrich where the document does not specify.`
      : '';
    const prompt = `You are an expert at extracting structured business information from documents and public knowledge.

TASK: Fill in ONLY the Market & Positioning section from the provided document${options.companyHint?.trim() ? ' and from your knowledge of the company' : ''}.${hintSection}

IMPORTANT - Customer Segments: For "customer_segments", use the following customer profile template structure. Generate 2–4 target customer segments. Output the customer_segments value as a single text block (markdown or structured bullets).

Template structure to follow:
${customerSegmentTemplate}

OUTPUT FORMAT: Respond with a single JSON object only. No markdown code fence around the JSON, no explanation. Use exactly these keys (use null for any missing value):
${keys.join(', ')}

RULES:
- customer_segments must be written using the customer profile template structure above (identity, needs, behaviors, how we reach them).
- Keep each value concise but informative.
- If a field cannot be determined, use null for that key.
- Output only the JSON object.`;

    const rawResult = await runBusinessProfileGeneration(documentInput, options.mimeType, prompt);
    return normalizeBusinessProfileResult(rawResult, keys);
  },

  /**
   * Generate Performance & Funding section only (one API call).
   * Fields: key_personnel, major_achievements, revenue, key_performance_indicators, funding_rounds, revenue_streams.
   */
  generateBusinessProfilePerformanceFunding: async (
    documentInput: string,
    options: { mimeType?: string; companyHint?: string } = {}
  ): Promise<Record<string, string | null>> => {
    const keys = ['key_personnel', 'major_achievements', 'revenue', 'key_performance_indicators', 'funding_rounds', 'revenue_streams'];
    const hintSection = options.companyHint?.trim()
      ? `\nThe user also provided this company identifier: "${options.companyHint.trim()}". Use your knowledge of this company to enrich where the document does not specify.`
      : '';
    const prompt = `You are an expert at extracting structured business information from documents and public knowledge.

TASK: Fill in ONLY the Performance & Funding section from the provided document${options.companyHint?.trim() ? ' and from your knowledge of the company' : ''}.${hintSection}

OUTPUT FORMAT: Respond with a single JSON object only. No markdown, no code fence, no explanation. Use exactly these keys (use null for any missing value):
${keys.join(', ')}

RULES:
- Extract and infer from the document; for public companies you may use known facts (10-K, news) to fill gaps.
- Keep each value concise but informative.
- If a field cannot be determined, use null for that key.
- Output only the JSON object.`;

    const rawResult = await runBusinessProfileGeneration(documentInput, options.mimeType, prompt);
    return normalizeBusinessProfileResult(rawResult, keys);
  },

  /**
   * Generate a full business profile by making three separate API calls:
   * 1) Company Overview, 2) Market & Positioning (with customer profile template for segments), 3) Performance & Funding.
   * Returns merged partial BusinessProfile with snake_case keys.
   */
  generateBusinessProfileFromDocument: async (
    documentInput: string,
    options: { mimeType?: string; companyHint?: string } = {}
  ): Promise<Record<string, string | null>> => {
    const [company, market, performance] = await Promise.all([
      geminiService.generateBusinessProfileCompanyOverview(documentInput, options),
      geminiService.generateBusinessProfileMarketPositioning(documentInput, options),
      geminiService.generateBusinessProfilePerformanceFunding(documentInput, options),
    ]);
    const result: Record<string, string | null> = {};
    for (const obj of [company, market, performance]) {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) result[k] = v;
      }
    }
    return result;
  },

  /** Chat with retry on 503/502/504 for persona conversation resilience. */
  chat: async (systemPrompt: string, history: { role: 'user' | 'model', text: string }[], newMessage: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    return withRetry(async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...history.map(h => ({
            role: h.role,
            parts: [{ text: truncate(h.text, 20000) }]
          })),
          { role: 'user', parts: [{ text: truncate(newMessage, 20000) }] }
        ],
        config: {
          systemInstruction: truncate(systemPrompt, MAX_SYSTEM_CHARS),
        },
      });

      return response.text || "";
    } catch (error: any) {
      console.error('Gemini API error:', error);
      
      // Check if it's a quota/rate limit error
      if (error?.status === 429 || error?.statusCode === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        const errorMsg = error?.message || JSON.stringify(error);
        if (errorMsg.includes('free_tier')) {
          throw new Error(`Free Tier Quota Exceeded: Daily limit of 20 requests reached.\n\nOptions:\n1. Wait until quota resets\n2. Upgrade to paid API key\n\nCheck usage: https://aistudio.google.com/app/apikey`);
        }
        throw new Error(`Rate Limit Exceeded: ${errorMsg}`);
      }
      
      throwIfServiceUnavailable(error, 'Failed to generate chat response.');
      throw new Error(`Gemini API error: ${error?.message || 'Failed to generate chat response. Please check your API key and quota.'}`);
    }
    });
  },

  /**
   * Compute persuasion score (1-100) from a full conversation by sending it to the LLM.
   * Used after each persona response in persuasion simulations so the sidebar always shows a score.
   */
  computePersuasionScore: async (fullConversation: string): Promise<number> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are evaluating a persuasion conversation. The "persona" (the agent being persuaded) has been in a back-and-forth dialogue. Based on the conversation below, how persuaded is the persona on a scale of 1 to 100? Consider their stated position, willingness to agree, and any commitments or openness expressed.

Conversation:
${truncate(fullConversation, 50000)}

Respond with exactly one line in this format: Persuasion: N%
where N is an integer from 1 to 100. No other text.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = (response.text || '').trim();
    const parsed = parseLastPersuasionPercentFromText(text);
    if (parsed != null) return parsed;
    return 50; // fallback if parsing fails
  },

  /**
   * Generate a system prompt for a simulation from its full configuration.
   * Extracts intent, goals, and instructions from the user's description and
   * type-specific fields, then synthesizes a high-quality prompt while
   * preserving the required structured output format for the simulation type.
   */
  generateSystemPromptFromConfig: async (config: CreateSimulationRequest): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Set VITE_GEMINI_API_KEY to generate the system prompt with AI.');
    }
    const ai = new GoogleGenAI({ apiKey });
    const simType = config.simulation_type || 'report';
    const typeOutputSpec = SIMULATION_TYPE_OUTPUT_SPECS[simType];
    const typeSpecSection = typeOutputSpec
      ? `\n## MANDATORY OUTPUT FORMAT (do not change)\nThe simulation must produce exactly this kind of output. Your system prompt must enforce it:\n\n${typeOutputSpec}\n`
      : '';

    const typeConfig = config.type_specific_config || {};
    const isGeneratedSurvey =
      simType === 'survey' &&
      (typeConfig.survey_mode as string) === 'generated';
    const surveyQuestions = (typeConfig.survey_questions as Array<{ type: string; question: string; options?: string[] }>) || [];
    const hasSurveyQuestions = isGeneratedSurvey && surveyQuestions.length > 0;

    let surveyQuestionsSection = '';
    if (hasSurveyQuestions) {
      const lines: string[] = [
        '',
        '## MANDATORY: Survey questions in system prompt',
        'The generated system prompt MUST include the following survey questions section verbatim (exactly these questions in this order). Do not summarize or rephrase the questions—copy them into your system prompt output:',
        '',
        '### Survey questions (in order)',
      ];
      surveyQuestions.forEach((q, i) => {
        lines.push(`${i + 1}. [${q.type}] ${q.question}`);
        if (q.type === 'multiple_choice' && q.options?.length) {
          lines.push('   Options: ' + q.options.filter(Boolean).join(', '));
        }
      });
      lines.push('');
      surveyQuestionsSection = lines.join('\n');
    }

    // Omit icon so it is not passed to chat / included in the system prompt
    const { icon: _icon, ...configForPrompt } = config;

    const prompt = `You are an expert at turning product and simulation configs into clear, high-quality system prompts for AI personas.

## Your task
1. **Extract** meaning from the user's inputs: read the title, description, and every type-specific field (decision_point, decision_criteria, report_structure, profile_structure, survey_purpose, survey_questions, etc.). Infer:
   - The **purpose** and **goal** of the simulation (what the user wants to achieve).
   - **Tone and style** (e.g. professional, conversational, formal, advisory).
   - **Key instructions** the persona must follow (what to emphasize, what to avoid, how to use context).
   - **Domain and audience** (who the persona is addressing, in what context).
   - **Success criteria** (what "good" looks like for this simulation).
2. **Synthesize** a single system prompt that:
   - Opens with a clear, concise "what this simulation is" section that reflects the extracted purpose and goal (do not just paste the description verbatim—rephrase and sharpen it).
   - Includes an "how to behave" / "instructions for the persona" section built from the extracted instructions, tone, and success criteria.
   - Documents the template variables below exactly (so they can be replaced at runtime).
   - Ends with the MANDATORY OUTPUT FORMAT section so the persona knows the exact structure of the response (conversation only, report, persuasion percentage, etc.).

## Rules
- **Inputs vs persona (critical):** All template variables that are filled at runtime with user-provided content—{{BACKGROUND_INFO}}, {{OPENING_LINE}}, {{BUSINESSPROFILE}}, and every required_input_fields placeholder—are input from the **person running the simulation** (the user/client). For example: their business background, context, opening line, or other required fields. The **persona** is the synthetic character defined only by {{SELECTED_PROFILE}} and {{SELECTED_PROFILE_FULL}}. The persona uses the user's inputs to advise or respond; those inputs are not the persona's own background. The generated system prompt MUST state this distinction clearly so the AI never treats business background or other user inputs as if they were the persona's.
- **Do not** copy the description or config fields word-for-word. Interpret and extract; turn them into precise, actionable instructions.
- **The AI must respond ONLY as the persona**—never describe, reference, or embed the persona in the response (no "As the synthetic user...", "The persona would say...", or meta-commentary). The system prompt must state clearly that the AI answers AS IF they were the persona, in first person only.
- **Focus vs persona:** The **focus** of the simulation is always the **user's inputs** (whatever replaces the template variables: {{BACKGROUND_INFO}}, {{OPENING_LINE}}, {{BUSINESSPROFILE}}, or other required_input_fields). The **persona** is in the background: they use their profile ({{SELECTED_PROFILE_FULL}}) to inform perspective and assist in decision-making, but the analysis, report, or conversation must be centered on the **user's situation and inputs**, not the persona's own organization or story. The system prompt must state this clearly.
- **Do** document every required_input_fields entry as a template variable: {{FIELD_NAME}} (UPPERCASE), with type and name. These will be replaced at runtime.
- **Do** include the core variables: {{SELECTED_PROFILE}}, {{SELECTED_PROFILE_FULL}}, {{BACKGROUND_INFO}}. Use required_input_fields placeholders (e.g. {{FIELD_NAME}}) for user-provided content; do not require {{OPENING_LINE}}.
- **If the config includes a business_profile (or businessProfile) input field:** The system prompt MUST explicitly state that {{BUSINESSPROFILE}} is the **client's/user's business**—the company the persona is advising or analyzing—and that the persona must base their analysis (e.g. SWOT, report, recommendations) on that business only, not on their own organization.
- **Do** keep the same strict output behavior for this simulation type (see MANDATORY OUTPUT FORMAT). The persona's response format must match it exactly.
- **For survey simulations with survey_mode "generated":** The system prompt MUST include a "Survey questions (in order)" section listing every question from type_specific_config.survey_questions verbatim, in order, with type and (for multiple_choice) options. Do not summarize or omit any question.
- **If the config includes a survey_questions input field:** This means the person running the simulation will define their own survey questions at runtime. The system prompt MUST document the {{FIELD_NAME}} placeholder for that field and explain that it will contain the survey questions created by the runner (each question with its type and, for multiple choice, its options). The persona must use those runner-provided questions as the survey to answer, treating them the same way as admin-defined generated survey questions.
- Output ONLY the system prompt text. No preamble, no "Here is the prompt", no explanation.
${typeSpecSection}
${surveyQuestionsSection}

## Configuration from the user (extract from this)
\`\`\`json
${JSON.stringify(configForPrompt, null, 2)}
\`\`\`

Output only the system prompt text, nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: truncate(prompt, MAX_PART_CHARS),
    });
    const text = (response.text || '').trim();
    if (!text) throw new Error('AI did not return a system prompt.');
    return text;
  },

  /**
   * Persona v Persona: Moderator decides who speaks first.
   * Returns the persona_id (UUID string) of the chosen speaker.
   * Uses retry on 503/502/504 for resilience.
   */
  moderatorWhoSpeaksFirst: async (
    openingLine: string,
    personas: { id: string; name: string }[]
  ): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const list = personas.map((p) => `${p.name} (id: ${p.id})`).join('\n');
    const prompt = `You are a moderator for a structured conversation between multiple personas. The topic or opening line for the conversation is:

"${truncate(openingLine, 2000)}"

The following personas are available to speak. Choose exactly ONE persona to speak first. Consider who would naturally start this kind of discussion.

Personas:
${list}

Respond with a single JSON object only, no other text. Use this exact format:
{"persona_id": "<paste the id of the chosen persona>"}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = response.text || '';
    const parsed = extractJson(text);
    const id = parsed?.persona_id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Moderator did not return a valid persona_id. Please try again.');
    }
    return id.trim();
    });
  },

  /**
   * Persona v Persona: Moderator decides next speaker or end.
   * Returns { action: 'NEXT', persona_id } or { action: 'END' }.
   * Uses retry on 503/502/504 for resilience.
   */
  moderatorNextOrEnd: async (
    openingLine: string,
    personas: { id: string; name: string }[],
    conversation: { speakerName: string; content: string }[],
    personaTurnCount: number,
    maxTurns: number
  ): Promise<{ action: 'NEXT' | 'END'; persona_id?: string }> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const list = personas.map((p) => `${p.name} (id: ${p.id})`).join('\n');
    const convoText = conversation
      .map((m) => `${m.speakerName}: ${m.content}`)
      .join('\n\n');
    const mustEndHint =
      personaTurnCount >= maxTurns
        ? `\n\nIMPORTANT: The conversation has reached the maximum of ${maxTurns} persona turns. You MUST respond with {"action": "END"} and no further turns.`
        : '';
    const prompt = `You are a moderator for a structured conversation between multiple personas.

Opening line / topic:
"${truncate(openingLine, 2000)}"

Personas (id required in your response when choosing NEXT):
${list}

Conversation so far:
${truncate(convoText, 15000)}
${mustEndHint}

Decide either:
1. Continue: another persona should respond. Reply with JSON: {"action": "NEXT", "persona_id": "<id of the persona who should speak next>"}
2. End: the conversation is complete. Reply with JSON: {"action": "END"}

Respond with a single JSON object only. Do not choose the same persona who just spoke unless others have spoken in between.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const text = response.text || '';
    const parsed = extractJson(text);
    const action = parsed?.action === 'END' ? 'END' : 'NEXT';
    if (action === 'END') {
      return { action: 'END' };
    }
    const persona_id = typeof parsed?.persona_id === 'string' ? parsed.persona_id.trim() : undefined;
    if (!persona_id) {
      throw new Error('Moderator did not return a valid persona_id for NEXT. Please try again.');
    }
    return { action: 'NEXT', persona_id };
    });
  },

  /**
   * Persona v Persona: Moderator summarizes the conversation and answers the opening line.
   * Uses retry on 503/502/504 for resilience.
   */
  moderatorSummarize: async (
    openingLine: string,
    conversation: { speakerName: string; content: string }[]
  ): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
    }
    return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const convoText = conversation
      .map((m) => `${m.speakerName}: ${m.content}`)
      .join('\n\n');
    const prompt = `You are a moderator summarizing a conversation between personas.

Opening line / topic that the conversation addressed:
"${truncate(openingLine, 2000)}"

Full conversation:
${truncate(convoText, 30000)}

Provide:
1. A concise summary of the conversation (key points, agreements or disagreements, outcomes).
2. A direct answer or conclusion that addresses the opening line.

Write in clear paragraphs. No JSON. Output only the summary and answer.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return (response.text || '').trim() || 'No summary generated.';
    });
  },
};

