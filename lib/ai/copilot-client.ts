import { GoogleGenAI } from "@google/genai";

/** The copilot's own Gemini client, so it does not depend on what lib/ai/gemini.ts exports. */
export function copilotClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing required env var GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

export function copilotModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

/** Optional second model, used when the first is overloaded or too slow. Set GEMINI_FALLBACK_MODEL in .env.local. */
export function copilotFallbackModel(): string | undefined {
  return process.env.GEMINI_FALLBACK_MODEL || undefined;
}