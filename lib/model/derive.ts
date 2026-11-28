import { channelToInitiative, isWarmLead } from "../domain/channels";
import { businessDaysBetween, toIstDate, type Holiday } from "../domain/bizdays";
import type { Metrics } from "../domain/rules-engine";
import type { ModelSettings, PlanState } from "./projection";

export const PLAN_START = "2026-11-30";
export const PLAN_END = "2027-01-05";
export const BASE_WARM_NEED = 25;
export const QUEUE_STATUSES = ["to_contact", "send_mail"];
export const ACTIVE_STATUSES = ["slabs_sent", "didnt_pick", "contacted", "prospective"];
export const ENGAGED_STATUSES = ["contacted", "ghosting", "prospective"];

export type BrandRow = {
  id: string;
  name: string;
  owner_id: string | null;
  crm_status: string | null;
  source_channel: string | null;
  approx_amount_inr: number;
  first_outreach_at: string | null;
  last_touch_at: string | null;
  next_follow_up: string | null;
  initiative_id: string | null;  signal_tag?: string | null | undefined; agency_commission_pct?: number | undefined;
};

export type SignedDeal = { dealId: string; brandId: string; amountInr: number; cashInr: number; inKindInr: number; confirmedOn: string };

export const isWarm = (channel: string | null, signal?: string | null): boolean => isWarmLead(channel, signal);

export function buildPlanState(brands: BrandRow[], signed: SignedDeal[]): PlanState {
  const prospects = brands.filter((b) => b.crm_status === "prospective");
  const queue = brands.filter((b) => b.crm_status !== null && QUEUE_STATUSES.includes(b.crm_status));
  const total = signed.reduce((t, d) => t + d.amountInr, 0);
  const inKind = signed.reduce((t, d) => t + d.inKindInr, 0);
  return {
    signedToDate: total,
    signedDealsToDate: signed.length,
    openProspectInr: prospects.reduce((t, b) => t + b.approx_amount_inr, 0),
    openProspectCount: prospects.length,
    queueWarm: queue.filter((b) => isWarm(b.source_channel, b.signal_tag)).length,
    queueOther: queue.filter((b) => !isWarm(b.source_channel, b.signal_tag)).reduce((t, b) => t + (1 - (b.agency_commission_pct ?? 0) / 100), 0),
    observedInkindShare: total > 0 ? inKind / total : 0,
  };
}

export type LeadSupplyRow = { code: string; label: string; pool: number; need: number; gap: number };
export type LeadSupply = { warmPool: number; baseNeed: number; stretchNeed: number; gapToBase: number; gapToStretch: number; perBet: LeadSupplyRow[] };

/** Warm pool = warm companies queued now plus warm companies first outreached on or after the plan start. */
export function leadSupply(brands: BrandRow[], settings: ModelSettings, planStart: string = PLAN_START): LeadSupply {
  const counts = (b: BrandRow): boolean =>
    isWarm(b.source_channel, b.signal_tag) &&
    ((b.crm_status !== null && QUEUE_STATUSES.includes(b.crm_status)) || (!!b.first_outreach_at && toIstDate(b.first_outreach_at) >= planStart));
  const pool = brands.filter(counts);
  const inBet = (code: string): number => pool.filter((b) => channelToInitiative(String(b.source_channel), b.signal_tag) === code).length;
  const bet2Need = settings.warmSplit.network;
  const row = (code: string, label: string, need: number): LeadSupplyRow => ({ code, label, pool: inBet(code), need, gap: Math.max(0, need - inBet(code)) });
  return {
    warmPool: pool.length,
    baseNeed: BASE_WARM_NEED,
    stretchNeed: settings.stretchWarmLeads,
    gapToBase: Math.max(0, BASE_WARM_NEED - pool.length),
    gapToStretch: Math.max(0, settings.stretchWarmLeads - pool.length),
    perBet: [row("bet-2", "Warm network engine", bet2Need), row("bet-4", "Referral and intro magnet", settings.warmSplit.referral)],
  };
}

export type FunnelStage = { key: string; label: string; count: number; rateFromPrev: number | null };
export type Kpis = {
  companies: number;
  outreached: number;
  responded: number;
  prospectiveOrBetter: number;
  converted: number;
  funnel: FunnelStage[];
  bottleneck: string | null;
};

export type WarmthRow = { companies: number; outreached: number; responded: number; prospective_or_better: number; converted: number };

