import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { upsertContact } from "@/lib/db/queries/crm-detail";

const schema = z.object({
  brandId: z.string().min(1),
  id: z.string().min(1).nullish(),
  name: z.string().min(1, "A contact needs a name.").max(200),
  jobTitle: z.string().max(200).nullish(),
  email: z.string().max(200).nullish(),
  phone: z.string().max(50).nullish(),
  linkedinUrl: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const { brandId, ...poc } = await parseBody(req, schema);
    return apiOk(await upsertContact(ctx, brandId, poc));
  } catch (error) {
    return apiFail(error);
  }
}