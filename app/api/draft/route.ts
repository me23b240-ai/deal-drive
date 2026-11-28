import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { createDraft, updateDraft } from "@/lib/db/queries/crm-drafts";

export const maxDuration = 60;

const createSchema = z.object({
  brandId: z.string().min(1),
  contactId: z.string().min(1).nullish(),
  step: z.enum(["initial", "follow_up_1", "follow_up_2"]),
  personalise: z.boolean(),
});
const updateSchema = z.object({ draftId: z.string().min(1), subject: z.string().max(300), opening: z.string().max(2000) });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await createDraft(ctx, await parseBody(req, createSchema)));
  } catch (error) {
    return apiFail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { draftId, ...edits } = await parseBody(req, updateSchema);
    return apiOk(await updateDraft(ctx, draftId, edits));
  } catch (error) {
    return apiFail(error);
  }
}