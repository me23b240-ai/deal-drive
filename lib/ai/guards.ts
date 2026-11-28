export const MAX_OPENING_WORDS = 90;
export type SuppliedFact = { id: string; fact: string };
export type GuardResult = { ok: true; opening: string; factsUsed: string[] } | { ok: false; reason: string };

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function numeralsIn(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

/** Server-side checks on what the model returned. A failure means retry once, then fall back to the generic opening. */
export function validateOpening(opening: unknown, factsUsed: unknown, supplied: SuppliedFact[], extraAllowedText = ""): GuardResult {
  if (typeof opening !== "string" || !opening.trim()) return { ok: false, reason: "The model returned an empty opening." };
  const text = opening.trim();
  if (/\n\s*\n/.test(text)) return { ok: false, reason: "The opening was more than one paragraph." };
  if (wordCount(text) > MAX_OPENING_WORDS) return { ok: false, reason: `The opening was longer than ${MAX_OPENING_WORDS} words.` };
  if (/https?:\/\/|www\./i.test(text)) return { ok: false, reason: "The opening contained a link." };

  const ids = Array.isArray(factsUsed) ? factsUsed.filter((x): x is string => typeof x === "string") : [];
  const known = new Set(supplied.map((f) => f.id));
  if (ids.some((id) => !known.has(id))) return { ok: false, reason: "The model cited a fact that was not supplied." };

  const haystack = `${supplied.map((f) => f.fact).join(" ")} ${extraAllowedText}`;
  const stray = numeralsIn(text).find((n) => !haystack.includes(n));
  if (stray) return { ok: false, reason: `The opening used a number (${stray}) that is not in the supplied facts.` };

  return { ok: true, opening: text, factsUsed: ids };
}