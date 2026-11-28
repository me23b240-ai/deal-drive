import { STATUS_CODES, STATUS_LABELS, type StatusCode } from "./status";

export const TERMINAL_STATUSES: StatusCode[] = ["converted", "rejected", "left_company", "wrong_number"];

export type StatusChangeInput = {
  brandId: string;
  to: StatusCode;
  note?: string | null;
  approxAmountInr?: number | null;
  nextFollowUp?: string | null;
  finalAmountInr?: number | null;
  inKindInr?: number | null;
  rejectionReason?: string | null;
};

/** Mirrors the database guards (Didn't Pick and Ghosting) and adds the owner's flow rules. */
export function isLegalTransition(from: StatusCode, to: StatusCode): boolean {
  if (from === to) return false;
  if (TERMINAL_STATUSES.includes(from)) return false;
  switch (to) {
    case "to_contact":
      return false;
    case "send_mail":
      return from === "to_contact";
    case "slabs_sent":
    case "didnt_pick":
      return from === "to_contact" || from === "send_mail";
    case "ghosting":
      return from === "contacted" || from === "prospective";
    case "converted":
      return from === "prospective" || from === "contacted" || from === "ghosting";
    default:
      return true;
  }
}

/** Statuses a coordinator can pick from the dropdown. Slabs sent is set by "Mark mail sent", not here. */
export function legalNextStatuses(from: StatusCode): StatusCode[] {
  return STATUS_CODES.filter((s) => s !== "slabs_sent" && s !== "converted" && isLegalTransition(from, s));
}

/** Returns a friendly message for the first problem, or null when the change is allowed. */
export function validateTransition(from: StatusCode, input: StatusChangeInput): string | null {
  const to = input.to;
  if (TERMINAL_STATUSES.includes(from)) return `${STATUS_LABELS[from]} is final, so this company can't be moved.`;
  if (!isLegalTransition(from, to)) {
    if (to === "didnt_pick") return "Didn't Pick is only valid from To Contact or Send Mail.";
    if (to === "ghosting") return "Ghosting is only valid from Contacted or Prospective.";
    if (to === "converted") return "Converted needs the company to be Prospective, Contacted or Ghosting first.";
    return `Can't move from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.`;
  }
  if (to === "prospective" && !((input.approxAmountInr ?? 0) > 0)) return "Prospective needs an approximate amount.";
  if (to === "converted") {
    const final = input.finalAmountInr ?? 0;
    const inKind = input.inKindInr ?? 0;
    if (!(final > 0)) return "Converted needs the final amount.";
    if (inKind < 0 || inKind > final) return "In-kind must be between zero and the final amount.";
  }
  if (to === "rejected" && !(input.rejectionReason ?? "").trim()) return "Rejected needs a reason.";
  return null;
}

// ---- deal stages ----

export const OPEN_STAGES = ["prospecting", "proposal_sent", "negotiating", "mou_sent"] as const;
export const ALL_DEAL_STAGES = [...OPEN_STAGES, "partner_confirmed", "lost"] as const;
export type DealStageCode = (typeof ALL_DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStageCode, string> = {
  prospecting: "Prospecting",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  mou_sent: "MoU sent",
  partner_confirmed: "Partner confirmed",
  lost: "Lost",
};

/** Open stages move freely. Confirming needs a sent MoU. Lost is reachable from any open stage. */
export function isLegalDealMove(from: DealStageCode, to: DealStageCode): boolean {
  if (from === to) return false;
  if (from === "partner_confirmed" || from === "lost") return false;
  if (to === "partner_confirmed") return from === "mou_sent";
  return true;
}

export function legalNextDealStages(from: DealStageCode): DealStageCode[] {
  return ALL_DEAL_STAGES.filter((s) => isLegalDealMove(from, s));
}