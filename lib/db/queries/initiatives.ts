import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { toIstDate } from "../../domain/bizdays";
import { dateNum, isRuleJson, type Metrics, type RuleJson } from "../../domain/rules-engine";
import { evaluateInitiative, type InitiativeRules } from "../../domain/initiatives";
import { dealDeskMetrics, experimentArms, laneMetrics, type Experiment, type MetricSet } from "../../model/derive";
import { engineMetrics, introMetrics, mergeSets, mouLagMax, offerMetrics, type DealLite, type ItemLite } from "../../model/metrics-v2";
import { getHolidays } from "./holidays";
import { fetchAll, num } from "./page";
import { getBrandRows } from "./plan";
import { getAssumptions } from "./settings";
import { getDealDesk, getInitiativeFunnel } from "./views";

type Evaluation = ReturnType<typeof evaluateInitiative>;
type CodeArg = Parameters<typeof evaluateInitiative>[0];
type Row = Record<string, unknown>;

export type InitiativeStatus = {
  campaignId: string;
  code: string;
  name: string;
  badge: Evaluation["badge"];
  reason: Evaluation["reason"];
  evaluation: Evaluation;
  metrics: Metrics;
  experiment: Experiment | null;
};

const asRule = (value: unknown): RuleJson | null => (isRuleJson(value) ? value : null);

/** The five bets with their live badge. Rules come from campaigns.scale_rule / change_rule / stop_rule. */
export async function getInitiativeStatuses(ctx: Ctx): Promise<InitiativeStatus[]> {
  requireHead(ctx);
  const [campaigns, funnel, desk, brands, drafts, events, deals, items, asks, gives, cands, holidays] = await Promise.all([
    fetchAll<Row>("campaigns", "id, source_id, name, scale_rule, change_rule, stop_rule", { event_id: ctx.eventId, kind: "initiative" }),
    getInitiativeFunnel(ctx),
    getDealDesk(ctx),
    getBrandRows(ctx),
    fetchAll<Row>("email_drafts", "brand_id, personalised, status", { event_id: ctx.eventId }),
    fetchAll<Row>("status_events", "brand_id, to_status", { event_id: ctx.eventId }),
    fetchAll<Row>("deals", "id, stage, proposed_value_inr, signed_cash_inr, payment_terms, mou_sent_at, mou_signed_at, stage_changed_at", { event_id: ctx.eventId }),
    fetchAll<Row>("deal_items", "deal_id, is_ugc, category", {}),
    fetchAll<Row>("activities", "id", { event_id: ctx.eventId, event_type: "intro_ask" }),
    fetchAll<Row>("activities", "id", { event_id: ctx.eventId, event_type: "intro_given" }),
    fetchAll<Row>("lead_candidates", "status", { event_id: ctx.eventId }),
    getHolidays(ctx.eventId),
  ]);

  const today = dateNum(ctx.todayIst);
  const deadline = getAssumptions(ctx).early_bird_deadline;
  const deskRows = desk.map((r) => ({
    company: r.company,
    stage: String(r.stage),
    proposed_inr: num(r.proposed_inr),
    idle_bdays: num(r.idle_bdays),
    nudges: num(r.nudges),
  }));
  const draftRows = drafts.map((r) => ({ brand_id: String(r.brand_id), personalised: Boolean(r.personalised), status: String(r.status) }));
  const eventRows = events.map((r) => ({ brand_id: String(r.brand_id), to_status: String(r.to_status) }));

  const dealRows = deals.map((r): DealLite => ({
    id: String(r.id),
    stage: String(r.stage),
    proposedInr: num(r.proposed_value_inr),
    signedCashInr: num(r.signed_cash_inr),
    paymentTerms: (r.payment_terms as string | null) ?? null,
    confirmedOn:
      r.stage !== "partner_confirmed" ? null : r.mou_signed_at ? String(r.mou_signed_at) : r.stage_changed_at ? toIstDate(String(r.stage_changed_at)) : null,
  }));
  const dealIds = new Set(dealRows.map((d) => d.id));
  const itemRows = items
    .filter((r) => dealIds.has(String(r.deal_id)))
    .map((r): ItemLite => ({ dealId: String(r.deal_id), isUgc: Boolean(r.is_ugc), category: (r.category as string | null) ?? null }));
  const lag = mouLagMax(
    deals.map((r) => ({ stage: String(r.stage), mouSentAt: (r.mou_sent_at as string | null) ?? null })),
    ctx.todayIst,
    holidays,
  );
  const qualified = cands.filter((r) => r.status !== "duplicate" && r.status !== "not_fit").length;

  const out: InitiativeStatus[] = [];
  for (const c of campaigns) {
    const campaignId = String(c.id);
    const code = String(c.source_id);
    const lane = laneMetrics(funnel.find((f) => f.initiative_id === campaignId), today);
    let set: MetricSet = lane;
    let experiment: Experiment | null = null;

    if (code === "bet-1") {
      set = mergeSets(dealDeskMetrics(deskRows, today), {
        metrics: { mou_lag_bdays_max: lag },
        counts: { mou_lag_bdays_max: `longest unsigned MoU wait ${lag} business days` },
      });
    } else if (code === "bet-3") {
      set = offerMetrics(dealRows, itemRows, deadline, today);
    } else if (code === "bet-4") {
      set = mergeSets(lane, introMetrics(asks.length, gives.length));
    } else if (code === "bet-5") {
      const ids = new Set(brands.filter((b) => b.initiative_id === campaignId).map((b) => b.id));
      experiment = experimentArms(ids, draftRows, eventRows);
      set = mergeSets(lane, engineMetrics(qualified));
      set = {
        metrics: { ...set.metrics, personalised_vs_template_ratio: experiment.ratio },
        counts: {
          ...set.counts,
          personalised_vs_template_ratio:
            experiment.ratio === undefined
              ? `personalised ${experiment.personalised.n} sent vs template ${experiment.template.n} sent`
              : `personalised ${experiment.personalised.reached} of ${experiment.personalised.n} vs template ${experiment.template.reached} of ${experiment.template.n} reached proposal`,
        },
      };
    }

    const rules: InitiativeRules = { scale: asRule(c.scale_rule), change: asRule(c.change_rule), stop: asRule(c.stop_rule) };
    const evaluation = evaluateInitiative(code as CodeArg, rules, set.metrics, set.counts);
    out.push({ campaignId, code, name: String(c.name), badge: evaluation.badge, reason: evaluation.reason, evaluation, metrics: set.metrics, experiment });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}