import { BenchmarkView } from "@/components/head/BenchmarkView";
import { ErrorBox } from "@/components/head/KpiCards";
import { errorMessage } from "@/lib/db/errors";
import { getBenchmark, type BenchmarkData } from "@/lib/db/queries/head-b-benchmark";
import type { Ctx } from "@/lib/types";

export default async function BenchmarkTab({ ctx }: { ctx: Ctx }) {
  let data: BenchmarkData;
  try {
    data = await getBenchmark(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Benchmark: CampusFest 2025</h1>
        {ctx.isLocked ? <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">Original, read-only</span> : null}
      </div>
      <BenchmarkView data={data} />
    </div>
  );
}