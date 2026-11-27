import type { ChannelCode } from "../../domain/channels";
import type { StatusCode } from "../../domain/status";
import type { CoordKey } from "./team";

/** Exact status counts per channel. Totals: 220 companies, queue 67 (25 warm + 42 other), in flight 86. */
export const MATRIX: Record<ChannelCode, Partial<Record<StatusCode, number>>> = {
  past_sponsors: { to_contact: 6, send_mail: 2, slabs_sent: 6, didnt_pick: 2, contacted: 2, ghosting: 1, prospective: 6, converted: 3, rejected: 2 },
  other_fest: { to_contact: 6, send_mail: 2, slabs_sent: 7, didnt_pick: 2, contacted: 3, ghosting: 2, prospective: 4, converted: 1, rejected: 3 },
  artist_linked: { slabs_sent: 6, didnt_pick: 4, contacted: 1, ghosting: 1, prospective: 1, rejected: 2 },
  inbound_referral: { to_contact: 3, send_mail: 1, slabs_sent: 1, didnt_pick: 1, contacted: 2, prospective: 1, rejected: 1 },
  institute: { to_contact: 4, send_mail: 1, contacted: 1, prospective: 1, rejected: 1 },
  cold_database: { to_contact: 4, slabs_sent: 5, didnt_pick: 3, contacted: 12, ghosting: 6, prospective: 1, rejected: 29, left_company: 3, wrong_number: 2 },
  agency: { to_contact: 8, send_mail: 2, slabs_sent: 1, didnt_pick: 1, contacted: 4, ghosting: 2, rejected: 1, wrong_number: 1 },
  new_local: { to_contact: 9, send_mail: 3, slabs_sent: 1, didnt_pick: 1, contacted: 2, ghosting: 1, rejected: 2, left_company: 1 },
  csr: { to_contact: 7, send_mail: 1, slabs_sent: 1, contacted: 1, ghosting: 1, rejected: 1 },
  ipl_sports: { to_contact: 8, contacted: 2 },
};

export type FixedProspect = {
  name: string;
  channel: ChannelCode;
  sector: string;
  owner: CoordKey;
  amount: number;
  stage: "prospecting" | "proposal_sent" | "negotiating";
  idle: number;
};

/** 14 open prospects, sum 30,75,000. Top 5 = 58.5%. */
export const PROSPECTS: FixedProspect[] = [
  { name: "Northwind Motors (demo)", channel: "past_sponsors", sector: "automotive", owner: "arjun", amount: 500000, stage: "proposal_sent", idle: 8 },
  { name: "Veridian Bank (demo)", channel: "past_sponsors", sector: "banking_financial_services_insurance", owner: "aarav", amount: 400000, stage: "negotiating", idle: 1 },
  { name: "Skyline Telecom (demo)", channel: "other_fest", sector: "telecom", owner: "kavya", amount: 350000, stage: "negotiating", idle: 2 },
  { name: "Aurum Beverages (demo)", channel: "past_sponsors", sector: "food_beverage", owner: "dev", amount: 300000, stage: "negotiating", idle: 2 },
  { name: "Pixel Forge Gaming (demo)", channel: "other_fest", sector: "technology_internet", owner: "rohan", amount: 250000, stage: "proposal_sent", idle: 2 },
  { name: "Lumos Electronics (demo)", channel: "past_sponsors", sector: "electronics_electricals", owner: "sanjana", amount: 250000, stage: "proposal_sent", idle: 1 },
  { name: "Raga Audio (demo)", channel: "artist_linked", sector: "electronics_electricals", owner: "aarav", amount: 200000, stage: "proposal_sent", idle: 2 },
  { name: "Fresco Dairy (demo)", channel: "past_sponsors", sector: "food_beverage", owner: "ishita", amount: 200000, stage: "prospecting", idle: 7 },
  { name: "Coastal Apparel (demo)", channel: "other_fest", sector: "fashion_beauty_lifestyle", owner: "kavya", amount: 150000, stage: "proposal_sent", idle: 1 },
  { name: "Banyan Learning (demo)", channel: "inbound_referral", sector: "education_edtech", owner: "sanjana", amount: 150000, stage: "prospecting", idle: 0 },
  { name: "Chennai Cooperative Bank (demo)", channel: "institute", sector: "banking_financial_services_insurance", owner: "dev", amount: 100000, stage: "prospecting", idle: 2 },
  { name: "Spark Cycles (demo)", channel: "past_sponsors", sector: "automotive", owner: "rohan", amount: 100000, stage: "proposal_sent", idle: 2 },
  { name: "Nimbus Wellness (demo)", channel: "other_fest", sector: "healthcare_pharma_wellness", owner: "arjun", amount: 75000, stage: "prospecting", idle: 1 },
  { name: "Quill Stationers (demo)", channel: "cold_database", sector: "retail_ecommerce", owner: "ishita", amount: 50000, stage: "prospecting", idle: 6 },
];

export type FixedConverted = {
  name: string;
  channel: ChannelCode;
  sector: string;
  owner: CoordKey;
  total: number;
  inKind: number;
  daysAgo: number;
  received: boolean;
};

/** 4 signed deals: 11,00,000 = 9,90,000 cash + 1,10,000 in-kind. */
export const CONVERTED: FixedConverted[] = [
  { name: "Meridian Foods (demo)", channel: "past_sponsors", sector: "food_beverage", owner: "aarav", total: 200000, inKind: 0, daysAgo: 18, received: true },
  { name: "Orbit Mobility (demo)", channel: "past_sponsors", sector: "automotive", owner: "kavya", total: 300000, inKind: 60000, daysAgo: 12, received: true },
  { name: "Zephyr Telecom (demo)", channel: "past_sponsors", sector: "telecom", owner: "dev", total: 450000, inKind: 0, daysAgo: 9, received: false },
  { name: "Lotus Textiles (demo)", channel: "other_fest", sector: "fashion_beauty_lifestyle", owner: "sanjana", total: 150000, inKind: 50000, daysAgo: 4, received: false },
];

