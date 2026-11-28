import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { resolveAction } from "@/lib/ai/actions";
import { getCtx } from "@/lib/db/queries/ctx";

const Body = z.object({ role: z.enum(["head", "coordinator"]).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const raw: unknown = await req.json().catch(() => ({}));
    const body = Body.safeParse(raw);
    const ctx = await getCtx(body.success ? body.data.role : undefined);
    return apiOk(await resolveAction(ctx, id, "reject"));
  } catch (error) {
    return apiFail(error);
  }
}