import { requireHead } from "../guards";
import type { Ctx, TeamWeekSummary } from "../../types";
import { getHeadKpis, type HeadKpis } from "./overview";
import { getSignedDeals } from "./plan";
import { getTeamWeekSummary } from "./weekly";

export type OverviewData = {
  kpis: HeadKpis;
  week: TeamWeekSummary;
  signedCashInr: number;
  signedInKindInr: number;
};

export async function getOverviewData(ctx: Ctx): Promise<OverviewData> {
  requireHead(ctx);
  const [kpis, week, signed] = await Promise.all([getHeadKpis(ctx), getTeamWeekSummary(ctx), getSignedDeals(ctx)]);
  return {
    kpis,
    week,
    signedCashInr: signed.reduce((t, d) => t + d.cashInr, 0),
    signedInKindInr: signed.reduce((t, d) => t + d.inKindInr, 0),
  };
}