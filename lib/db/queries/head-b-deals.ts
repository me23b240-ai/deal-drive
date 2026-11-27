import { assertWritable, requireHead } from "../guards";
import type { Ctx } from "../../types";
import { nudgeDeal, updateDeal } from "./crm-deals";
import { num } from "./page";
import { listTeam } from "./team";
import { getDealDesk } from "./views";

export type DealRow = {
  dealId: string;
  brandId: string;
  company: string;
  ownerName: string;
  stage: string;
  proposedInr: number;
  nextFollowUp: string | null;
  idleBdays: number;
  nudges: number;
  rank: number;
  isTop5: boolean;
};

export type DealBoard = { rows: DealRow[]; totalInr: number; top5Inr: number; top5Share: number | null; today: string };

type StageArg = NonNullable<Parameters<typeof updateDeal>[2]["stage"]>;

export async function getDealBoard(ctx: Ctx): Promise<DealBoard> {
  requireHead(ctx);
  const [desk, team] = await Promise.all([getDealDesk(ctx), listTeam(ctx.eventId)]);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const rows = desk.map(
    (r, i): DealRow => ({
      dealId: String(r.deal_id),
      brandId: String(r.brand_id),
      company: r.company,
      ownerName: r.owner_id ? (nameOf.get(r.owner_id) ?? "Unknown") : "Unassigned",
      stage: String(r.stage),
      proposedInr: num(r.proposed_inr),
      nextFollowUp: r.next_follow_up ?? null,
      idleBdays: num(r.idle_bdays),
      nudges: num(r.nudges),
      rank: i + 1,
      isTop5: i < 5,
    }),
  );
  const totalInr = rows.reduce((t, r) => t + r.proposedInr, 0);
  const top5Inr = rows.filter((r) => r.isTop5).reduce((t, r) => t + r.proposedInr, 0);
  return { rows, totalInr, top5Inr, top5Share: totalInr > 0 ? top5Inr / totalInr : null, today: ctx.todayIst };
}

export async function setOpenStage(ctx: Ctx, dealId: string, stage: StageArg): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  await updateDeal(ctx, dealId, { stage });
}

export async function nudgeOpenDeal(ctx: Ctx, dealId: string): Promise<void> {
  requireHead(ctx);
  assertWritable(ctx);
  await nudgeDeal(ctx, dealId);
}