import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { getQualRows } from "./head-b-datalab";
import { fetchAll, num } from "./page";

type Row = Record<string, unknown>;

export type CampaignLine = {
  id: string;
  name: string;
  channel: string;
  reached: number;
  replied: number;
  positive: number;
  met: number;
  dealsCreated: number;
  proposals: number;
  signedDeals: number;
  signedValueInr: number;
  openPipelineInr: number;
  budgetInr: number;
  spendInr: number;
};

export type SizeStats = {
  signedDeals: number;
  totalInr: number;
  cashInr: number;
  inKindInr: number;
  inKindDeals: number;
  inKindShare: number | null;
  averageInr: number | null;
  cashAverageInr: number | null;
  medianInr: number | null;
  minInr: number | null;
  maxInr: number | null;
  days: { median: number; min: number; max: number } | null;
};

export type TargetLine = { label: string; metric: string; goal: number; actual: number | null; unit: "count" | "inr" };

export type BenchmarkData = {
  campaigns: CampaignLine[];
  stageMix: { stage: string; count: number }[];
  size: SizeStats;
  qualStatuses: { status: string; count: number }[];
  targets: TargetLine[];
  activations: number;
  totalBrands: number;
  totalDeals: number;
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

export async function getBenchmark(ctx: Ctx): Promise<BenchmarkData> {
  requireHead(ctx);
  const [funnel, deals, targets, acts, qual] = await Promise.all([
    fetchAll<Row>("v_funnel_by_campaign", "*", { event_id: ctx.eventId }),
    fetchAll<Row>(
      "deals",
      "id, campaign_id, stage, proposed_value_inr, signed_value_inr, signed_cash_inr, signed_in_kind_inr, created_at, stage_changed_at",
      { event_id: ctx.eventId },
    ),
    fetchAll<Row>("targets", "*", { event_id: ctx.eventId }),
    fetchAll<Row>("sponsor_activations", "id", { event_id: ctx.eventId }),
    getQualRows(ctx),
  ]);

  const signed = deals.filter((d) => d.stage === "partner_confirmed");
  const valueBy = new Map<string, number>();
  for (const d of signed) {
    const key = String(d.campaign_id ?? "");
    valueBy.set(key, (valueBy.get(key) ?? 0) + num(d.signed_value_inr));
  }

  const campaigns = funnel
    .map((r): CampaignLine => ({
      id: String(r.campaign_id),
      name: String(r.name),
      channel: String(r.channel ?? ""),
      reached: num(r.brands_reached),
      replied: num(r.brands_replied),
      positive: num(r.brands_positive),
      met: num(r.brands_met),
      dealsCreated: num(r.deals_created),
      proposals: num(r.proposals),
      signedDeals: num(r.signed_deals),
      signedValueInr: valueBy.get(String(r.campaign_id)) ?? 0,
      openPipelineInr: num(r.open_pipeline_inr),
      budgetInr: num(r.budget_inr),
      spendInr: num(r.spend_inr),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const stageCount = new Map<string, number>();
  for (const d of deals) stageCount.set(String(d.stage), (stageCount.get(String(d.stage)) ?? 0) + 1);

  const values = signed.map((d) => num(d.signed_value_inr));
  const cash = signed.reduce((t, d) => t + num(d.signed_cash_inr), 0);
  const inKind = signed.reduce((t, d) => t + num(d.signed_in_kind_inr), 0);
  const total = values.reduce((t, v) => t + v, 0);
  const cashDeals = signed.filter((d) => num(d.signed_cash_inr) > 0).length;
  const spans = signed
    .filter((d) => d.created_at && d.stage_changed_at)
    .map((d) => Math.round((Date.parse(String(d.stage_changed_at)) - Date.parse(String(d.created_at))) / 86_400_000));

  const size: SizeStats = {
    signedDeals: signed.length,
    totalInr: total,
    cashInr: cash,
    inKindInr: inKind,
    inKindDeals: signed.filter((d) => num(d.signed_in_kind_inr) > 0).length,
    inKindShare: total > 0 ? inKind / total : null,
    averageInr: signed.length ? total / signed.length : null,
    cashAverageInr: cashDeals ? cash / cashDeals : null,
    medianInr: median(values),
    minInr: values.length ? Math.min(...values) : null,
    maxInr: values.length ? Math.max(...values) : null,
    days: spans.length ? { median: median(spans) ?? 0, min: Math.min(...spans), max: Math.max(...spans) } : null,
  };

  const qualCount = new Map<string, number>();
  for (const q of qual) qualCount.set(q.status, (qualCount.get(q.status) ?? 0) + 1);
  const qualified = qualCount.get("qualified");

  const lines: TargetLine[] = [];
  for (const t of targets) {
    const label = String(t.version_label ?? t.scenario ?? "target");
    const add = (metric: string, goal: unknown, actual: number | null, unit: TargetLine["unit"]) => {
      if (goal !== null && goal !== undefined) lines.push({ label, metric, goal: num(goal), actual, unit });
    };
    add("Qualified brands", t.qualified_brands_goal, qualified ?? null, "count");
    add("Confirmed partnerships", t.confirmed_partnerships_goal, signed.length, "count");
    add("Signed value", t.signed_value_goal_inr, total, "inr");
    add("Cash collected", t.cash_collected_goal_inr, null, "inr");
  }

  return {
    campaigns,
    stageMix: [...stageCount.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
    size,
    qualStatuses: [...qualCount.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    targets: lines,
    activations: acts.length,
    totalBrands: qual.length,
    totalDeals: deals.length,
  };
}