export function buildKpis(rows: WarmthRow[]): Kpis {
  const s = (k: keyof WarmthRow): number => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const raw = [
    { key: "outreached", label: "Outreached", count: s("outreached") },
    { key: "responded", label: "Responded", count: s("responded") },
    { key: "prospective_or_better", label: "Prospective or better", count: s("prospective_or_better") },
    { key: "converted", label: "Converted", count: s("converted") },
  ];
  const funnel: FunnelStage[] = raw.map((st, i) => {
    const prev = i === 0 ? null : raw[i - 1]?.count ?? 0;
    return { ...st, rateFromPrev: prev === null ? null : prev > 0 ? st.count / prev : null };
  });
  const rated = funnel.filter((f) => f.rateFromPrev !== null);
  const worst = rated.reduce<FunnelStage | null>((w, f) => (w === null || (f.rateFromPrev ?? 1) < (w.rateFromPrev ?? 1) ? f : w), null);
  return {
    companies: s("companies"),
    outreached: raw[0]?.count ?? 0,
    responded: raw[1]?.count ?? 0,
    prospectiveOrBetter: raw[2]?.count ?? 0,
    converted: raw[3]?.count ?? 0,
    funnel,
    bottleneck: worst?.key ?? null,
  };
}

// ---- initiative metrics ----

export type LaneRow = { outreached: number; responded: number; prospective_or_better: number; converted: number };
export type MetricSet = { metrics: Metrics; counts: Record<string, string> };

export function laneMetrics(row: LaneRow | undefined, today: number): MetricSet {
  const o = row?.outreached ?? 0;
  const r = row?.responded ?? 0;
  const p = row?.prospective_or_better ?? 0;
  const c = row?.converted ?? 0;
  return {
    metrics: {
      outreached: o,
      response_rate: o > 0 ? r / o : undefined,
      proposal_rate: r > 0 ? p / r : undefined,
      prospective_or_better: p,
      signed_deals: c,
      today,
    },
    counts: {
      outreached: `${o} outreached`,
      response_rate: `${r} of ${o} responded`,
      proposal_rate: `${p} of ${r} reached proposal`,
      prospective_or_better: `${p} prospective or better`,
      signed_deals: `${c} signed`,
    },
  };
}

export type DeskRow = { company: string; stage: string; proposed_inr: number; idle_bdays: number; nudges: number };

export function dealDeskMetrics(rows: DeskRow[], today: number): MetricSet {
  const top5 = [...rows].sort((a, b) => b.proposed_inr - a.proposed_inr).slice(0, 5);
  const topIdle = top5.reduce((m, r) => Math.max(m, r.idle_bdays), 0);
  const negotiating = rows.filter((r) => r.stage === "negotiating").length;
  const stuck = rows.filter((r) => r.idle_bdays > 10 && r.nudges >= 3).length;
  return {
    metrics: { negotiating_count: negotiating, top5_max_idle_bdays: rows.length ? topIdle : undefined, deals_idle_gt10_after_3_nudges: stuck, today },
    counts: {
      negotiating_count: `${negotiating} negotiating`,
      top5_max_idle_bdays: `top-5 prospects idle up to ${topIdle} business days`,
      deals_idle_gt10_after_3_nudges: `${stuck} deals idle over 10 business days after 3 nudges`,
    },
  };
}

export function cashTermsMetrics(signed: SignedDeal[], planStart: string, today: number): MetricSet {
  const fresh = signed.filter((d) => d.confirmedOn >= planStart);
  const total = fresh.reduce((t, d) => t + d.amountInr, 0);
  const inKind = fresh.reduce((t, d) => t + d.inKindInr, 0);
  const share = total > 0 ? inKind / total : undefined;
  return {
    metrics: { inkind_share_new: share, today },
    counts: { inkind_share_new: share === undefined ? "no new signed deals yet" : `${Math.round(share * 100)}% in-kind on ${fresh.length} new signed deals` },
  };
}

export type ArmStats = { n: number; reached: number; rate: number | null };
export type Experiment = { personalised: ArmStats; template: ArmStats; ratio: number | undefined; directionalOnly: boolean };

