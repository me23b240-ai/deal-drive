export const IN_KIND_LIMIT = 0.05;

export type ApprovalInput = {
  paymentTerms: string | null;
  proposedInr: number;
  inKindInr: number;
  catalogFloorInr: number | null;
};

export type ApprovalReason = "terms_50_50" | "in_kind_over_5" | "price_below_catalog";

export const REASON_TEXT: Record<ApprovalReason, string> = {
  terms_50_50: "50/50 payment terms",
  in_kind_over_5: "In-kind is above 5% of the deal",
  price_below_catalog: "Price is below the sum of catalog minimums",
};

/** Reasons a deal needs the head's approval. Empty means the terms are automatic. */
export function approvalReasons(d: ApprovalInput): ApprovalReason[] {
  const out: ApprovalReason[] = [];
  if (d.paymentTerms === "50_50") out.push("terms_50_50");
  if (d.proposedInr > 0 && d.inKindInr / d.proposedInr > IN_KIND_LIMIT) out.push("in_kind_over_5");
  if (d.catalogFloorInr !== null && d.catalogFloorInr > 0 && d.proposedInr < d.catalogFloorInr) out.push("price_below_catalog");
  return out;
}