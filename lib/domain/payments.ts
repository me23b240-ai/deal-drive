import { addDays } from "./bizdays";

export type PaymentTerms = "100_0" | "75_25" | "50_50";
export const PAYMENT_TERMS: PaymentTerms[] = ["100_0", "75_25", "50_50"];
export const TERMS_LABELS: Record<PaymentTerms, string> = {
  "100_0": "100% before the fest",
  "75_25": "75% before, 25% after",
  "50_50": "50% before, 50% after",
};

/** Share of the cash paid before the fest. */
export const PRE_FEST_SHARE: Record<PaymentTerms, number> = { "100_0": 1, "75_25": 0.75, "50_50": 0.5 };

/** Placeholders to confirm: pre-fest cash is due this many days before the fest starts, post-fest cash this many days after it ends. */
export const PRE_FEST_DUE_DAYS_BEFORE_START = 7;
export const POST_FEST_DUE_DAYS_AFTER_END = 15;

export type PaymentRow = { phase: "pre_fest" | "post_fest"; amountInr: number; dueOn: string; note: string };

export function preFestCash(cashInr: number, terms: PaymentTerms): number {
  return Math.round(Math.max(0, cashInr) * PRE_FEST_SHARE[terms]);
}

/** Payment rows for the cash part of a deal. In-kind has no instalments, so only cash is passed in. */
export function paymentRowsByTerms(input: { terms: PaymentTerms; cashInr: number; eventStart: string; eventEnd: string; dues?: { pre: string; post: string } }): PaymentRow[] {
  const cash = Math.max(0, Math.round(input.cashInr));
  if (cash === 0) return [];
  const pre = preFestCash(cash, input.terms);
  const post = cash - pre;
  const rows: PaymentRow[] = [];
  if (pre > 0) {
    rows.push({ phase: "pre_fest", amountInr: pre, dueOn: input.dues?.pre ?? addDays(input.eventStart, -PRE_FEST_DUE_DAYS_BEFORE_START), note: `Pre-fest instalment (${TERMS_LABELS[input.terms]})` });
  }
  if (post > 0) {
    rows.push({ phase: "post_fest", amountInr: post, dueOn: input.dues?.post ?? addDays(input.eventEnd, POST_FEST_DUE_DAYS_AFTER_END), note: `Post-fest instalment (${TERMS_LABELS[input.terms]})` });
  }
  return rows;
}
/** Legacy and unknown terms fall back to 75/25, which is what the Saarang plan and the seeded payments use. */
export const DEFAULT_TERMS: PaymentTerms = "75_25";

export function isPaymentTerms(v: unknown): v is PaymentTerms {
  return typeof v === "string" && (PAYMENT_TERMS as string[]).includes(v);
}

export function prefestShareFor(terms: string | null | undefined): number {
  return PRE_FEST_SHARE[isPaymentTerms(terms) ? terms : DEFAULT_TERMS];
}

export function paymentSplit(cashInr: number, terms: string | null | undefined): { share: number; pre: number; post: number } {
  const cash = Math.max(0, Math.round(cashInr));
  const share = prefestShareFor(terms);
  const pre = Math.round(cash * share);
  return { share, pre, post: cash - pre };
}

export type PaymentDues = { pre: string; post: string };
/** The due dates already used for the seeded Saarang payments. Override under events.model_assumptions.payments. */
export const DEFAULT_PAYMENT_DUES: PaymentDues = { pre: "2027-01-05", post: "2027-02-09" };

export function readPaymentDues(modelAssumptions: Record<string, unknown>): PaymentDues {
  const raw = modelAssumptions.payments;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ok = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return { pre: ok(o.preFestDueOn) ? o.preFestDueOn : DEFAULT_PAYMENT_DUES.pre, post: ok(o.postFestDueOn) ? o.postFestDueOn : DEFAULT_PAYMENT_DUES.post };
}