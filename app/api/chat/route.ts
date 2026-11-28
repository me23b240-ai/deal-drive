import { z } from "zod";
import { parseBody } from "@/lib/api/parse";
import { apiFail, apiOk } from "@/lib/api/respond";
import { runChat } from "@/lib/ai/chat";
import { allowRequest } from "@/lib/ai/ratelimit";
import { HttpError, ValidationError } from "@/lib/db/errors";
import { getCtx } from "@/lib/db/queries/ctx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  role: z.enum(["head", "coordinator"]).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, Body);
    if (body.messages[body.messages.length - 1]?.role !== "user") throw new ValidationError("The last message must be from the user.");
    const ctx = await getCtx(body.role);
    if (!allowRequest(`${ctx.eventId}:${ctx.role}:${ctx.memberId ?? "head"}`)) throw new HttpError(429, "Too many requests. Wait a minute and retry.");
    return apiOk(await runChat(ctx, body.messages));
  } catch (error) {
    return apiFail(error);
  }
}

export function GET() {
  return apiOk({ status: "ok" });
}