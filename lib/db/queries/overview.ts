import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { buildKpis, type BrandRow, type Kpis, type WarmthRow } from "../../model/derive";
import { fetchAll, num } from "./page";
import { getBrandRows, getSignedDeals } from "./plan";

export type HeadKpis = Kpis & {
  prospective: { count: number; inr: number };
  signedInr: number;
  signedDeals: number;
  cashScheduledInr: number;
  cashCollectedInr: number;
  cashPendingInr: number;
};

export async function getHeadKpis(ctx: Ctx): Promise<HeadKpis> {
  requireHead(ctx);
  const [warmth, cash, brands, signed] = await Promise.all([
    fetchAll<Record<string, unknown>>("v_warmth_funnel", "*", { event_id: ctx.eventId }),
    fetchAll<Record<string, unknown>>("v_cash_summary", "*", { event_id: ctx.eventId }),
    getBrandRows(ctx),
    getSignedDeals(ctx),
  ]);
  const rows: WarmthRow[] = warmth.map((r) => ({
    companies: num(r.companies),
    outreached: num(r.outreached),
    responded: num(r.responded),
    prospective_or_better: num(r.prospective_or_better),
    converted: num(r.converted),
  }));
  const sum = (key: string): number => cash.reduce((t, r) => t + num(r[key]), 0);
  const scheduled = sum("pre_fest_scheduled_inr") + sum("post_fest_scheduled_inr");
  const collected = sum("pre_fest_collected_inr") + sum("post_fest_collected_inr");
  const prospects: BrandRow[] = brands.filter((b) => b.crm_status === "prospective");
  return {
    ...buildKpis(rows),
    prospective: { count: prospects.length, inr: prospects.reduce((t, b) => t + b.approx_amount_inr, 0) },
    signedInr: signed.reduce((t, d) => t + d.amountInr, 0),
    signedDeals: signed.length,
    cashScheduledInr: scheduled,
    cashCollectedInr: collected,
    cashPendingInr: scheduled - collected,
  };
}