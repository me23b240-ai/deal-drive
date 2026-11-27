import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { dateNum, isRuleJson, type Metrics, type RuleJson } from "../../domain/rules-engine";
import { evaluateInitiative, type InitiativeRules } from "../../domain/initiatives";
import {
  cashTermsMetrics,
  dealDeskMetrics,
  experimentArms,
  laneMetrics,
  PLAN_START,
  type Experiment,
  type MetricSet,
} from "../../model/derive";
import { fetchAll, num } from "./page";
import { getBrandRows, getSignedDeals } from "./plan";
import { getDealDesk, getInitiativeFunnel } from "./views";

type Evaluation = ReturnType<typeof evaluateInitiative>;
type CodeArg = Parameters<typeof evaluateInitiative>[0];

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
  const [campaigns, funnel, desk, signed, brands, drafts, events] = await Promise.all([
    fetchAll<Record<string, unknown>>("campaigns", "id, source_id, name, scale_rule, change_rule, stop_rule", {
      event_id: ctx.eventId,
      kind: "initiative",
    }),
    getInitiativeFunnel(ctx),
    getDealDesk(ctx),
    getSignedDeals(ctx),
    getBrandRows(ctx),
    fetchAll<Record<string, unknown>>("email_drafts", "brand_id, personalised, status", { event_id: ctx.eventId }),
    fetchAll<Record<string, unknown>>("status_events", "brand_id, to_status", { event_id: ctx.eventId }),
  ]);

  const today = dateNum(ctx.todayIst);
  const deskRows = desk.map((r) => ({
    company: r.company,
    stage: String(r.stage),
    proposed_inr: num(r.proposed_inr),
    idle_bdays: num(r.idle_bdays),
    nudges: num(r.nudges),
  }));
  const draftRows = drafts.map((r) => ({ brand_id: String(r.brand_id), personalised: Boolean(r.personalised), status: String(r.status) }));
  const eventRows = events.map((r) => ({ brand_id: String(r.brand_id), to_status: String(r.to_status) }));

  const out: InitiativeStatus[] = [];
  for (const c of campaigns) {
    const campaignId = String(c.id);
    const code = String(c.source_id);
    let set: MetricSet = { metrics: { today }, counts: {} };
    let experiment: Experiment | null = null;

    if (code === "bet-1") {
      set = dealDeskMetrics(deskRows, today);
    } else if (code === "bet-2") {
      set = cashTermsMetrics(signed, PLAN_START, today);
    } else {
      set = laneMetrics(funnel.find((f) => f.initiative_id === campaignId), today);
      if (code === "bet-5") {
        const ids = new Set(brands.filter((b) => b.initiative_id === campaignId).map((b) => b.id));
        experiment = experimentArms(ids, draftRows, eventRows);
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
    }

    const rules: InitiativeRules = { scale: asRule(c.scale_rule), change: asRule(c.change_rule), stop: asRule(c.stop_rule) };
    const evaluation = evaluateInitiative(code as CodeArg, rules, set.metrics, set.counts);
    out.push({
      campaignId,
      code,
      name: String(c.name),
      badge: evaluation.badge,
      reason: evaluation.reason,
      evaluation,
      metrics: set.metrics,
      experiment,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}