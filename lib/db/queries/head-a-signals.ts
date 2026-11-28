import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { businessDaysBetween, toIstDate } from "../../domain/bizdays";
import type { V2Signals } from "../../domain/decisions";
import { getHolidays } from "./holidays";
import { fetchAll, num } from "./page";
import { getBrandRows } from "./plan";
import { getAssumptions } from "./settings";
import { listTeam } from "./team";

type Row = Record<string, unknown>;

export const UPSIDE_BY_DATE = "2026-12-11";

/** MoU waits, pending terms, peer-fest research and the upside trigger, for the decisions list. */
export async function getV2Signals(ctx: Ctx): Promise<V2Signals> {
  requireHead(ctx);
  const [team, holidays, brands, deals, fests, cands] = await Promise.all([
    listTeam(ctx.eventId),
    getHolidays(ctx.eventId),
    getBrandRows(ctx),
    fetchAll<Row>("deals", "id, brand_id, owner_id, stage, proposed_value_inr, mou_sent_at, terms_status, stage_changed_at, created_at", { event_id: ctx.eventId }),
    fetchAll<Row>("peer_fests", "id, research_status", { event_id: ctx.eventId }),
    fetchAll<Row>("lead_candidates", "status, source_channel, signal_tag", { event_id: ctx.eventId }),
  ]);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const company = new Map(brands.map((b) => [b.id, b.name]));
  const age = (r: Row, key: string): number => {
    const at = (r[key] as string | null) ?? (r.stage_changed_at as string | null) ?? (r.created_at as string | null);
    return at ? businessDaysBetween(toIstDate(at), ctx.todayIst, holidays) : 0;
  };
  const ownerOf = (r: Row): string | null => (r.owner_id as string | null) ?? null;
  const ownerName = (r: Row): string => nameOf.get(ownerOf(r) ?? "") ?? "Unassigned";

  const mouSent = deals
    .filter((r) => r.stage === "mou_sent")
    .map((r) => ({
      dealId: String(r.id),
      company: company.get(String(r.brand_id)) ?? "Unknown",
      ownerId: ownerOf(r),
      ownerName: ownerName(r),
      amountInr: num(r.proposed_value_inr),
      lagBdays: age(r, "mou_sent_at"),
    }));
  const termsPending = deals
    .filter((r) => r.terms_status === "pending_approval")
    .map((r) => ({
      dealId: String(r.id),
      company: company.get(String(r.brand_id)) ?? "Unknown",
      ownerName: ownerName(r),
      amountInr: num(r.proposed_value_inr),
      ageBdays: age(r, "stage_changed_at"),
    }));

  const extra = cands.filter(
    (c) => c.status !== "duplicate" && c.status !== "not_fit" && (c.signal_tag === "peer_fest" || c.source_channel === "peer_fest"),
  ).length;

  return {
    mouSent,
    termsPending,
    peerFest: {
      total: fests.length,
      notStarted: fests.filter((f) => f.research_status === "todo").length,
      bdaysSincePlanStart: businessDaysBetween(getAssumptions(ctx).plan_start, ctx.todayIst, holidays),
    },
    upside: { extraQualified: extra, byDate: UPSIDE_BY_DATE, today: ctx.todayIst },
  };
}