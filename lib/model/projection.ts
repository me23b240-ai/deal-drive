export type ProjectionInput = {
  signedToDate: number;
  openProspectInr: number;
  closeRate: number;
  inkindShare: number;
  prefestShare: number;
  avgNewDeal: number;
  warm: { leads: number; response: number; proposalRate: number; signRate: number };
  other: { leads: number; response: number; proposalRate: number; signRate: number };
};

export type ProjectionResult = {
  signed: number;
  cashBeforeFest: number;
};

export function project(input: ProjectionInput): ProjectionResult {
  const warmDeals =
    input.warm.leads * input.warm.response * input.warm.proposalRate * input.warm.signRate;
  const otherDeals =
    input.other.leads * input.other.response * input.other.proposalRate * input.other.signRate;
  const signed =
    input.signedToDate +
    input.openProspectInr * input.closeRate +
    (warmDeals + otherDeals) * input.avgNewDeal;
  const cashBeforeFest = signed * (1 - input.inkindShare) * input.prefestShare;
  return { signed, cashBeforeFest };
}
