import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { updateDeal } from "@/lib/db/queries/crm-deals";

const schema = z.object({
  dealId: z.string().min(1),
  stage: z.enum(["prospecting", "proposal_sent", "negotiating"]).optional(),
  nextFollowUp: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { dealId, ...patch } = await parseBody(req, schema);
    await updateDeal(ctx, dealId, patch);
    return apiOk({ saved: true });
  } catch (error) {
    return apiFail(error);
  }
}