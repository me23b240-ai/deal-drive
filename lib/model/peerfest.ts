export const SAARANG_START = "2027-01-06";
export const SAARANG_END = "2027-01-10";
export const MIN_SCORE_N = 20;

export type Timing = "before" | "after";

/** A fest that starts before Saarang is "before", otherwise "after". Undated fests have no tag. */
export function festTiming(startsOn: string | null): Timing | null {
  if (!startsOn) return null;
  return startsOn < SAARANG_START ? "before" : "after";
}

export type ScoreInput = { festId: string; outreached: boolean; responded: boolean; proposal: boolean; signed: boolean };

export type Score = {
  n: number;
  responded: number;
  proposals: number;
  signed: number;
  responseRate: number | null;
  proposalRate: number | null;
  signRate: number | null;
  insufficient: boolean;
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Response = responded / outreached, proposal = proposals / responded, sign = signed / proposals. */
export function scoreOf(rows: ScoreInput[]): Score {
  const n = rows.filter((r) => r.outreached).length;
  const responded = rows.filter((r) => r.outreached && r.responded).length;
  const proposals = rows.filter((r) => r.outreached && r.proposal).length;
  const signed = rows.filter((r) => r.outreached && r.signed).length;
  return {
    n,
    responded,
    proposals,
    signed,
    responseRate: ratio(responded, n),
    proposalRate: ratio(proposals, responded),
    signRate: ratio(signed, proposals),
    insufficient: n < MIN_SCORE_N,
  };
}

export type Scorecard = {
  byFest: { festId: string; name: string; timing: Timing | null; score: Score }[];
  byTiming: { timing: Timing; score: Score }[];
};

export function buildScorecard(rows: ScoreInput[], fests: { id: string; name: string; timing: Timing | null }[]): Scorecard {
  const timingOf = new Map(fests.map((f) => [f.id, f.timing]));
  return {
    byFest: fests.map((f) => ({ festId: f.id, name: f.name, timing: f.timing, score: scoreOf(rows.filter((r) => r.festId === f.id)) })),
    byTiming: (["before", "after"] as const).map((t) => ({ timing: t, score: scoreOf(rows.filter((r) => timingOf.get(r.festId) === t)) })),
  };
}