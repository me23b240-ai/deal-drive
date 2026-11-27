export type RuleOp = ">=" | "<=" | ">" | "<" | "=";
export type RuleClause = { m: string; op: RuleOp; v: number };
export type RuleJson = { all: RuleClause[] };
export type Metrics = Record<string, number | undefined>;

export const RULE_METRICS = [
  "outreached",
  "response_rate",
  "proposal_rate",
  "prospective_or_better",
  "signed_deals",
  "negotiating_count",
  "top5_max_idle_bdays",
  "deals_idle_gt10_after_3_nudges",
  "inkind_share_new",
  "personalised_vs_template_ratio",
  "today",
] as const;

const OPS: RuleOp[] = [">=", "<=", ">", "<", "="];

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

export function validateRuleJson(value: unknown): string[] {
  if (value === null) return [];
  if (!isRuleJson(value)) return ["Rule must look like {\"all\": [{\"m\": metric, \"op\": op, \"v\": number}]}"];
  const errors: string[] = [];
  if (value.all.length === 0) errors.push("A rule needs at least one clause");
  value.all.forEach((c, i) => {
    if (!(RULE_METRICS as readonly string[]).includes(c.m)) errors.push(`Clause ${i + 1}: unknown metric "${c.m}"`);
    if (!OPS.includes(c.op)) errors.push(`Clause ${i + 1}: unknown operator "${c.op}"`);
    if (!Number.isFinite(c.v)) errors.push(`Clause ${i + 1}: value must be a finite number`);
  });
  return errors;
}

export function compare(op: RuleOp, a: number, b: number): boolean {
  switch (op) {
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">": return a > b;
    case "<": return a < b;
    default: return Math.abs(a - b) < 1e-9;
  }
}

export type ClauseResult = { clause: RuleClause; value: number | undefined; met: boolean | null };
export type RuleResult = { met: boolean | null; clauses: ClauseResult[] };

export function evalRule(rule: RuleJson | null | undefined, metrics: Metrics): RuleResult {
  if (!rule) return { met: false, clauses: [] };
  const clauses = rule.all.map((clause): ClauseResult => {
    const value = metrics[clause.m];
    const ok = value === undefined || Number.isNaN(value) ? null : compare(clause.op, value, clause.v);
    return { clause, value: ok === null ? undefined : value, met: ok };
  });
  if (clauses.some((c) => c.met === false)) return { met: false, clauses };
  if (clauses.some((c) => c.met === null)) return { met: null, clauses };
  return { met: true, clauses };
}

export function ruleMetricNames(rule: RuleJson | null | undefined): string[] {
  return rule ? [...new Set(rule.all.map((c) => c.m))] : [];
}

export function dateNum(iso: string): number {
  return Number(iso.replace(/-/g, ""));
}

export function clauseText(c: RuleClause): string {
  return `${c.m} ${c.op} ${c.v}`;
}