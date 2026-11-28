import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { checkOpenDeals, decideApproval } from "@/lib/db/queries/head-a-approvals";
import { getCtx } from "@/lib/db/queries/ctx";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), dealId: z.string().min(1), note: z.string().max(400).optional() }),
  z.object({ action: z.literal("reject"), dealId: z.string().min(1), note: z.string().trim().min(1).max(400) }),
  z.object({ action: z.literal("check") }),
]);

export async function POST(request: Request) {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError("Invalid input: a rejection needs a note.");
    const b = parsed.data;
    let data: unknown = {};
    if (b.action === "check") data = await checkOpenDeals(ctx);
    else await decideApproval(ctx, b.dealId, b.action === "approve", b.note ?? "");
    revalidatePath("/head");
    revalidatePath("/head/approvals");
    revalidatePath("/coordinator");
    return apiOk(data);
  } catch (error) {
    return apiFail(error);
  }
}