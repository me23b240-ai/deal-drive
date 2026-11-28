export type SegmentRates = { response: number; proposal_rate: number; sign_rate: number };

export type ModelAssumptions = {
  close_rate: { base: number; stretch: number };
  warm: { base: SegmentRates; stretch: SegmentRates };
  other: { base: SegmentRates; stretch: SegmentRates };
  avg_new_deal_inr: number;
  baseline_avg_deal_inr: number;
  inkind_new: { base: number; stretch: number };
  inkind_policy_scope: "all" | "new_only";
  prefest_share: number;
  stretch_warm_leads: number;
  stretch_other_leads: number;
  warm_split: { network: number; referral: number };
  early_bird_discount: number;
  early_bird_deadline: string;
  exclusive_sectors: string[];
  plan_start: string;
  plan_end: string;
  bundle_discount_start: string;
  bundle_discount_stop: string;
  prefest_due_date: string;
  postfest_due_date: string;
  kpi_window_start: string | null;
  use_observed: boolean;
};

export const DEFAULT_ASSUMPTIONS: ModelAssumptions = {
  close_rate: { base: 0.25, stretch: 0.4 },
  warm: {
    base: { response: 0.5, proposal_rate: 0.4, sign_rate: 0.5 },
    stretch: { response: 0.6, proposal_rate: 0.5, sign_rate: 0.5 },
  },
  other: {
    base: { response: 0.25, proposal_rate: 0.04, sign_rate: 0.5 },
    stretch: { response: 0.25, proposal_rate: 0.08, sign_rate: 0.5 },
  },
  avg_new_deal_inr: 125000,
  baseline_avg_deal_inr: 93000,
  inkind_new: { base: 0.1, stretch: 0.05 },
  inkind_policy_scope: "all",
  prefest_share: 0.75,
  stretch_warm_leads: 60,
  stretch_other_leads: 42,
  warm_split: { network: 45, referral: 15 },
  early_bird_discount: 0.03,
  early_bird_deadline: "2026-12-10",
  exclusive_sectors: ["beverage", "telecom", "banking", "ecommerce"],
  plan_start: "2026-11-30",
  plan_end: "2027-01-05",
  bundle_discount_start: "2026-12-14",
  bundle_discount_stop: "2027-01-04",
  prefest_due_date: "2027-01-05",
  postfest_due_date: "2027-02-09",
  kpi_window_start: null,
  use_observed: false,
};

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge<T>(defaults: T, raw: unknown): T {
  if (isObj(defaults)) {
    const src = isObj(raw) ? raw : {};
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(defaults)) out[key] = merge(defaults[key], src[key]);
    return out as T;
  }
  if (raw === undefined) return defaults;
  if (defaults === null) return (typeof raw === "string" || raw === null ? raw : defaults) as T;
  if (typeof defaults === "number") {
    return (typeof raw === "number" && Number.isFinite(raw) ? raw : defaults) as T;
  }
  if (Array.isArray(defaults)) {
    return (Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : defaults) as T;
  }
  return (typeof raw === typeof defaults ? raw : defaults) as T;
}

export function resolveAssumptions(raw: unknown): ModelAssumptions {
  const merged = merge(DEFAULT_ASSUMPTIONS, raw);
  if (merged.inkind_policy_scope !== "all" && merged.inkind_policy_scope !== "new_only") {
    merged.inkind_policy_scope = "all";
  }
  return merged;
}