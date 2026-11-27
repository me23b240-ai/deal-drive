import { findSheet, readWorkbook, sheetHeaders, sheetRows, type Row } from "./xlsx";

export const s = (r: Row, k: string): string | null => {
  const v = r[k];
  return v === null || v === undefined ? null : String(v);
};
export const n = (r: Row, k: string): number => {
  const v = r[k];
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const REQUIRED: Record<string, string[]> = {
  Brands: ["brand_id", "brand_name", "industry", "owner_id", "owner_name", "created_at"],
  "Sponsor contacts": ["contact_id", "brand_id", "contact_name", "job_title", "created_at"],
  "Sponsor campaigns": [
    "sponsor_campaign_id", "campaign_name", "channel", "objective", "audience",
    "owner_id", "owner_name", "planned_start_at", "planned_end_at",
  ],
  "Sponsor interactions": [
    "interaction_id", "brand_id", "contact_id", "sponsor_campaign_id", "owner_id",
    "event_type", "outcome", "summary", "occurred_at", "attempt_id", "origin_interaction_id",
  ],
  "Brand qualification": [
    "history_id", "brand_id", "sponsor_campaign_id", "qualification_status", "reason", "effective_at",
  ],
  "Partner opportunities": [
    "opportunity_id", "opportunity_name", "brand_id", "primary_contact_id",
    "sponsor_campaign_id", "support_type", "created_at",
  ],
  "Opportunity history": [
    "history_id", "opportunity_id", "brand_id", "stage", "proposed_value_inr",
    "confirmed_value_inr", "owner_id", "owner_name", "effective_at",
  ],
  "Sponsor activations": [
    "activation_id", "brand_id", "opportunity_id", "attendee_campaign_name", "activation_note", "linked_at",
  ],
};

export type Parsed = {
  event: { name: string; startsAt: string | null; endsAt: string | null };
  asOf: string;
  targets: Row[];
  brands: Row[];
  contacts: Row[];
  campaigns: Row[];
  interactions: Row[];
  qualification: Row[];
  opportunities: Row[];
  history: Row[];
  activations: Row[];
  removed: { interactions: number; qualification: number; history: number };
};

function dedupe(rows: Row[], key: string): { rows: Row[]; removed: number } {
  const seen = new Set<string>();
  const out: Row[] = [];
  let removed = 0;
  for (const r of rows) {
    const id = s(r, key);
    if (!id) continue;
    if (seen.has(id)) {
      removed += 1;
      continue;
    }
    seen.add(id);
    out.push(r);
  }
  return { rows: out, removed };
}

/** Latest full-state version per entity with effective_at <= asOf. Never sums history states. */
export function latestByEntity(rows: Row[], idKey: string, asOfMs: number): Map<string, Row> {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const id = s(r, idKey);
    const at = Date.parse(s(r, "effective_at") ?? "");
    if (!id || Number.isNaN(at) || at > asOfMs) continue;
    const cur = best.get(id);
    if (!cur || at >= Date.parse(s(cur, "effective_at") ?? "")) best.set(id, r);
  }
  return best;
}

/** Validates sheet names and columns first, so a bad upload never touches the database. */
export async function parseCampusFest(source: Buffer | string): Promise<Parsed> {
  const wb = await readWorkbook(source);
  const problems: string[] = [];
  for (const [sheet, cols] of Object.entries(REQUIRED)) {
    const ws = findSheet(wb, sheet);
    if (!ws) {
      problems.push(`missing sheet "${sheet}"`);
      continue;
    }
    const have = new Set(sheetHeaders(ws));
    const miss = cols.filter((c) => !have.has(c));
    if (miss.length) problems.push(`sheet "${sheet}" lacks columns: ${miss.join(", ")}`);
  }
  if (problems.length) throw new Error(`Invalid workbook: ${problems.join("; ")}`);

  const rows = (name: string): Row[] => {
    const ws = findSheet(wb, name);
    return ws ? sheetRows(ws) : [];
  };

  const eventRow = rows("Event")[0];
  const historyEnd = eventRow ? s(eventRow, "history_end") : null;
  const asOf = `${(historyEnd ?? "2025-04-20").slice(0, 10)}T23:59:59+05:30`;

  const interactions = dedupe(rows("Sponsor interactions"), "interaction_id");
  const qualification = dedupe(rows("Brand qualification"), "history_id");
  const history = dedupe(rows("Opportunity history"), "history_id");

  return {
    event: {
      name: (eventRow && s(eventRow, "event_name")) || "CampusFest 2025",
      startsAt: eventRow ? s(eventRow, "event_starts_at") : null,
      endsAt: eventRow ? s(eventRow, "event_ends_at") : null,
    },
    asOf,
    targets: rows("Targets"),
    brands: dedupe(rows("Brands"), "brand_id").rows,
    contacts: dedupe(rows("Sponsor contacts"), "contact_id").rows,
    campaigns: dedupe(rows("Sponsor campaigns"), "sponsor_campaign_id").rows,
    interactions: interactions.rows,
    qualification: qualification.rows,
    opportunities: dedupe(rows("Partner opportunities"), "opportunity_id").rows,
    history: history.rows,
    activations: dedupe(rows("Sponsor activations"), "activation_id").rows,
    removed: {
      interactions: interactions.removed,
      qualification: qualification.removed,
      history: history.removed,
    },
  };
}

