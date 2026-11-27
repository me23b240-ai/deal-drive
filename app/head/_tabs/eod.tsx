import { ErrorBox } from "@/components/head/KpiCards";
import { EodFeed } from "@/components/head/EodFeed";
import { errorMessage } from "@/lib/db/errors";
import { getEodFeed, type EodData } from "@/lib/db/queries/head-b-eod";
import type { Ctx } from "@/lib/types";

export default async function EodTab({ ctx }: { ctx: Ctx }) {
  let data: EodData;
  try {
    data = await getEodFeed(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">End of day</h1>
      <EodFeed data={data} />
    </div>
  );
}