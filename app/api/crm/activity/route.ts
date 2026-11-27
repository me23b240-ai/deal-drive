import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { logActivity } from "@/lib/db/queries/crm-status";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const schema = z.object({
  brandId: z.string().min(1),
  kind: z.enum(["call", "call_no_answer", "note"]),
  note: z.string().max(2000).nullish(),
  nextFollowUp: day.nullish(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await logActivity(ctx, await parseBody(req, schema)));
  } catch (error) {
    return apiFail(error);
  }
}