export const STALE_RULES: Record<string, number> = {
  to_contact: 5,
  send_mail: 1,
  slabs_sent: 3,
  didnt_pick: 1,
  contacted: 3,
  ghosting: 5,
  prospective: 3,
};

export const HOLIDAYS = [
  { day: "2026-12-25", name: "Christmas" },
  { day: "2027-01-01", name: "New Year" },
];

export const TEAM_GOALS = [
  { scenario: "base", label: "Slide 1 base (assumption)", qualified: 40, partnerships: 10, signed: 2210000, cash: 1490000 },
  { scenario: "stretch", label: "Slide 1 stretch (assumption)", qualified: 60, partnerships: 23, signed: 3980000, cash: 2830000 },
];

export const GATES: [string, number, number][] = [
  ["2026-12-07", 1320000, 1680000],
  ["2026-12-14", 1600000, 2390000],
  ["2026-12-21", 1880000, 3110000],
];

export type RuleClause = { m: string; op: ">=" | "<=" | ">" | "<" | "="; v: number };
export type RuleJson = { all: RuleClause[] } | null;

export type InitiativeSeed = {
  code: string;
  name: string;
  concept: string;
  budget: number;
  spend: number;
  owner: CoordKey | "head";
  start: string;
  end: string;
  expected: number;
  kpis: string[];
  scale: RuleJson;
  change: RuleJson;
  stop: RuleJson;
};

/** Metric "today" is the integer yyyymmdd (for example 20270104). */
export const INITIATIVES: InitiativeSeed[] = [
  {
    code: "bet-1", name: "Deal desk", budget: 0, spend: 0, owner: "head", start: "2026-11-30", end: "2027-01-05", expected: 830250,
    concept: "Closing squad (head plus 2 closers) on the open prospects: custom slab within 1 business day, MoU on the day of the yes, daily 15-minute stand-up.",
    kpis: ["Idle business days at most 3", "Prospect to signed rate", "Days from proposal to signed (target 10 or fewer)"],
    scale: { all: [{ m: "negotiating_count", op: ">=", v: 5 }] },
    change: { all: [{ m: "top5_max_idle_bdays", op: ">", v: 3 }] },
    stop: { all: [{ m: "deals_idle_gt10_after_3_nudges", op: ">=", v: 1 }] },
  },
  {
    code: "bet-2", name: "Cash-first terms", budget: 10000, spend: 0, owner: "head", start: "2026-11-30", end: "2027-01-05", expected: 149109,
    concept: "75/25 default terms, in-kind capped at 5% of new signed value, discounted club-title plus stall bundles only after 14 Dec.",
    kpis: ["In-kind share of new signed value", "MoU lag in business days"],
    scale: null,
    change: { all: [{ m: "inkind_share_new", op: ">", v: 0.1 }] },
    stop: { all: [{ m: "today", op: ">=", v: 20270104 }] },
  },
  {
    code: "bet-3", name: "Warm renewals", budget: 0, spend: 0, owner: "kavya", start: "2026-11-30", end: "2026-12-18", expected: 696094,
    concept: "Source 30 more past-sponsor and other-fest leads, work the warm queue first, use sector hooks from the fact bank.",
    kpis: ["Response rate by source", "Proposal rate by source after 20 outreaches"],
    scale: { all: [{ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.5 }, { m: "proposal_rate", op: ">=", v: 0.4 }] },
    change: { all: [{ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.3 }, { m: "response_rate", op: "<", v: 0.5 }] },
    stop: { all: [{ m: "outreached", op: ">=", v: 30 }, { m: "response_rate", op: "<", v: 0.2 }] },
  },
  {
    code: "bet-4", name: "Lineup-triggered pitch", budget: 10000, spend: 2000, owner: "dev", start: "2026-11-30", end: "2026-12-11", expected: 379688,
    concept: "30 artist-linked brands pitched on the headliners: AGAM, Chaar Diwaari, Benny Dayal and Andrea Jeremiah.",
    kpis: ["Response within 3 business days", "Proposals sent"],
    scale: { all: [{ m: "outreached", op: ">=", v: 15 }, { m: "response_rate", op: ">=", v: 0.4 }] },
    change: { all: [{ m: "outreached", op: ">=", v: 15 }, { m: "response_rate", op: ">=", v: 0.2 }, { m: "response_rate", op: "<", v: 0.4 }] },
    stop: { all: [{ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: "<", v: 0.1 }] },
  },
  {
    code: "bet-5", name: "Capped cold test", budget: 15000, spend: 3000, owner: "rohan", start: "2026-11-30", end: "2026-12-11", expected: 35438,
    concept: "42 other-channel leads, personalised vs template opening, hard stop.",
    kpis: ["Proposal rate", "Reply rate (directional only, small n)"],
    scale: { all: [{ m: "prospective_or_better", op: ">=", v: 5 }, { m: "personalised_vs_template_ratio", op: ">=", v: 2 }] },
    change: null,
    stop: { all: [{ m: "outreached", op: ">=", v: 40 }, { m: "proposal_rate", op: "<", v: 0.05 }, { m: "signed_deals", op: "<=", v: 0 }] },
  },
];