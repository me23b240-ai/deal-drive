import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";

config({ path: ".env.local" });

// Usage: npx tsx scripts/ping-model.ts <model-name> [more model names...]
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");
  const ai = new GoogleGenAI({ apiKey });
  const models = process.argv.slice(2);
  if (models.length === 0) models.push(process.env.GEMINI_MODEL ?? "gemini-3.8-flash");
  for (const model of models) {
    const t = Date.now();
    try {
      const r = await Promise.race([
        ai.models.generateContent({ model, contents: "Reply with the single word: ok" }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("no answer in 30s")), 30_000)),
      ]);
      console.log(`${model}: ${Date.now() - t} ms -> ${(r.text ?? "").trim().slice(0, 40)}`);
    } catch (e) {
      console.log(`${model}: FAILED after ${Date.now() - t} ms -> ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`);
    }
  }
}

void main();