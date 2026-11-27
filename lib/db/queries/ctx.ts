import { cache } from "react";
import { getSession, DEFAULT_EVENT_ID, type DemoRole } from "@/lib/session";
import { toIstDate, todayIST } from "@/lib/domain/bizdays";
import { fallbackEvent, getEventInfo } from "@/lib/db/queries/events";
import { listTeam } from "@/lib/db/queries/team";
import type { Ctx } from "@/lib/types";

/** Pages pass their route role ("head" or "coordinator") so the URL decides the role. */
export const getCtx = cache(async (routeRole?: DemoRole): Promise<Ctx> => {
  const session = await getSession();
  const role = routeRole ?? session.role;

  let event = null;
  try {
    event = (await getEventInfo(session.eventId)) ?? (await getEventInfo(DEFAULT_EVENT_ID));
  } catch {
    event = null;
  }
  const info = event ?? fallbackEvent(session.eventId);

  let memberId = session.memberId;
  let isCloser = false;
  if (role === "coordinator") {
    const team = await listTeam(info.id).catch(() => []);
    const coordinators = team.filter((m) => m.role === "member");
    const mine = coordinators.find((m) => m.id === memberId) ?? coordinators[0];
    memberId = mine?.id ?? null;
    isCloser = mine?.is_closer ?? false;
  }

  return {
    eventId: info.id,
    event: info,
    role,
    memberId,
    isCloser,
    todayIst: info.as_of ? toIstDate(info.as_of) : todayIST(),
    isLocked: info.is_seed,
  };
});