import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { OPEN_DEAL_STAGES } from "@/lib/db/queries/crm-deals";
import { getCtx } from "@/lib/db/queries/ctx";
import { nudgeOpenDeal, setOpenStage } from "@/lib/db/queries/head-b-deals";
import { escalateDeal } from "@/lib/db/queries/head-b-tasks";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stage"), dealId: z.string().min(1), stage: z.enum(OPEN_DEAL_STAGES) }),
  z.object({ action: z.literal("nudge"), dealId: z.string().min(1) }),
  z.object({ action: z.literal("escalate"), dealId: z.string().min(1) }),
]);

export async function PATCH(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input");
    const body = parsed.data;
    if (body.action === "stage") await setOpenStage(ctx, body.dealId, body.stage);
    else if (body.action === "nudge") await nudgeOpenDeal(ctx, body.dealId);
    else await escalateDeal(ctx, body.dealId);
    revalidatePath("/head");
    revalidatePath("/coordinator");
    return apiOk({ dealId: body.dealId });
  } catch (error) {
    return apiFail(error);
  }
}