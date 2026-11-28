import { NotFoundError, ValidationError, errorMessage } from "@/lib/db/errors";
import { formatInr, formatLakh } from "@/lib/domain/money";
import type { Ctx } from "@/lib/types";
import { getOverviewData } from "@/lib/db/queries/head-a-overview";
import { getInitiativeBoard } from "@/lib/db/queries/head-a-initiatives";
import { getPlanView } from "@/lib/db/queries/head-a-plan";
import { getTeamTable } from "@/lib/db/queries/head-a-team";
import { getDealBoard } from "@/lib/db/queries/head-b-deals";
import { getInventory } from "@/lib/db/queries/head-b-inventory";
import { getPaymentsData } from "@/lib/db/queries/head-b-payments";
import { suggestSlab } from "@/lib/db/queries/head-b-slab";
import { listCompanies, type CrmFilters } from "@/lib/db/queries/crm-companies";
import { getCompanyDetail } from "@/lib/db/queries/crm-detail";
import { getInitiativeStatuses } from "@/lib/db/queries/initiatives";
import { getHeadKpis } from "@/lib/db/queries/overview";
import { getGateReport, getLeadSupply, getPlanModel } from "@/lib/db/queries/plan";
import { getTeamGoals } from "@/lib/db/queries/settings";
import { getChannelFunnel, getDealDesk, getNeedsUpdate, getWarmthFunnel } from "@/lib/db/queries/views";
import { getTeamWeekSummary, getWeeklyStrip } from "@/lib/db/queries/weekly";
import { COORDINATOR_TOOLS } from "@/lib/ai/tool-specs";
import { proposeFollowUp, proposeNudge, proposeTask } from "@/lib/ai/actions";

type Args = Record<string, unknown>;
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

const HISTORICAL_EVENT = "campusfest-2025";
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numArg = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const limitOf = (v: unknown, dflt = 15): number => Math.max(1, Math.min(50, Math.round(numArg(v) ?? dflt)));
const cap = <T>(rows: T[], n: number) => ({ total: rows.length, shown: Math.min(rows.length, n), rows: rows.slice(0, n) });

/** Adds _lakh and _pct strings next to raw numbers so the model quotes tool-provided figures. */
function enrich(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(enrich);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = enrich(v);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (/inr|cash|signed|floor|amount|value|base|stretch/i.test(k) && Math.abs(v) >= 100_000) out[`${k}_lakh`] = formatLakh(v);
      else if (/rate|share|ratio|pct/i.test(k) && v >= 0 && v <= 1) out[`${k}_pct`] = `${Math.round(v * 1000) / 10}%`;
    }
    return out;
  }
  return value;
}

function projectionPatch(a: Args): Record<string, unknown> {
  const rate = (k: string): number | undefined => {
    const v = numArg(a[k]);
    if (v === undefined) return undefined;
    if (v < 0 || v > 1) throw new ValidationError(`${k} must be between 0 and 1 (use 0.25 for 25%).`);
    return v;
  };
  const count = (k: string, max: number): number | undefined => {
    const v = numArg(a[k]);
    if (v === undefined) return undefined;
    if (v < 0 || v > max) throw new ValidationError(`${k} must be between 0 and ${max}.`);
    return v;
  };
  const put = (o: Record<string, unknown>, k: string, v: unknown) => {
    if (v !== undefined) o[k] = v;
  };
  const scope = str(a.inkind_scope);
  if (scope && scope !== "all" && scope !== "new_only") throw new ValidationError("inkind_scope must be all or new_only.");

  const baseWarm: Record<string, unknown> = {};
  put(baseWarm, "response", rate("warm_response_base"));
  put(baseWarm, "proposalRate", rate("warm_proposal_rate_base"));
  put(baseWarm, "signRate", rate("warm_sign_rate_base"));
  const base: Record<string, unknown> = {};
  put(base, "closeRate", rate("close_rate_base"));
  put(base, "inkindShare", rate("inkind_base"));
  if (Object.keys(baseWarm).length) base.warm = baseWarm;
  const stretch: Record<string, unknown> = {};
  put(stretch, "closeRate", rate("close_rate_stretch"));
  put(stretch, "inkindShare", rate("inkind_stretch"));

  const patch: Record<string, unknown> = {};
  put(patch, "avgNewDeal", count("avg_new_deal_inr", 10_000_000));
  put(patch, "prefestShare", rate("prefest_share"));
  put(patch, "inkindScope", scope || undefined);
  put(patch, "stretchWarmLeads", count("stretch_warm_leads", 500));
  put(patch, "stretchOtherLeads", count("stretch_other_leads", 500));
  if (Object.keys(base).length) patch.base = base;
  if (Object.keys(stretch).length) patch.stretch = stretch;
  return patch;
}

const pickProjection = (m: Awaited<ReturnType<typeof getPlanModel>>) => ({
  floorCashInr: m.projection.floor,
  baseSignedInr: m.projection.base.signed,
  baseCashInr: m.projection.base.cashBeforeFest,
  baseNewDeals: m.projection.base.newDeals,
  stretchSignedInr: m.projection.stretch.signed,
  stretchCashInr: m.projection.stretch.cashBeforeFest,
  stretchNewDeals: m.projection.stretch.newDeals,
});

