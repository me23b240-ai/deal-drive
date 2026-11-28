import { businessDaysBetween, toIstDate, type Holiday } from "../domain/bizdays";
import { prefestShareFor } from "../domain/payments";
import type { MetricSet } from "./derive";

export const PROPOSAL_STAGES = ["proposal_sent", "negotiating", "mou_sent", "partner_confirmed"];

export type DealLite = {
  id: string;
  stage: string;
  proposedInr: number;
  signedCashInr: number;
  paymentTerms: string | null;
  confirmedOn: string | null;
};
export type ItemLite = { dealId: string; isUgc: boolean; category: string | null };

const isPackage = (category: string | null): boolean => !!category && /package|bundle/i.test(category);

export function mergeSets(a: MetricSet, b: MetricSet): MetricSet {
  return { metrics: { ...a.metrics, ...b.metrics }, counts: { ...a.counts, ...b.counts } };
}

/** Offer design metrics. A proposal is a deal that reached proposal sent or beyond. */
export function offerMetrics(deals: DealLite[], items: ItemLite[], deadline: string, today: number): MetricSet {
  const proposals = deals.filter((d) => PROPOSAL_STAGES.includes(d.stage));
  const bundled = new Set(items.filter((i) => i.isUgc || isPackage(i.category)).map((i) => i.dealId));
  const withBundle = proposals.filter((d) => bundled.has(d.id)).length;
  const avg = proposals.length ? proposals.reduce((t, d) => t + d.proposedInr, 0) / proposals.length : undefined;

  const signed = deals.filter((d) => d.stage === "partner_confirmed");
  const cash = signed.reduce((t, d) => t + d.signedCashInr, 0);
  const preCash = signed.reduce((t, d) => t + d.signedCashInr * prefestShareFor(d.paymentTerms), 0);
  const early = signed.filter((d) => d.paymentTerms === "100_0" && d.confirmedOn !== null && d.confirmedOn <= deadline).length;

  return {
    metrics: {
      proposals_count: proposals.length,
      bundle_share: proposals.length ? withBundle / proposals.length : undefined,
      avg_proposed_inr: avg,
      prefest_share: cash > 0 ? preCash / cash : undefined,
      early_bird_share: signed.length ? early / signed.length : undefined,
      today,
    },
    counts: {
      proposals_count: `${proposals.length} proposals`,
      bundle_share: `${withBundle} of ${proposals.length} proposals include a bundle or UGC item`,
      avg_proposed_inr: avg === undefined ? "no proposals yet" : `average proposal ${Math.round(avg)}`,
      prefest_share: cash > 0 ? `${Math.round((100 * preCash) / cash)}% of signed cash is pre-fest` : "no signed cash yet",
      early_bird_share: `${early} of ${signed.length} signed deals paid in full by ${deadline}`,
    },
  };
}

export function introMetrics(asks: number, given: number): MetricSet {
  return {
    metrics: { intro_asks: asks, intro_yield: asks > 0 ? given / asks : undefined },
    counts: { intro_asks: `${asks} intro asks`, intro_yield: `${given} intros given from ${asks} asks` },
  };
}

export function engineMetrics(qualified: number): MetricSet {
  return { metrics: { qualified_candidates: qualified }, counts: { qualified_candidates: `${qualified} qualified candidates` } };
}

/** Longest wait, in business days, of a deal whose MoU was sent but is not signed yet. */
export function mouLagMax(deals: { stage: string; mouSentAt: string | null }[], today: string, holidays: Holiday[]): number {
  let max = 0;
  for (const d of deals) {
    if (d.stage !== "mou_sent" || !d.mouSentAt) continue;
    max = Math.max(max, businessDaysBetween(toIstDate(d.mouSentAt), today, holidays));
  }
  return max;
}