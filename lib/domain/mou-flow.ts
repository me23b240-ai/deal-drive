import { addDays } from "./bizdays";
import { PRE_FEST_DUE_DAYS_BEFORE_START } from "./payments";

export type ItemRow = { category: string | null; qty: number; unitPriceInr: number; inKind: boolean };

/** Totals for a deal's slab lines. The discount is stored as a "Discount" line and is taken off the total. */
export function dealTotals(rows: ItemRow[]): { count: number; totalInr: number; inKindInr: number; cashInr: number; discountInr: number } {
  const discountInr = rows.filter((r) => r.category === "Discount").reduce((s, r) => s + r.unitPriceInr, 0);
  const real = rows.filter((r) => r.category !== "Discount");
  const gross = real.reduce((s, r) => s + r.qty * r.unitPriceInr, 0);
  const totalInr = Math.max(0, gross - discountInr);
  const inKindInr = real.filter((r) => r.inKind).reduce((s, r) => s + r.qty * r.unitPriceInr, 0);
  return { count: real.length, totalInr, inKindInr, cashInr: Math.max(0, totalInr - inKindInr), discountInr };
}

/** The proforma's pre-fest due date: a week before the fest, but never before the MoU date. */
export function defaultProformaDue(eventStart: string, mouDate: string): string {
  const due = addDays(eventStart, -PRE_FEST_DUE_DAYS_BEFORE_START);
  return due < mouDate ? mouDate : due;
}