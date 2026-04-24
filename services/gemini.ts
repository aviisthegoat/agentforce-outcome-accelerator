
import { GoogleGenAI } from "@google/genai";

const MAX_PART_CHARS = 500000;
const MAX_SYSTEM_CHARS = 200000;

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

export const geminiService = {
  generateBasic: async (prompt: string, isJson: boolean = false): Promise<any> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: truncate(prompt, MAX_PART_CHARS),
    });
    const text = response.text || "";
    return isJson ? extractJson(text) : text;
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
      model: 'gemini-1.5-flash',
      contents: prompt,
    });
    return response.text || "No facts extracted.";
  },

  generateAvatar: async (name: string, title: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `A clean, high-quality 2D cartoon face avatar of a ${title} named ${name}. Modern flat design style, friendly professional expression, centered, solid soft-colored background, vibrant colors, simplified features.`;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
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

  generateChain: async (templateContent: string, inputs: Record<string, string>, useExtendedThinking: boolean = false): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = useExtendedThinking ? 'gemini-3-pro-preview' : 'gemini-1.5-flash';
    
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
      ...(useExtendedThinking ? { config: { thinkingConfig: { thinkingBudget: 24576 } } } : {})
    });

    return response.text || "";
  },

  /**
   * Run a specialized simulation with optional multi-modal input
   */
  runSimulation: async (prompt: string, imageData?: string, mimeType?: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const parts: any[] = [{ text: prompt }];

    if (imageData && mimeType) {
      parts.push({
        inlineData: {
          data: imageData.split(',')[1],
          mimeType: mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: { parts }
    });

    return response.text || "";
  },

  chat: async (systemPrompt: string, history: { role: 'user' | 'model', text: string }[], newMessage: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
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
  }
};
