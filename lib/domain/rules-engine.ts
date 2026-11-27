export type RuleOp = ">=" | "<=" | ">" | "<" | "=";
export type RuleClause = { m: string; op: RuleOp; v: number };
export type RuleJson = { all: RuleClause[] };

export function isRuleJson(value: unknown): value is RuleJson {
  if (!value || typeof value !== "object") return false;
  const all = (value as { all?: unknown }).all;
  if (!Array.isArray(all)) return false;
  return all.every(
    (clause) =>
      clause &&
      typeof clause === "object" &&
      typeof (clause as RuleClause).m === "string" &&
      typeof (clause as RuleClause).op === "string" &&
      typeof (clause as RuleClause).v === "number",
  );
}
