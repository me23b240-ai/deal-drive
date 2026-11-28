export type PaymentTerms = "100_0" | "75_25" | "50_50";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  return `${TENS[Math.floor(n / 10)] ?? ""}${n % 10 ? `-${ONES[n % 10] ?? ""}` : ""}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h] ?? ""} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/** 500000 -> "INR Five Lakhs only" (Indian numbering). Whole rupees only. */
export function inrInWords(amount: number): string {
  let n = Math.round(amount);
  if (n <= 0) return "INR Zero only";
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const parts = [
    crore ? `${below100(crore)} ${crore === 1 ? "Crore" : "Crores"}` : "",
    lakh ? `${below100(lakh)} ${lakh === 1 ? "Lakh" : "Lakhs"}` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    n ? below1000(n) : "",
  ].filter(Boolean);
  return `INR ${parts.join(" ")} only`;
}

/** 500000 -> "5,00,000" */
export function groupIndian(amount: number): string {
  const digits = Math.abs(Math.round(amount)).toString();
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}`;
}

export function toRoman(n: number): string {
  const map: [number, string][] = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let rest = n;
  for (const [v, s] of map) while (rest >= v) { out += s; rest -= v; }
  return out;
}

export const PRE_FEST_DUE_TEXT = "5th January 2027";

/** 100/0 uses the IITM template sentence word for word. Other splits need wording approved by IITMSTACT, so they get a visible placeholder. */
export function paymentSentence(terms: PaymentTerms, amountInr: number): { text: string; needsReview: boolean } {
  if (terms === "100_0") return { text: `100% of the payment should be made by ${PRE_FEST_DUE_TEXT}.`, needsReview: false };
  const pre = terms === "75_25" ? 75 : 50;
  const preAmt = Math.round((amountInr * pre) / 100);
  return {
    text: `[PAYMENT SCHEDULE TO BE APPROVED BY IITMSTACT BEFORE SENDING: ${pre}% (INR ${groupIndian(preAmt)}/-) by ${PRE_FEST_DUE_TEXT} and ${100 - pre}% (INR ${groupIndian(amountInr - preAmt)}/-) by [date].]`,
    needsReview: true,
  };
}