import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GEMINI_MODEL } from "../lib/ai/gemini";

config({ path: ".env.local" });

const TABLES = ["status_events", "weekly_targets", "fact_bank", "portfolio_gates"] as const;
const VIEWS = ["v_needs_update", "v_deal_desk", "v_initiative_funnel", "v_warmth_funnel"] as const;

function env(name: string): string | null {
  return process.env[name] ?? null;
}

async function relationExists(
  supabase: ReturnType<typeof createClient>,
  name: string,
): Promise<{ ok: boolean; detail: string }> {
  const { error } = await supabase.from(name).select("*", { head: true, count: "exact" }).limit(1);
  if (!error) return { ok: true, detail: "ok" };
  return { ok: false, detail: error.message };
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) {
    console.log("FAIL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (names only; values not printed)");
    process.exit(1);
  }

  const supabase = createClient(url, service, { auth: { persistSession: false } });
  const ping = await supabase.from("events").select("id", { head: true, count: "exact" }).limit(1);
  const connected = !ping.error || !/invalid api key|jwt|failed to fetch|enotfound/i.test(ping.error.message);

  console.log(connected ? "PASS connection" : `FAIL connection: ${ping.error?.message}`);

  let missing = 0;
  for (const table of TABLES) {
    const result = await relationExists(supabase, table);
    if (result.ok) console.log(`PASS table ${table}`);
    else {
      missing += 1;
      console.log(`FAIL table ${table}: ${result.detail}`);
    }
  }
  for (const view of VIEWS) {
    const result = await relationExists(supabase, view);
    if (result.ok) console.log(`PASS view ${view}`);
    else {
      missing += 1;
      console.log(`FAIL view ${view}: ${result.detail}`);
    }
  }

  const geminiKey = env("GEMINI_API_KEY");
  const model = env("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  if (!geminiKey) {
    console.log("FAIL gemini: GEMINI_API_KEY missing");
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model,
        contents: "Reply with the single word OK",
      });
      const text = response.text ?? "";
      console.log(`PASS gemini model=${model} chars=${text.length}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.log(`FAIL gemini model=${model}: ${message}`);
    }
  }

  if (!connected || missing > 0) {
    console.log("STOP: apply supabase/migrations/001_core.sql, 002_events_and_facts.sql, 003_views.sql in the Supabase SQL editor, then reply continue.");
    process.exit(1);
  }
  console.log("PASS schema 002/003 relations present");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