export function experimentArms(
  brandIds: Set<string>,
  drafts: { brand_id: string; personalised: boolean; status: string }[],
  events: { brand_id: string; to_status: string }[],
): Experiment {
  const arm = new Map<string, boolean>();
  for (const d of drafts) if (d.status === "sent" && brandIds.has(d.brand_id) && !arm.has(d.brand_id)) arm.set(d.brand_id, d.personalised);
  const reached = new Set(events.filter((e) => e.to_status === "prospective" || e.to_status === "converted").map((e) => e.brand_id));
  const stats = (flag: boolean): ArmStats => {
    const ids = [...arm.entries()].filter(([, p]) => p === flag).map(([id]) => id);
    const hit = ids.filter((id) => reached.has(id)).length;
    return { n: ids.length, reached: hit, rate: ids.length ? hit / ids.length : null };
  };
  const personalised = stats(true);
  const template = stats(false);
  const ratio = personalised.rate !== null && template.rate !== null && template.rate > 0 ? personalised.rate / template.rate : undefined;
  return { personalised, template, ratio, directionalOnly: personalised.n < 100 || template.n < 100 };
}

// ---- decision inputs ----

export const normName = (name: string): string =>
  name.toLowerCase().replace(/\(demo\)/g, "").replace(/\b(pvt|ltd|limited|india|group)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function ownershipConflicts(brands: BrandRow[], nameOf: Map<string, string>): { company: string; ownerIds: string[]; ownerNames: string[] }[] {
  const groups = new Map<string, { company: string; owners: Set<string> }>();
  for (const b of brands) {
    if (!b.owner_id) continue;
    const key = normName(b.name);
    const g = groups.get(key) ?? { company: b.name, owners: new Set<string>() };
    g.owners.add(b.owner_id);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.owners.size >= 2)
    .map((g) => ({ company: g.company, ownerIds: [...g.owners], ownerNames: [...g.owners].map((id) => nameOf.get(id) ?? id) }));
}

export function staleProspects(
  brands: BrandRow[],
  threshold: number,
  today: string,
  holidays: Holiday[],
  nameOf: Map<string, string>,
): { brandId: string; company: string; ownerId: string; ownerName: string; amountInr: number; idleBdays: number; thresholdBdays: number }[] {
  const out = [];
  for (const b of brands) {
    if (b.crm_status !== "prospective" || !b.owner_id) continue;
    if (b.next_follow_up && b.next_follow_up > today) continue;
    const idle = businessDaysBetween(toIstDate(b.last_touch_at ?? today), today, holidays);
    if (idle > threshold) {
      out.push({ brandId: b.id, company: b.name, ownerId: b.owner_id, ownerName: nameOf.get(b.owner_id) ?? b.owner_id, amountInr: b.approx_amount_inr, idleBdays: idle, thresholdBdays: threshold });
    }
  }
  return out.sort((a, b) => b.amountInr - a.amountInr);
}

export type CoordStat = {
  id: string;
  name: string;
  activeCount: number;
  idleBdays: number;
  outreachedThisWeek: number;
  weeklyTarget: number;
  bdaysElapsed: number;
  bdaysInWeek: number;
  ghosting: number;
  engagedPool: number;
};

export function coordinatorStat(
  member: { id: string; name: string },
  brands: BrandRow[],
  week: { outreached: number; target: number },
  today: string,
  holidays: Holiday[],
  bdays: { inWeek: number; left: number },
): CoordStat {
  const mine = brands.filter((b) => b.owner_id === member.id);
  const active = mine.filter((b) => b.crm_status !== null && ACTIVE_STATUSES.includes(b.crm_status));
  const lastTouch = mine.reduce<string | null>((m, b) => (b.last_touch_at && (m === null || b.last_touch_at > m) ? b.last_touch_at : m), null);
  const engaged = mine.filter((b) => b.crm_status !== null && ENGAGED_STATUSES.includes(b.crm_status));
  const elapsed = bdays.left === 0 ? bdays.inWeek : Math.min(bdays.inWeek, bdays.inWeek - bdays.left + 1);
  return {
    id: member.id,
    name: member.name,
    activeCount: active.length,
    idleBdays: lastTouch ? businessDaysBetween(toIstDate(lastTouch), today, holidays) : 0,
    outreachedThisWeek: week.outreached,
    weeklyTarget: week.target,
    bdaysElapsed: elapsed,
    bdaysInWeek: bdays.inWeek,
    ghosting: mine.filter((b) => b.crm_status === "ghosting").length,
    engagedPool: engaged.length,
  };
}