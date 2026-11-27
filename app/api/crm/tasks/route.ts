import { z } from "zod";
import { apiFail, apiOk } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/parse";
import { getCtx } from "@/lib/db/queries/ctx";
import { createTask, setTaskDone } from "@/lib/db/queries/crm-tasks";

const createSchema = z.object({
  title: z.string().min(1, "A task needs a title.").max(300),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").nullish(),
  brandId: z.string().min(1).nullish(),
});
const doneSchema = z.object({ id: z.string().min(1), done: z.boolean() });

export async function POST(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    return apiOk(await createTask(ctx, await parseBody(req, createSchema)));
  } catch (error) {
    return apiFail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getCtx("coordinator");
    const input = await parseBody(req, doneSchema);
    await setTaskDone(ctx, input.id, input.done);
    return apiOk({ saved: true });
  } catch (error) {
    return apiFail(error);
  }
}