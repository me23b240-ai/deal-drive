import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { nudgeDeal } from "@/lib/db/queries/crm-deals";

const schema = z.object({ dealId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    await nudgeDeal(ctx, (await parseBody(req, schema)).dealId);
    return apiOk({ saved: true });
  } catch (error) {
    return apiFail(error);
  }
}