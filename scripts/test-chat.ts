import { config } from "dotenv";
import { missingSpecs } from "../lib/ai/tool-specs";

config({ path: ".env.local" });

const BASE = process.env.CHAT_URL ?? "http://localhost:3000";
type Reply = { reply: string; actions: unknown[]; trace: { tool: string; ok: boolean }[] };
type Case = { name: string; turns: string[]; expect: RegExp[]; forbid?: RegExp[]; tools?: string[]; wantAction?: boolean };

// Expected values assume the untouched Saarang seed (SIM): base cash 14.9L, 7 Dec base gate 13.2L.
const CASES: Case[] = [
  { name: "grounded: gates", turns: ["Are we on track against the 7 Dec gate?"], expect: [/gate/i, /base/i], tools: ["get_gates_status"] },
  { name: "what-if: prefest 65%", turns: ["What happens to base cash if pre-fest share drops to 65%?"], expect: [/12\.9/], tools: ["run_projection"] },
  { name: "calculation", turns: ["If open prospects close at 30% instead of 25%, how much more signed value is that?"], expect: [/\d/], tools: ["calculate"] },
  { name: "unanswerable: spend per channel", turns: ["What was CampusFest's cost per signed deal by channel?"], expect: [/(no|not|cannot|can't|doesn't|missing)/i], forbid: [/₹\s?\d/] },
  { name: "unanswerable: attendance", turns: ["How many students will attend Saarang?"], expect: [/(no|not|cannot|can't|doesn't)/i], forbid: [/\b\d{2,3},\d{3}\b/] },
  { name: "follow-up uses context", turns: ["Which channel converted best at CampusFest?", "And how many outreach attempts did it take?"], expect: [/\d/], tools: ["get_campaign_funnel_historical"] },
  { name: "action proposal", turns: ["Propose a nudge on the largest idle open deal."], expect: [/./], wantAction: true },
];

async function ask(messages: { role: string; content: string }[]): Promise<Reply> {
  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "head", messages }) });
  const json = (await res.json()) as { ok: boolean; data?: Reply; error?: string };
  if (!json.ok || !json.data) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data;
}

async function main() {
  const missing = missingSpecs();
  if (missing.length) {
    console.error(`FAIL specs missing for: ${missing.join(", ")}`);
    process.exit(1);
  }
  let failed = 0;
  for (const c of CASES) {
    const history: { role: string; content: string }[] = [];
    let last: Reply | null = null;
    try {
      for (const turn of c.turns) {
        history.push({ role: "user", content: turn });
        last = await ask(history);
        history.push({ role: "assistant", content: last.reply });
      }
      const r = last as Reply;
      const problems: string[] = [];
      for (const re of c.expect) if (!re.test(r.reply)) problems.push(`missing ${re}`);
      for (const re of c.forbid ?? []) if (re.test(r.reply)) problems.push(`forbidden ${re}`);
      for (const t of c.tools ?? []) if (!r.trace.some((x) => x.tool === t)) problems.push(`tool not used: ${t}`);
      if (c.wantAction && r.actions.length === 0) problems.push("no action proposed");
      if (problems.length) {
        failed += 1;
        console.log(`FAIL ${c.name}: ${problems.join("; ")}\n  -> ${r.reply.slice(0, 240).replace(/\n/g, " ")}`);
      } else console.log(`PASS ${c.name}`);
    } catch (e) {
      failed += 1;
      console.log(`FAIL ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(failed === 0 ? "\nAll chat checks passed." : `\n${failed} chat check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();