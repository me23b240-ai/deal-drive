import { getServiceClient } from "../client";
import { NotFoundError, ValidationError } from "../errors";
import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { toIstDate } from "../../domain/bizdays";
import { clauseText, isRuleJson } from "../../domain/rules-engine";
import type { Badge } from "../../domain/initiatives";
import type { Experiment } from "../../model/derive";
import { getInitiativeStatuses } from "./initiatives";
import { fetchAll, num } from "./page";
import { getPlanModel } from "./plan";
import { listTeam } from "./team";

type Row = Record<string, unknown>;

// Fallback concept text from the plan, used when campaigns.concept is empty.
const CONCEPTS: Record<string, string> = {
  "bet-1": "Closing squad (head plus closers) on the open prospects: custom slab within 1 business day, MoU the same day as the yes, daily 15-minute stand-up.",
  "bet-2": "Cash-first terms: 75/25 by default, in-kind capped, discounted club-title and stall bundles only after the bundle start date.",
  "bet-3": "Warm renewals: source more past-sponsor and other-fest leads, work the warm queue first, sector hooks from the fact bank.",
  "bet-4": "Lineup-triggered pitch to artist-linked brands using the announced headliners.",
  "bet-5": "Capped cold test on other-channel leads: personalised vs template opening, with a hard stop.",
};

const asNum = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const asText = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const asDate = (v: unknown): string | null => {
  const t = asText(v);
  return t ? toIstDate(t) : null;
};
const ruleLines = (v: unknown): string[] => (isRuleJson(v) ? v.all.map(clauseText) : []);

function toLines(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === "object" && v ? [JSON.stringify(v)] : [String(v)]));
  if (typeof value === "object") {
    return Object.entries(value as Row).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return [String(value)];
}

export type InitiativeCardData = {
  campaignId: string;
  code: string;
  name: string;
  badge: Badge;
  reason: string;
  concept: string | null;
  owner: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetInr: number;
  spendInr: number;
  status: string;
  kpis: string[];
  expectedInr: number | null;
  liveInr: number | null;
  rules: { scale: string[]; change: string[]; stop: string[] };
};

export type InitiativeBoard = {
  cards: InitiativeCardData[];
  experiment: Experiment | null;
  totalBudgetInr: number;
  totalSpendInr: number;
};

export async function getInitiativeBoard(ctx: Ctx): Promise<InitiativeBoard> {
  requireHead(ctx);
  const [statuses, rows, model, team] = await Promise.all([
    getInitiativeStatuses(ctx),
    fetchAll<Row>(
      "campaigns",
      "id, source_id, owner_id, planned_start, planned_end, budget_inr, spend_inr, status, concept, kpis, expected_stretch_cash_inr, scale_rule, change_rule, stop_rule",
      { event_id: ctx.eventId, kind: "initiative" },
    ),
    getPlanModel(ctx),
    listTeam(ctx.eventId),
  ]);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  const cards = statuses.map((s): InitiativeCardData => {
    const row: Row = byId.get(s.campaignId) ?? {};
    const ownerId = asText(row.owner_id);
    return {
      campaignId: s.campaignId,
      code: s.code,
      name: s.name,
      badge: s.badge,
      reason: s.reason,
      concept: asText(row.concept) ?? CONCEPTS[s.code] ?? null,
      owner: ownerId ? (nameOf.get(ownerId) ?? null) : null,
      startDate: asDate(row.planned_start),
      endDate: asDate(row.planned_end),
      budgetInr: num(row.budget_inr),
      spendInr: num(row.spend_inr),
      status: asText(row.status) ?? "active",
      kpis: toLines(row.kpis),
      expectedInr: asNum(row.expected_stretch_cash_inr),
      liveInr: model.attribution.rows.find((a) => a.bet === s.code)?.cashOverFloor ?? null,
      rules: { scale: ruleLines(row.scale_rule), change: ruleLines(row.change_rule), stop: ruleLines(row.stop_rule) },
    };
  });

  return {
    cards,
    experiment: statuses.find((s) => s.code === "bet-5")?.experiment ?? null,
    totalBudgetInr: cards.reduce((t, c) => t + c.budgetInr, 0),
    totalSpendInr: cards.reduce((t, c) => t + c.spendInr, 0),
  };
}

export type InitiativePatch = { budget?: number | undefined; spend?: number | undefined; status?: string | undefined };

/** Budget, spend and status only (all real columns on campaigns). */
export async function updateInitiative(ctx: Ctx, campaignId: string, patch: InitiativePatch): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  const supabase = getServiceClient();
  const found = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .eq("event_id", ctx.eventId)
    .eq("kind", "initiative")
    .maybeSingle();
  if (found.error) throw new Error(`campaigns: ${found.error.message}`);
  if (!found.data) throw new NotFoundError("Initiative not found");

  const update: Row = {};
  if (patch.budget !== undefined) update.budget_inr = Math.round(patch.budget);
  if (patch.spend !== undefined) update.spend_inr = Math.round(patch.spend);
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) throw new ValidationError("Nothing to update");

  const res = await supabase.from("campaigns").update(update).eq("id", campaignId).eq("event_id", ctx.eventId);
  if (res.error) throw new Error(`campaigns: ${res.error.message}`);
}