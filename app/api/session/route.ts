import { cookies } from "next/headers";
import { z } from "zod";
import { EVENT_COOKIE, MEMBER_COOKIE, ROLE_COOKIE } from "@/lib/session";

const bodySchema = z.object({
  role: z.enum(["head", "coordinator"]).optional(),
  eventId: z.enum(["saarang-2027", "campusfest-2025-work", "campusfest-2025"]).optional(),
  memberId: z.string().min(1).nullable().optional(),
});

const OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" as const, httpOnly: true };

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { role, eventId, memberId } = parsed.data;
  const store = await cookies();
  if (role) store.set(ROLE_COOKIE, role, OPTIONS);
  if (eventId) store.set(EVENT_COOKIE, eventId, OPTIONS);
  if (memberId === null) store.delete(MEMBER_COOKIE);
  else if (memberId) store.set(MEMBER_COOKIE, memberId, OPTIONS);
  return Response.json({ ok: true });
}