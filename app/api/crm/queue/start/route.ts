import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { startOutreach } from "@/lib/db/queries/crm-queue";

const schema = z.object({ leadId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await startOutreach(ctx, (await parseBody(req, schema)).leadId));
  } catch (error) {
    return apiFail(error);
  }
}