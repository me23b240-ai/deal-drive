import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";

config({ path: ".env.local" });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");
  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list();
  const names: string[] = [];
  for await (const m of pager) {
    if (m.name && (m.supportedActions ?? []).includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
  }
  console.log("Models that support generateContent on your key:\n");
  for (const n of names.sort()) console.log(`  ${n}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});