import { formatInr } from "./money";
import { TERMS_LABELS, type PaymentTerms } from "./payments";

/** Everything legal in this file is a placeholder. Replace it with cleared wording before any MoU is used. */
export const MOU_BANNER = "Template wording pending clearance";
export const POST_EVENT_REPORT_LINE = "Post-event report";
export const DELIVERY_WINDOW_PLACEHOLDER = "[Delivery window: to be confirmed with Cul-Ad before use]";
export const CLAUSES_PLACEHOLDER = "[Clause wording pending clearance. Insert the approved terms here.]";

export type MouFields = {
  brandName: string;
  officialAddress: string;
  signatoryName: string;
  signatoryDesignation: string;
  tagline: string;
  deliverables: { name: string; qty: number }[];
  amountInr: number;
  terms: PaymentTerms;
  gstin: string;
  mouDate: string;
  proformaDueDate: string;
  deliveryWindow?: string;
};

export type MouSection = { heading: string; lines: string[] };

export function renderMou(f: MouFields, eventName: string): { banner: string; title: string; sections: MouSection[] } {
  return {
    banner: MOU_BANNER,
    title: `Memorandum of Understanding: ${eventName} x ${f.brandName}`,
    sections: [
      { heading: "Parties", lines: [`Sponsor: ${f.brandName}`, `Address: ${f.officialAddress}`, `Signing authority: ${f.signatoryName}, ${f.signatoryDesignation}`, f.tagline ? `Brand tagline: ${f.tagline}` : ""].filter(Boolean) },
      {
        heading: "Deliverables",
        lines: [
          ...f.deliverables.map((d) => `${d.qty} x ${d.name}`),
          POST_EVENT_REPORT_LINE,
          `Delivery window: ${f.deliveryWindow?.trim() || DELIVERY_WINDOW_PLACEHOLDER}`,
        ],
      },
      { heading: "Commercials", lines: [`Total amount: ${formatInr(f.amountInr)}`, `Payment split: ${TERMS_LABELS[f.terms]}`] },
      { heading: "Proforma invoice", lines: [`GSTIN: ${f.gstin}`, `Date: ${f.mouDate}`, `Pre-fest payment due: ${f.proformaDueDate}`] },
      { heading: "Terms", lines: [CLAUSES_PLACEHOLDER] },
      { heading: "Signatures", lines: [`For ${eventName}: ______________________`, `For ${f.brandName}: ______________________ (${f.signatoryName})`] },
    ],
  };
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Field-by-field errors. An empty object means the MoU can be generated. */
export function validateMou(f: MouFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.brandName.trim()) e.brandName = "Enter the brand name.";
  if (!f.officialAddress.trim()) e.officialAddress = "Enter the official address.";
  if (!f.signatoryName.trim()) e.signatoryName = "Enter the signing authority's name.";
  if (!f.signatoryDesignation.trim()) e.signatoryDesignation = "Enter their designation.";
  if (!GSTIN.test(f.gstin.trim().toUpperCase())) e.gstin = "Enter a valid 15-character GSTIN.";
  if (!(f.amountInr > 0)) e.amountInr = "The amount must be above zero.";
  if (f.deliverables.length === 0) e.deliverables = "Add at least one deliverable.";
  if (!DAY.test(f.mouDate)) e.mouDate = "Enter the MoU date.";
  if (!DAY.test(f.proformaDueDate)) e.proformaDueDate = "Enter the pre-fest due date.";
  else if (DAY.test(f.mouDate) && f.proformaDueDate < f.mouDate) e.proformaDueDate = "The due date can't be before the MoU date.";
  return e;
}