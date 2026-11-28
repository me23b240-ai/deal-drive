import type { Content, GoogleGenAI, Part } from "@google/genai";
import type { Ctx } from "@/lib/types";
import { copilotClient, copilotFallbackModel, copilotModel } from "@/lib/ai/copilot-client";
import { ungroundedNumbers } from "@/lib/ai/grounding";
import { systemPrompt } from "@/lib/ai/system-prompt";
import { specsFor } from "@/lib/ai/tool-specs";
import { executeTool } from "@/lib/ai/tool-impl";
import type { ProposedAction } from "@/lib/ai/actions";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatResult = { reply: string; actions: ProposedAction[]; trace: { tool: string; ok: boolean }[] };

const MAX_STEPS = 6;
const STEP_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 55_000;

const isAction = (v: unknown): v is ProposedAction =>
  !!v && typeof v === "object" && typeof (v as ProposedAction).id === "string" && typeof (v as ProposedAction).kind === "string" && typeof (v as ProposedAction).summary === "string";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} took longer than ${Math.round(ms / 1000)} seconds.`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}


type GenParams = Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">;

/** Tries the main model, then the fallback (or the same model once more) when the failure looks like overload or slowness. */
async function generate(ai: GoogleGenAI, models: string[], params: GenParams) {
  let lastError: Error = new Error("The AI model failed.");
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i] as string;
    try {
      return await withTimeout(ai.models.generateContent({ ...params, model }), STEP_TIMEOUT_MS, "The AI model");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.log(`[copilot] model ${model} failed: ${lastError.message.slice(0, 200)}`);
      const transient = /429|503|overload|high demand|unavailable|longer than|rate/i.test(lastError.message);
      if (!transient || i === models.length - 1) throw lastError;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastError;
}

export async function runChat(ctx: Ctx, history: ChatTurn[]): Promise<ChatResult> {
  const started = Date.now();
  const ai = copilotClient();
  const model = copilotModel();
  const models = [model, copilotFallbackModel() ?? model];
  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
  const facts: string[] = [ctx.todayIst, ...history.map((t) => t.content)];
  const actions: ProposedAction[] = [];
  const trace: ChatResult["trace"] = [];
  const tools = [{ functionDeclarations: specsFor(ctx.role) }];
  let checked = false;

  console.log(`[copilot] start model=${model} role=${ctx.role} turns=${history.length}`);

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      console.log("[copilot] total budget exceeded");
      return { reply: "That took too long, so I stopped. Try a narrower question, or ask again in a moment.", actions, trace };
    }
    const t0 = Date.now();
    const res = await generate(ai, models, { contents, config: { systemInstruction: systemPrompt(ctx), temperature: 0.2, tools } });
    const modelContent = res.candidates?.[0]?.content;
    const calls = res.functionCalls ?? [];
    console.log(`[copilot] step ${step + 1} ${Date.now() - t0}ms calls=[${calls.map((c) => c.name).join(", ")}] textChars=${(res.text ?? "").length}`);

    if (calls.length > 0) {
      if (modelContent) contents.push(modelContent);
      const parts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const t1 = Date.now();
        const out = await executeTool(ctx, name, (call.args ?? {}) as Record<string, unknown>);
        console.log(`[copilot]   tool ${name} ok=${out.ok} ${Date.now() - t1}ms${out.ok ? "" : ` error=${out.error}`}`);
        trace.push({ tool: name, ok: out.ok });
        facts.push(JSON.stringify(out));
        if (out.ok && isAction(out.data)) actions.push(out.data);
        parts.push({ functionResponse: { name, response: out.ok ? { output: out.data } : { error: out.error } } });
      }
      contents.push({ role: "user", parts });
      continue;
    }

    let text = (res.text ?? "").trim();
    const bad = ungroundedNumbers(text, facts);
    if (bad.length > 0 && !checked) {
      checked = true;
      console.log(`[copilot] numeral check failed: ${bad.join(", ")}`);
      contents.push(modelContent ?? { role: "model", parts: [{ text }] });
      contents.push({
        role: "user",
        parts: [{ text: `Check before answering: these numbers are not in any tool result or in the conversation: ${bad.join(", ")}. Fetch the data or use the calculate tool for them. If you cannot support them, remove them and say what is unknown.` }],
      });
      continue;
    }
    if (bad.length > 0) text += `\n\nUnverified figures (not found in tool results): ${bad.join(", ")}.`;
    console.log(`[copilot] done in ${Date.now() - started}ms`);
    return { reply: text || "I could not produce an answer from the data.", actions, trace };
  }
  console.log("[copilot] ran out of steps");
  return { reply: "I ran out of steps before finishing. Ask me a narrower question.", actions, trace };
}