export const WARM_CAMPAIGNS = ["SC02", "SC04", "SC05"] as const;

export type CampaignAnchor = { brandsTouched: number; opportunities: number; signed: number; signedValue: number };

export type Anchors = {
  brands: number;
  contacts: number;
  campaigns: number;
  opportunities: number;
  confirmed: number;
  confirmedValue: number;
  cashValue: number;
  inKindValue: number;
  cashDeals: number;
  inKindDeals: number;
  qualifiedBrands: number;
  optOuts: number;
  optOutsByCampaign: Record<string, number>;
  days: { median: number; min: number; max: number } | null;
  perCampaign: Record<string, CampaignAnchor>;
  warm: { brandsTouched: number; opportunities: number; signed: number };
  nonWarm: { brandsTouched: number; brandsTouchedExRevival: number; signed: number; campaignSum: number };
};

export function computeAnchors(p: Parsed): Anchors {
  const asOfMs = Date.parse(p.asOf);
  const latestOpp = latestByEntity(p.history, "opportunity_id", asOfMs);
  const latestQual = latestByEntity(p.qualification, "brand_id", asOfMs);
  const oppById = new Map(p.opportunities.map((o) => [s(o, "opportunity_id") ?? "", o]));

  const perCampaign: Record<string, CampaignAnchor> = {};
  const slot = (sc: string): CampaignAnchor =>
    (perCampaign[sc] ??= { brandsTouched: 0, opportunities: 0, signed: 0, signedValue: 0 });

  const touched: Record<string, Set<string>> = {};
  for (const r of p.interactions) {
    const sc = s(r, "sponsor_campaign_id");
    const b = s(r, "brand_id");
    if (!sc || !b) continue;
    (touched[sc] ??= new Set()).add(b);
  }
  for (const sc of Object.keys(touched)) slot(sc).brandsTouched = touched[sc].size;

  for (const o of p.opportunities) slot(s(o, "sponsor_campaign_id") ?? "?").opportunities += 1;

  const firstConfirmed = new Map<string, number>();
  for (const h of p.history) {
    if (s(h, "stage") !== "partner_confirmed") continue;
    const id = s(h, "opportunity_id") ?? "";
    const at = Date.parse(s(h, "effective_at") ?? "");
    if (Number.isNaN(at) || at > asOfMs) continue;
    const cur = firstConfirmed.get(id);
    if (cur === undefined || at < cur) firstConfirmed.set(id, at);
  }

  let confirmed = 0, confirmedValue = 0, cashValue = 0, inKindValue = 0, cashDeals = 0, inKindDeals = 0;
  const days: number[] = [];
  for (const [oppId, h] of latestOpp) {
    const opp = oppById.get(oppId);
    if (!opp || s(h, "stage") !== "partner_confirmed") continue;
    const value = n(h, "confirmed_value_inr");
    const sc = slot(s(opp, "sponsor_campaign_id") ?? "?");
    sc.signed += 1;
    sc.signedValue += value;
    confirmed += 1;
    confirmedValue += value;
    if (s(opp, "support_type") === "in_kind") {
      inKindValue += value;
      inKindDeals += 1;
    } else {
      cashValue += value;
      cashDeals += 1;
    }
    const at = firstConfirmed.get(oppId);
    const created = Date.parse(s(opp, "created_at") ?? "");
    if (at !== undefined && !Number.isNaN(created)) days.push(Math.round((at - created) / 86_400_000));
  }
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  const median = days.length === 0 ? 0 : days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;

  const optOutsByCampaign: Record<string, number> = {};
  let optOuts = 0;
  for (const r of p.interactions) {
    if (s(r, "event_type") !== "opt_out") continue;
    optOuts += 1;
    const sc = s(r, "sponsor_campaign_id") ?? "?";
    optOutsByCampaign[sc] = (optOutsByCampaign[sc] ?? 0) + 1;
  }

  const union = (codes: string[]): number => {
    const set = new Set<string>();
    for (const c of codes) touched[c]?.forEach((b) => set.add(b));
    return set.size;
  };
  const warmCodes = [...WARM_CAMPAIGNS] as string[];
  const nonWarmCodes = ["SC01", "SC03", "SC06"];
  const sumOf = (codes: string[], f: (a: CampaignAnchor) => number) =>
    codes.reduce((t, c) => t + (perCampaign[c] ? f(perCampaign[c]) : 0), 0);

  return {
    brands: p.brands.length,
    contacts: p.contacts.length,
    campaigns: p.campaigns.length,
    opportunities: p.opportunities.length,
    confirmed,
    confirmedValue,
    cashValue,
    inKindValue,
    cashDeals,
    inKindDeals,
    qualifiedBrands: [...latestQual.values()].filter((r) => s(r, "qualification_status") === "qualified").length,
    optOuts,
    optOutsByCampaign,
    days: days.length ? { median, min: days[0], max: days[days.length - 1] } : null,
    perCampaign,
    warm: {
      brandsTouched: union(warmCodes),
      opportunities: sumOf(warmCodes, (a) => a.opportunities),
      signed: sumOf(warmCodes, (a) => a.signed),
    },
    nonWarm: {
      brandsTouched: union(nonWarmCodes),
      brandsTouchedExRevival: union(["SC01", "SC03"]),
      signed: sumOf(nonWarmCodes, (a) => a.signed),
      campaignSum: sumOf(nonWarmCodes, (a) => a.brandsTouched),
    },
  };
}