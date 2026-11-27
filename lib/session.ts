import { cookies } from "next/headers";

export const ROLE_COOKIE = "dd_role";
export const MEMBER_COOKIE = "dd_member";
export const EVENT_COOKIE = "dd_event";

export type DemoRole = "head" | "coordinator";

export const DEFAULT_EVENT_ID = "saarang-2027";

export async function getSession() {
  const store = await cookies();
  const role = (store.get(ROLE_COOKIE)?.value === "coordinator" ? "coordinator" : "head") as DemoRole;
  const memberId = store.get(MEMBER_COOKIE)?.value ?? null;
  const eventId = store.get(EVENT_COOKIE)?.value ?? DEFAULT_EVENT_ID;
  return { role, memberId, eventId };
}
