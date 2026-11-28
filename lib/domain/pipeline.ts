export const PIPELINE_STEPS = [
  "Outreach",
  "Contact established",
  "Proposal and slabs reviewed",
  "Interested deliverables captured",
  "Negotiate",
  "Finalise",
  "MoU sent",
  "MoU signed by both sides",
] as const;

export type PipelineFacts = { crmStatus: string; dealStage: string | null; itemCount: number; paymentTerms: string | null; termsStatus: string | null };

/** Which of the eight stepper stages a company is at (0 to 7). */
export function pipelineStep(f: PipelineFacts): number {
  if (f.crmStatus === "converted" || f.dealStage === "partner_confirmed") return 7;
  if (f.dealStage === "mou_sent") return 6;
  if (f.dealStage === "negotiating") return f.itemCount > 0 && f.paymentTerms && f.termsStatus !== "pending_approval" ? 5 : 4;
  if (f.dealStage === "proposal_sent") return f.itemCount > 0 ? 3 : 2;
  if (f.crmStatus === "contacted" || f.crmStatus === "prospective") return 1;
  return 0;
}

const ORDER = ["prospecting", "proposal_sent", "negotiating", "mou_sent", "partner_confirmed"];
const LABEL: Record<string, string> = {
  prospecting: "Prospecting",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  mou_sent: "MoU sent",
  partner_confirmed: "Partner confirmed",
};

export type DealFacts = { itemCount: number; paymentTerms: string | null; termsStatus: string | null; mouSignedOn: string | null };

export function validateConversion(f: DealFacts): string | null {
  if (!f.mouSignedOn) return "Converted needs the MoU signed date.";
  if (!f.paymentTerms) return "Choose the payment terms first.";
  if (f.itemCount < 1) return "Add at least one deliverable to the deal first.";
  if (f.termsStatus === "rejected") return "The head rejected these terms. Revise the slab first.";
  if (f.termsStatus === "pending_approval") return "These terms need head approval before the deal can close.";
  return null;
}

/** Friendly message when a deal stage move is not allowed, or null when it is. */
export function checkDealMove(from: string, to: string, f: DealFacts): string | null {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  if (a < 0 || b < 0) return "That stage can't be set here.";
  if (a === b) return "The deal is already at that stage.";
  if (to === "partner_confirmed") return from === "mou_sent" ? validateConversion(f) : "Send the MoU before marking it signed.";
  if (b > a + 1) return `Finish ${LABEL[ORDER[a + 1] ?? ""] ?? "the earlier stage"} first.`;
  if (to === "mou_sent") {
    if (f.itemCount < 1) return "Add at least one deliverable before sending the MoU.";
    if (!f.paymentTerms) return "Choose the payment terms before sending the MoU.";
    if (f.termsStatus === "rejected") return "The head rejected these terms. Revise the slab before sending the MoU.";
    if (f.termsStatus === "pending_approval") return "Needs head approval before the MoU can go out.";
  }
  return null;
}