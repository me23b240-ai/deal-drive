import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { markDraftSent } from "@/lib/db/queries/crm-drafts";
import { checkOffsets, scheduleSequence } from "@/lib/db/queries/crm-sequence";

const schema = z.object({
  draftId: z.string().min(1),
  subject: z.string().max(300).optional(),
  opening: z.string().max(2000).optional(),
  step1Bd: z.number().int().optional(),
  step2Bd: z.number().int().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { draftId, subject, opening, step1Bd, step2Bd } = await parseBody(req, schema);
    const offsets = { step1: step1Bd ?? 5, step2: step2Bd ?? 10 };
    checkOffsets(offsets.step1, offsets.step2); // validate before anything is saved
    await markDraftSent(ctx, draftId, subject !== undefined && opening !== undefined ? { subject, opening } : undefined);
    return apiOk(await scheduleSequence(ctx, draftId, offsets));
  } catch (error) {
    return apiFail(error);
  }
}