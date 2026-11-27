import { readFile } from "node:fs/promises";
import path from "node:path";
import { DataLab } from "@/components/head/DataLab";
import { EmptyBox, ErrorBox } from "@/components/head/KpiCards";
import { errorMessage } from "@/lib/db/errors";
import { getDataLab, WORK_EVENT, type DataLabData } from "@/lib/db/queries/head-b-datalab";
import type { Ctx } from "@/lib/types";

export default async function DataLabTab({ ctx }: { ctx: Ctx }) {
  if (ctx.eventId !== WORK_EVENT) {
    return <EmptyBox message="Data lab is only available on the CampusFest working copy." />;
  }
  let data: DataLabData;
  try {
    data = await getDataLab(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  const anchors = await readFile(path.join(process.cwd(), "docs", "slide1-anchors.md"), "utf8").catch(() => null);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Data lab</h1>
      <DataLab data={data} anchors={anchors} locked={ctx.isLocked} />
    </div>
  );
}