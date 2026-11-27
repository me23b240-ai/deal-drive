import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { toIstDate } from "../../domain/bizdays";
import { num } from "./page";
import { coordinatorsOf, listTeam } from "./team";
import { getCoordSummary, getNeedsUpdate } from "./views";
import { getTeamWeekSummary } from "./weekly";

export type TeamRow = {
  memberId: string;
  name: string;
  totalOutreached: number;
  thisWeek: number;
  target: number;
  responded: number;
  converted: number;
  prospective: number;
  rejected: number;
  ghosting: number;
  approxInr: number;
  finalInr: number;
  needsUpdate: number;
  lastActive: string | null;
};

export type TeamTableData = { weekStart: string; rows: TeamRow[]; totals: TeamRow };

const SUM_KEYS = [
  "totalOutreached",
  "thisWeek",
  "target",
  "responded",
  "converted",
  "prospective",
  "rejected",
  "ghosting",
  "approxInr",
  "finalInr",
  "needsUpdate",
] as const;

export async function getTeamTable(ctx: Ctx): Promise<TeamTableData> {
  requireHead(ctx);
  const [team, summary, week, needs] = await Promise.all([
    listTeam(ctx.eventId),
    getCoordSummary(ctx),
    getTeamWeekSummary(ctx),
    getNeedsUpdate(ctx),
  ]);
  const needsBy = new Map<string, number>();
  for (const n of needs) if (n.owner_id) needsBy.set(n.owner_id, (needsBy.get(n.owner_id) ?? 0) + 1);

  const rows = coordinatorsOf(team).map((m): TeamRow => {
    const s = summary.find((r) => r.owner_id === m.id);
    const w = week.members.find((x) => x.memberId === m.id);
    return {
      memberId: m.id,
      name: m.name,
      totalOutreached: num(s?.total_outreached),
      thisWeek: w?.outreached ?? 0,
      target: w?.target ?? ctx.event.weekly_target_default,
      responded: num(s?.total_responded),
      converted: num(s?.converted),
      prospective: num(s?.prospective),
      rejected: num(s?.rejected),
      ghosting: num(s?.ghosting),
      approxInr: num(s?.approx_amt_inr),
      finalInr: num(s?.final_amt_inr),
      needsUpdate: needsBy.get(m.id) ?? 0,
      lastActive: s?.last_active_at ? toIstDate(s.last_active_at) : null,
    };
  });

  const totals: TeamRow = {
    memberId: "total",
    name: "Team total",
    totalOutreached: 0,
    thisWeek: 0,
    target: 0,
    responded: 0,
    converted: 0,
    prospective: 0,
    rejected: 0,
    ghosting: 0,
    approxInr: 0,
    finalInr: 0,
    needsUpdate: 0,
    lastActive: null,
  };
  for (const r of rows) {
    for (const k of SUM_KEYS) totals[k] += r[k];
    if (r.lastActive && (!totals.lastActive || r.lastActive > totals.lastActive)) totals.lastActive = r.lastActive;
  }
  return { weekStart: week.weekStart, rows, totals };
}