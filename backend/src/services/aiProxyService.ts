import { GoogleGenAI } from '@google/genai';

const CHAT_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('${') || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY is not configured. Set a valid key in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}... [truncated]` : text;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {
      // fall through
    }
    // Be permissive: callers can apply defaults if keys are missing.
    return {};
  }
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('"code":503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableGeminiError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      const delayMs = 1000 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export async function generateBasic(prompt: string, isJson = false): Promise<any> {
  const ai = getAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: truncate(prompt, 500_000),
      ...(isJson ? { config: { responseMimeType: 'application/json' } } : {}),
    })
  );
  const text = response.text || '';
  return isJson ? parseJson(text) : text;
}

export async function generateChain(
  templateContent: string,
  inputs: Record<string, string>,
  temperature?: number
): Promise<string> {
  const ai = getAI();
  const sourceContext = Object.entries(inputs)
    .map(([k, v]) => `### SOURCE [${k}]\n${truncate(v, 100_000)}`)
    .join('\n\n');
  const prompt = `Fill this template using only the source data.\n\nTemplate:\n${templateContent}\n\n${sourceContext}\n\nReturn the completed markdown.`;
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
      ...(typeof temperature === 'number' ? { config: { temperature } } : {}),
    })
  );
  return response.text || '';
}

export async function extractFacts(sourceData: string): Promise<string> {
  const ai = getAI();
  const prompt = `Extract factual professional details from this text. No guessing.\n\n${truncate(sourceData, 100_000)}`;
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
    })
  );
  return response.text || '';
}

export async function runSimulation(prompt: string, imageData?: string, mimeType?: string): Promise<string> {
  const ai = getAI();
  const parts: any[] = [{ text: truncate(prompt, 500_000) }];
  if (imageData && mimeType) {
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    parts.push({ inlineData: { data: base64Data, mimeType } });
  }
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: { parts },
    })
  );
  return response.text || '';
}

export async function generatePersonaName(context: string, excludedNames: string[] = []): Promise<string> {
  const parsed = await generateBasic(
    `Generate one realistic full name for: ${context}. Avoid: ${excludedNames.join(', ')}. Output JSON {"name":"First Last"}.`,
    true
  );
  const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
  return name || 'Persona';
}
