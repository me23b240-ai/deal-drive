import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { addDays, businessDaysBetween, businessDaysLeftInWeek, weekEndIST, weekStartIST } from "../../domain/bizdays";
import { buildDecisions, type Decision, type DecisionSnapshot } from "../../domain/decisions";
import { coordinatorStat, ownershipConflicts, staleProspects } from "../../model/derive";
import { getV2Signals } from "./head-a-signals";
import { getHolidays } from "./holidays";
import { getInitiativeStatuses } from "./initiatives";
import { getBrandRows, getGateReport } from "./plan";
import { coordinatorsOf, listTeam } from "./team";
import { getTeamWeekSummary } from "./weekly";

/** A prospect with no touch for more than this many business days is stale. */
export const STALE_PROSPECT_BDAYS = 3;

/** Everything buildDecisions needs, read from the database. No payment rule: payments follow the deal terms, not due dates. */
export async function getDecisionSnapshot(ctx: Ctx): Promise<DecisionSnapshot> {
  requireHead(ctx);
  const [team, holidays, brands, week, gateReport, initiatives, v2] = await Promise.all([
    listTeam(ctx.eventId),
    getHolidays(ctx.eventId),
    getBrandRows(ctx),
    getTeamWeekSummary(ctx),
    getGateReport(ctx),
    getInitiativeStatuses(ctx),
    getV2Signals(ctx),
  ]);
  const nameOf = new Map(team.map((m) => [m.id, m.name]));
  const weekStart = weekStartIST(ctx.todayIst);
  const inWeek = businessDaysBetween(addDays(weekStart, -1), weekEndIST(weekStart), holidays);
  const left = businessDaysLeftInWeek(ctx.todayIst, holidays);

  const coordinators = coordinatorsOf(team).map((m) => {
    const w = week.members.find((x) => x.memberId === m.id);
    return coordinatorStat(
      { id: m.id, name: m.name },
      brands,
      { outreached: w?.outreached ?? 0, target: w?.target ?? ctx.event.weekly_target_default },
      ctx.todayIst,
      holidays,
      { inWeek, left },
    );
  });

  return {
    initiatives: initiatives.map((i) => ({ code: i.code, name: i.name, badge: i.badge, reason: i.reason })),
    coordinators,
    staleProspects: staleProspects(brands, STALE_PROSPECT_BDAYS, ctx.todayIst, holidays, nameOf),
    overduePayments: [],
    ownershipConflicts: ownershipConflicts(brands, nameOf),
    gates: gateReport.statuses,
    v2,
  };
}

export async function getDecisions(ctx: Ctx): Promise<Decision[]> {
  return buildDecisions(await getDecisionSnapshot(ctx));
}