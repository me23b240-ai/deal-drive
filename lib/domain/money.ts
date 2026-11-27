const RUPEE = "\u20B9";

function groupIndian(amount: number): string {
  const digits = Math.abs(Math.round(amount)).toString();
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "-";
  const sign = Math.round(amount) < 0 ? "-" : "";
  return `${sign}${RUPEE}${groupIndian(amount)}`;
}

export function formatLakh(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "-";
  const sign = amount < 0 ? "-" : "";
  return `${sign}${RUPEE}${(Math.abs(amount) / 100_000).toFixed(1)}L`;
}

export function parseInr(input: string): number | null {
  const cleaned = input.replace(/[\u20B9,\s]/g, "").toLowerCase();
  if (!cleaned) return null;
  const lakh = cleaned.endsWith("l");
  const value = Number(lakh ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(lakh ? value * 100_000 : value);
}