function calculate(expression: string): unknown {
  const expr = expression.trim();
  if (!expr || expr.length > 200 || !/^[0-9+\-*/().\s]+$/.test(expr)) {
    throw new ValidationError("Only numbers and + - * / ( ) are allowed. Write 25% as 0.25.");
  }
  const value = Function(`"use strict"; return (${expr});`)() as unknown;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ValidationError("That expression has no finite result.");
  const rounded = Math.round(value * 1e6) / 1e6;
  return { expression: expr, value: rounded, inr: formatInr(rounded), lakh: formatLakh(rounded), as_percent: `${Math.round(rounded * 1000) / 10}%` };
}

const LIMITATIONS = [
  "CampusFest 2025 has no spend or cost per channel, so cost per signed deal or ROI by channel cannot be computed.",
  "Saarang 2027 starting position is SIM (simulated), not real CRM data. Treat it as a demonstration of the system.",
  "86 in-flight follow-ups are not modelled in the projection.",
  "Peer-fest sponsor response rates are unknown until outreach happens; early reads need n of at least 20 per source.",
  "The cold/personalised experiment is directional only until each arm has about 100 sent.",
  "No email open, click or reply tracking beyond the status the coordinator sets.",
  "Payments follow pre-fest and post-fest phases from each deal's payment terms. There is no overdue rule from a due date.",
  "Attendance, footfall forecasts, sponsor ROI and brand-side budgets are not in the data.",
];

