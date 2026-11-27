import { dateNum, evalRule, ruleMetricNames, type Metrics, type RuleJson } from "./rules-engine";

export const INITIATIVES = ["bet-1", "bet-2", "bet-3", "bet-4", "bet-5"] as const;
export type InitiativeId = (typeof INITIATIVES)[number];

export type Badge = "SCALE" | "CHANGE" | "STOP" | "BEHIND" | "HOLD" | "TOO EARLY";
export type InitiativeRules = { scale: RuleJson | null; change: RuleJson | null; stop: RuleJson | null };
export type BadgeResult = { badge: Badge; reason: string };

export const BET1_SCALE_BY = "2026-12-11";

function show(names: string[], metrics: Metrics, counts: Record<string, string>): string {
  const parts = names
    .filter((n) => n !== "today")
    .map((n) => counts[n] ?? (metrics[n] === undefined ? `${n} unknown` : `${n} ${Number(metrics[n].toFixed(3))}`));
  return parts.join(", ");
}

function minOutreach(rules: InitiativeRules): number | null {
  const vals: number[] = [];
  for (const r of [rules.scale, rules.change, rules.stop]) {
    for (const c of r?.all ?? []) if (c.m === "outreached" && (c.op === ">=" || c.op === ">")) vals.push(c.v);
  }
  return vals.length ? Math.min(...vals) : null;
}

export function evaluateInitiative(
  code: string,
  rules: InitiativeRules,
  metrics: Metrics,
  counts: Record<string, string> = {},
): BadgeResult {
  const stop = evalRule(rules.stop, metrics);
  if (stop.met) return { badge: "STOP", reason: `Stop rule met: ${show(ruleMetricNames(rules.stop), metrics, counts) || "date rule reached"}.` };
  const change = evalRule(rules.change, metrics);
  if (change.met) return { badge: "CHANGE", reason: `Change rule met: ${show(ruleMetricNames(rules.change), metrics, counts)}.` };
  const scale = evalRule(rules.scale, metrics);
  if (scale.met) return { badge: "SCALE", reason: `Scale rule met: ${show(ruleMetricNames(rules.scale), metrics, counts)}.` };

  const today = metrics.today ?? 0;
  if (code === "bet-1" && today > dateNum(BET1_SCALE_BY) && (metrics.negotiating_count ?? 0) < 5) {
    return { badge: "BEHIND", reason: `Behind: ${metrics.negotiating_count ?? 0} negotiating, 5 needed by ${BET1_SCALE_BY}.` };
  }
  const need = minOutreach(rules);
  const out = metrics.outreached;
  if (need !== null && out !== undefined && out < need) {
    return { badge: "TOO EARLY", reason: `Too early: ${out} outreached, rules need ${need}.` };
  }
  const unknown = [stop, change, scale].flatMap((r) => r.clauses.filter((c) => c.met === null).map((c) => c.clause.m));
  const tail = unknown.length ? ` Insufficient data for: ${[...new Set(unknown)].join(", ")}.` : "";
  const all = [...new Set([...ruleMetricNames(rules.scale), ...ruleMetricNames(rules.change), ...ruleMetricNames(rules.stop)])];
  return { badge: "HOLD", reason: `No rule met: ${show(all, metrics, counts) || "no data yet"}.${tail}` };
}