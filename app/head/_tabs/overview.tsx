import { ErrorBox, KpiCards } from "@/components/head/KpiCards";
import { FunnelChart } from "@/components/head/FunnelChart";
import { errorMessage } from "@/lib/db/errors";
import { getOverviewData, type OverviewData } from "@/lib/db/queries/head-a-overview";
import type { Ctx } from "@/lib/types";

export default async function OverviewTab({ ctx }: { ctx: Ctx }) {
  let data: OverviewData;
  try {
    data = await getOverviewData(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  const { kpis, week } = data;
  const share = week.target > 0 ? Math.min(100, (100 * week.outreached) / week.target) : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Overview</h1>
        {ctx.eventId === "saarang-2027" ? (
          <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">SIMULATED data</span>
        ) : null}
      </div>

      <section className="rounded-[16px] border border-border bg-card p-5">
        <p className="text-sm tabular-nums">
          Team outreached <span className="font-semibold">{week.outreached}</span> / team target{" "}
          <span className="font-semibold">{week.target}</span> this week (from {week.weekStart})
        </p>
        <div className="mt-2 h-2 rounded-full bg-border/60" role="progressbar" aria-valuemin={0} aria-valuemax={week.target} aria-valuenow={week.outreached} aria-label="Team weekly outreach">
          <div className="h-2 rounded-full bg-accent" style={{ width: `${share}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">{week.responded} responded from this week outreach so far.</p>
      </section>

      <KpiCards kpis={kpis} signedCashInr={data.signedCashInr} signedInKindInr={data.signedInKindInr} />

      <section className="rounded-[16px] border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Funnel</h2>
        <FunnelChart funnel={kpis.funnel} bottleneck={kpis.bottleneck} cashCollectedInr={kpis.cashCollectedInr} cashScheduledInr={kpis.cashScheduledInr} />
      </section>
    </div>
  );
}