async function dispatch(ctx: Ctx, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case "get_overview": {
      const o = await getOverviewData(ctx);
      return enrich({ kpis: o.kpis, week: { outreached: o.week.outreached, responded: o.week.responded, target: o.week.target }, signedCashInr: o.signedCashInr, signedInKindInr: o.signedInKindInr });
    }
    case "get_funnel": {
      const [kpis, channels, warmth] = await Promise.all([getHeadKpis(ctx), getChannelFunnel(ctx), getWarmthFunnel(ctx)]);
      return enrich({ overall: kpis.funnel, bottleneckStage: kpis.bottleneck, byChannel: channels, byWarmth: warmth });
    }
    case "get_initiative_status": {
      const s = await getInitiativeStatuses(ctx);
      return enrich(s.map((i) => ({ code: i.code, name: i.name, badge: i.badge, reason: i.reason, metrics: i.metrics })));
    }
    case "get_member_performance":
      return enrich(await getTeamTable(ctx));
    case "get_weekly_target_status": {
      if (ctx.role === "coordinator") return enrich(await getWeeklyStrip(ctx));
      const w = await getTeamWeekSummary(ctx);
      const who = str(a.member).toLowerCase();
      return enrich(who ? { ...w, members: w.members.filter((m) => m.name.toLowerCase().includes(who)) } : w);
    }
    case "get_needs_update": {
      const rows = await getNeedsUpdate(ctx);
      return enrich(cap(rows, limitOf(a.limit)));
    }
    case "list_companies": {
      const sort = str(a.sort);
      const filters: CrmFilters = { pageSize: limitOf(a.limit) };
      if (str(a.status)) filters.status = str(a.status);
      if (str(a.channel)) filters.channel = str(a.channel);
      if (str(a.tier)) filters.tier = str(a.tier);
      if (a.needs_update === true) filters.needsUpdate = true;
      if (str(a.q)) filters.q = str(a.q);
      if (["company", "status", "amount", "follow_up", "last_update"].includes(sort)) filters.sort = sort as NonNullable<CrmFilters["sort"]>;
      const page = await listCompanies(ctx, filters);
      return enrich({ total: page.total, rows: page.rows });
    }
    case "get_company": {
      const id = str(a.company_id);
      if (id) return enrich(await getCompanyDetail(ctx, id));
      const q = str(a.name);
      if (!q) throw new ValidationError("Give a company name or id.");
      const hits = await listCompanies(ctx, { q, pageSize: 5 });
      const first = hits.rows[0];
      if (!first) throw new NotFoundError(`No company matching "${q}".`);
      if (hits.rows.length > 1) return { ambiguous: true, candidates: hits.rows.map((r) => ({ id: r.id, name: r.name, status: r.crmStatus })) };
      return enrich(await getCompanyDetail(ctx, first.id));
    }
    case "get_deal_desk": {
      if (ctx.role === "head") {
        const b = await getDealBoard(ctx);
        return enrich({ total: b.rows.length, totalInr: b.totalInr, top5Inr: b.top5Inr, top5Share: b.top5Share, rows: b.rows.slice(0, 20) });
      }
      const rows = await getDealDesk(ctx);
      return enrich(cap(rows.map((r) => ({ dealId: r.deal_id, company: r.company, stage: r.stage, proposedInr: r.proposed_inr, nextFollowUp: r.next_follow_up, idleBdays: r.idle_bdays, nudges: r.nudges })), 20));
    }
    case "get_payments_status": {
      const p = await getPaymentsData(ctx);
      return enrich({ scheduledInr: p.scheduledInr, collectedInr: p.collectedInr, pendingInr: p.pendingInr, byPhase: p.byPhase, rows: cap(p.rows, 20) });
    }
    case "get_gates_status": {
      const g = await getGateReport(ctx);
      return enrich({ actualSignedToday: g.actualToday, closingOnlyPhase: g.closingOnly, firstMissedBaseGate: g.missed?.gateOn ?? null, gates: g.statuses, pace: g.pace });
    }
    case "get_lead_supply":
      return enrich(await getLeadSupply(ctx));
    case "run_projection": {
      const patch = projectionPatch(a);
      const [cur, alt] = await Promise.all([getPlanModel(ctx), getPlanModel(ctx, patch as Parameters<typeof getPlanModel>[1])]);
      const c = pickProjection(cur);
      const s = pickProjection(alt);
      return enrich({
        note: "What-if only. Nothing was saved.",
        overridesApplied: patch,
        current: c,
        scenario: s,
        differenceCashBaseInr: s.baseCashInr - c.baseCashInr,
        differenceCashStretchInr: s.stretchCashInr - c.stretchCashInr,
      });
    }
    case "get_model_table": {
      const v = await getPlanView(ctx);
      return enrich({ rows: v.rows, workedExample: v.example, observedVsAssumed: v.observed, goals: v.goals });
    }
    case "get_experiment_status": {
      const b = await getInitiativeBoard(ctx);
      return enrich(b.experiment ?? { note: "No experiment data yet." });
    }
    case "get_inventory": {
      const inv = await getInventory(ctx);
      return enrich({ totals: inv.totals, categories: inv.categories, packages: inv.packages });
    }
    case "suggest_slab": {
      const budget = numArg(a.budget_inr);
      if (!budget || budget <= 0) throw new ValidationError("budget_inr must be a positive number.");
      const inv = await getInventory(ctx);
      return enrich(suggestSlab(budget, inv.packages, inv.items.filter((i) => !i.sold)));
    }
    case "get_campaign_funnel_historical": {
      const hist: Ctx = { ...ctx, eventId: HISTORICAL_EVENT };
      const [channels, warmth] = await Promise.all([getChannelFunnel(hist), getWarmthFunnel(hist)]);
      return enrich({ source: "CampusFest 2025 (FACT)", byChannel: channels, byWarmth: warmth });
    }
    case "get_targets_vs_actual": {
      const [goals, kpis, model, gates] = await Promise.all([getTeamGoals(ctx), getHeadKpis(ctx), getPlanModel(ctx), getGateReport(ctx)]);
      return enrich({
        goals,
        signedSoFarInr: kpis.signedInr,
        signedDeals: kpis.signedDeals,
        cashScheduledInr: kpis.cashScheduledInr,
        cashCollectedInr: kpis.cashCollectedInr,
        cashPendingInr: kpis.cashPendingInr,
        projection: pickProjection(model),
        gateActualSignedToday: gates.actualToday,
      });
    }
    case "compare": {
      const kind = str(a.kind);
      const x = str(a.a).toLowerCase();
      const y = str(a.b).toLowerCase();
      let rows: { key: string; value: Record<string, unknown> }[];
      if (kind === "channel") rows = (await getChannelFunnel(ctx)).map((r) => ({ key: r.channel, value: r as unknown as Record<string, unknown> }));
      else if (kind === "member") rows = (await getTeamTable(ctx)).rows.map((r) => ({ key: r.name, value: r as unknown as Record<string, unknown> }));
      else if (kind === "initiative") rows = (await getInitiativeStatuses(ctx)).map((r) => ({ key: r.code, value: { code: r.code, name: r.name, badge: r.badge, ...r.metrics } }));
      else throw new ValidationError("kind must be channel, member or initiative.");
      const find = (q: string) => rows.find((r) => r.key.toLowerCase() === q) ?? rows.find((r) => r.key.toLowerCase().includes(q));
      const ra = find(x);
      const rb = find(y);
      if (!ra || !rb) throw new NotFoundError(`Could not find both. Available: ${rows.map((r) => r.key).join(", ")}`);
      const diff: Record<string, number> = {};
      for (const [k, v] of Object.entries(ra.value)) {
        const w = rb.value[k];
        if (typeof v === "number" && typeof w === "number") diff[k] = Math.round((v - w) * 1e6) / 1e6;
      }
      return enrich({ a: ra.value, b: rb.value, differenceAminusB: diff });
    }
    case "get_data_limitations":
      return { limitations: LIMITATIONS };
    case "calculate":
      return calculate(str(a.expression));
    case "propose_task":
      return proposeTask(ctx, a);
    case "propose_follow_up":
      return proposeFollowUp(ctx, a);
    case "propose_nudge_deal":
      return proposeNudge(ctx, a);
    default:
      throw new ValidationError(`Unknown tool ${name}.`);
  }
}

export async function executeTool(ctx: Ctx, name: string, args: Args): Promise<ToolResult> {
  try {
    if (ctx.role === "coordinator" && !COORDINATOR_TOOLS.has(name)) throw new ValidationError(`${name} is not available to coordinators.`);
    return { ok: true, data: await dispatch(ctx, name, args) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}