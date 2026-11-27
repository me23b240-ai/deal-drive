import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { apiFail, apiOk } from "@/lib/api/respond";
import { NotFoundError, ValidationError } from "@/lib/db/errors";
import { assertWritable, requireHead } from "@/lib/db/guards";
import { getCtx } from "@/lib/db/queries/ctx";
import { WORK_EVENT } from "@/lib/db/queries/head-b-datalab";
import { loadCampusFest } from "@/lib/seed/campusfest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const FILES = ["Sponsor Dataset.xlsx", "Sponsor_Dataset.xlsx"];

async function readBundled(): Promise<Buffer> {
  for (const name of FILES) {
    try {
      return await readFile(path.join(process.cwd(), "data", name));
    } catch {
      continue;
    }
  }
  throw new NotFoundError("The bundled dataset was not found in the data folder.");
}

export async function POST() {
  try {
    const ctx = await getCtx("head");
    requireHead(ctx);
    assertWritable(ctx);
    if (ctx.eventId !== WORK_EVENT) throw new ValidationError("Reset is only allowed on the CampusFest working copy.");
    const report = await loadCampusFest(await readBundled(), WORK_EVENT);
    revalidatePath("/head");
    return apiOk(report);
  } catch (error) {
    return apiFail(error);
  }
}