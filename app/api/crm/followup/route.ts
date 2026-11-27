import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { setFollowUp } from "@/lib/db/queries/crm-status";

const schema = z.object({
  brandId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").nullable(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const input = await parseBody(req, schema);
    await setFollowUp(ctx, input.brandId, input.date);
    return apiOk({ saved: true });
  } catch (error) {
    return apiFail(error);
  }
}