import { generateJson, GeminiUnavailable } from "./gemini";
import { validateOpening, MAX_OPENING_WORDS, type SuppliedFact } from "./guards";
import { genericOpening, type SequenceStep } from "../mail/template";

export type Fact = SuppliedFact;

export type OpeningInput = {
  step: SequenceStep;
  eventName: string;
  company: string;
  sector: string | null;
  channelLabel: string | null;
  contactRole: string | null;
  notes: string[];
  facts: Fact[];
  lastMailSentOn: string | null;
};

export type OpeningResult = {
  opening: string;
  factsUsed: string[];
  model: string | null;
  warning: string | null;
  usedAi: boolean;
};

const STEP_BRIEF: Record<SequenceStep, string> = {
  initial: "a first cold outreach email to a potential sponsor",
  follow_up_1: "a polite first follow-up to an earlier unanswered email. Do not repeat the first email; refer to it briefly",
  follow_up_2: "a short, gracious final follow-up (the last note in the sequence). No pressure, no guilt",
};

const SYSTEM = `You write ONLY the opening paragraph of a sponsorship outreach email for a college festival.
Rules:
- One paragraph, at most ${MAX_OPENING_WORDS} words. Warm, specific and natural.
- Use ONLY the company details and the numbered facts supplied. Do not invent anything about the company or the festival.
- Do not use any number unless it appears in the supplied facts.
- Mention at most one concrete deliverable that fits the company's sector.
- Never imply the company has sponsored, endorsed or partnered with us unless the supplied data says so.
- No links, no greeting line, no sign-off.
Return JSON only: {"opening": string, "facts_used": string[]} where facts_used lists the ids of the facts you used.`;

function buildPrompt(i: OpeningInput): string {
  const lines = [
    `Write ${STEP_BRIEF[i.step]}.`,
    `Event: ${i.eventName}`,
    `Company: ${i.company}`,
    i.sector ? `Sector: ${i.sector}` : "Sector: unknown",
    i.channelLabel ? `How we found them: ${i.channelLabel}` : "",
    i.contactRole ? `Recipient role: ${i.contactRole}` : "",
    i.lastMailSentOn ? `Our earlier email was sent on: ${i.lastMailSentOn}` : "",
    i.notes.length ? `Recent notes from our team:\n${i.notes.map((n) => `- ${n}`).join("\n")}` : "",
    i.facts.length ? `Facts you may use:\n${i.facts.map((f) => `- [${f.id}] ${f.fact}`).join("\n")}` : "No facts supplied: write from the company details only.",
  ];
  return lines.filter(Boolean).join("\n");
}

function parse(text: string): { opening: unknown; facts_used: unknown } | null {
  try {
    const obj: unknown = JSON.parse(text.replace(/```json|```/g, "").trim());
    return obj && typeof obj === "object" ? (obj as { opening: unknown; facts_used: unknown }) : null;
  } catch {
    return null;
  }
}

export async function generateOpening(input: OpeningInput): Promise<OpeningResult> {
  const fallback = (warning: string): OpeningResult => ({
    opening: genericOpening(input.step, input.eventName, input.company),
    factsUsed: [],
    model: null,
    warning,
    usedAi: false,
  });
  const prompt = buildPrompt(input);
  const allowedExtra = `${input.company} ${input.eventName}`;
  let lastReason = "The model output was not usable.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { text, model } = await generateJson(SYSTEM, prompt);
      const obj = parse(text);
      if (!obj) {
        lastReason = "The model did not return valid JSON.";
        continue;
      }
      const checked = validateOpening(obj.opening, obj.facts_used, input.facts, allowedExtra);
      if (checked.ok) return { opening: checked.opening, factsUsed: checked.factsUsed, model, warning: null, usedAi: true };
      lastReason = checked.reason;
    } catch (error) {
      const message = error instanceof GeminiUnavailable ? error.message : "The AI request failed.";
      return fallback(`${message} A generic opening was used instead. You can edit it.`);
    }
  }
  return fallback(`${lastReason} A generic opening was used instead. You can edit it.`);
}