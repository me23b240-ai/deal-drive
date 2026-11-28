import { GoogleGenAI } from "@google/genai";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export class GeminiUnavailable extends Error {}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/** One JSON-mode call with a single retry on rate limit or overload. Never logs the key. */
export async function generateJson(system: string, prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiUnavailable("GEMINI_API_KEY is not set.");
  const ai = new GoogleGenAI({ apiKey });
  const model = geminiModel();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.6 },
      });
      const text = res.text;
      if (!text) throw new Error("Empty response from the model.");
      return { text, model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const busy = /429|503|overload|unavailable|rate/i.test(message);
      if (attempt === 0 && busy) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new GeminiUnavailable(busy ? "The AI service is busy right now." : `The AI request failed: ${message.slice(0, 160)}`);
    }
  }
  throw new GeminiUnavailable("The AI service is busy right now.");
}