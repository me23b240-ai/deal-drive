import type { RuleClause, RuleJson } from "../../domain/rules-engine";

const all = (...c: RuleClause[]): RuleJson => ({ all: c });

export type SeedBet = {
  code: string;
  name: string;
  concept: string;
  owner: string;
  start: string;
  end: string;
  budget: number;
  spend: number;
  kpis: Record<string, string>;
  scale: RuleJson | null;
  change: RuleJson | null;
  stop: RuleJson | null;
  expected: number;
};

export const INITIATIVES: SeedBet[] = [
  {
    code: "bet-1", name: "Deal desk + MoU in minutes",
    concept: "Closing squad on the open prospects: custom slab within 1 business day, MoU generated and sent in minutes, daily 15-minute stand-up.",
    owner: "head", start: "2026-11-30", end: "2027-01-05", budget: 0, spend: 0, expected: 830_250,
    kpis: { primary: "Open prospects closed", secondary: "Negotiating count and MoU wait" },
    scale: all({ m: "negotiating_count", op: ">=", v: 5 }, { m: "today", op: "<=", v: 20261211 }),
    change: all({ m: "top5_max_idle_bdays", op: ">", v: 3 }),
    stop: all({ m: "deals_idle_gt10_after_3_nudges", op: ">=", v: 1 }),
  },
  {
    code: "bet-2", name: "Warm network engine",
    concept: "Work past sponsors, other-fest sponsors and peer-fest sponsors first, with sector hooks from the fact bank.",
    owner: "head", start: "2026-11-30", end: "2026-12-18", budget: 0, spend: 0, expected: 423_731,
    kpis: { primary: "Response rate on warm leads", secondary: "Proposal rate" },
    scale: all({ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.5 }, { m: "proposal_rate", op: ">=", v: 0.4 }),
    change: all({ m: "outreached", op: ">=", v: 20 }, { m: "response_rate", op: ">=", v: 0.3 }, { m: "response_rate", op: "<", v: 0.5 }),
    stop: all({ m: "outreached", op: ">=", v: 30 }, { m: "response_rate", op: "<", v: 0.2 }),
  },
  {
    code: "bet-3", name: "Offer design",
    concept: "Cash-first terms, bundles and UGC add-ons, and an early-bird discount for full payment, so the average deal rises above the baseline.",
    owner: "head", start: "2026-11-30", end: "2026-12-14", budget: 10_000, spend: 0, expected: 335_003,
    kpis: { primary: "Average proposed amount", secondary: "Bundle share and pre-fest share" },
    scale: all({ m: "proposals_count", op: ">=", v: 10 }, { m: "bundle_share", op: ">=", v: 0.3 }, { m: "avg_proposed_inr", op: ">=", v: 125000 }),
    change: all({ m: "proposals_count", op: ">=", v: 10 }, { m: "avg_proposed_inr", op: "<", v: 110000 }),
    stop: all({ m: "today", op: ">=", v: 20261214 }, { m: "bundle_share", op: "<", v: 0.1 }),
  },
  {
    code: "bet-4", name: "Referral and intro magnet",
    concept: "Ask every warm contact and signed sponsor for introductions, and work dean, director and alumni routes.",
    owner: "head", start: "2026-11-30", end: "2026-12-18", budget: 5_000, spend: 0, expected: 141_244,
    kpis: { primary: "Intros given per ask", secondary: "Intro asks made" },
    scale: all({ m: "intro_asks", op: ">=", v: 10 }, { m: "intro_yield", op: ">=", v: 0.3 }),
    change: all({ m: "intro_asks", op: ">=", v: 10 }, { m: "intro_yield", op: ">=", v: 0.1 }, { m: "intro_yield", op: "<", v: 0.3 }),
    stop: all({ m: "intro_asks", op: ">=", v: 10 }, { m: "intro_yield", op: "<", v: 0.1 }),
  },
  {
    code: "bet-5", name: "Lead engine + capped cold/signal test",
    concept: "Keep a pipeline of qualified candidates from signals and peer fests, plus a capped cold test of personalised vs template openings with a hard stop.",
    owner: "head", start: "2026-11-30", end: "2026-12-11", budget: 15_000, spend: 0, expected: 26_367,
    kpis: { primary: "Qualified candidates", secondary: "Personalised vs template ratio" },
    scale: all({ m: "personalised_vs_template_ratio", op: ">=", v: 2 }),
    // The cold-test stop sits in the change slot because a campaign has one stop rule (the engine stop).
    change: all({ m: "outreached", op: ">=", v: 40 }, { m: "proposal_rate", op: "<", v: 0.05 }, { m: "signed_deals", op: "=", v: 0 }),
    stop: all({ m: "today", op: ">=", v: 20261204 }, { m: "qualified_candidates", op: "<", v: 20 }),
  },
];

/** [gate date, base signed, stretch signed]. Pacing is 20/40/60 percent of the uplift over today. */
export const GATES: ReadonlyArray<[string, number, number]> = [
  ["2026-12-07", 1_321_500, 1_581_500],
  ["2026-12-14", 1_543_000, 2_063_000],
  ["2026-12-21", 1_764_500, 2_544_500],
];