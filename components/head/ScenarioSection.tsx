import { errorMessage } from "@/lib/db/errors";
import { getScenarioView, type ScenarioView } from "@/lib/db/queries/head-a-planextras";
import { formatInr, formatLakh } from "@/lib/domain/money";
import type { Ctx } from "@/lib/types";
import { Card, ErrorBox } from "./KpiCards";
import { PlanExtrasForm } from "./PlanExtrasForm";

const pct = (x: number | null): string => (x === null ? "no data" : `${Math.round(x * 1000) / 10}%`);

export async function ScenarioSection({ ctx }: { ctx: Ctx }) {
  let v: ScenarioView;
  try {
    v = await getScenarioView(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <>
      <Card title="Scenarios">
        {v.moonshot ? (
          <p role="status" className="mb-3 inline-flex items-center gap-2 rounded-full border border-success/50 px-3 py-1 text-xs font-semibold text-success">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-success" />
            MOONSHOT: {v.extraQualified} qualified peer-fest leads by {v.byDate}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-[16px] border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Plan scenarios with signed amount and cash before fest</caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-3 text-left font-medium">Scenario</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Signed</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Cash before fest</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">New deals</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {r.label}
                    <span className="block text-xs text-muted">{r.note}</span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatLakh(r.signed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatLakh(r.cash)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.newDeals.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">ASSUMED. The downside row is a generic B2B benchmark, not fest data.</p>
      </Card>

      <Card title="Pre-fest share: observed vs assumed">
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="text-xs text-muted">Assumed (ASSUMED)</dt><dd className="tabular-nums">{pct(v.prefest.assumed)}</dd></div>
          <div><dt className="text-xs text-muted">Observed from signed deals</dt><dd className="tabular-nums">{pct(v.prefest.observed)}</dd></div>
          <div><dt className="text-xs text-muted">Sample</dt><dd className="tabular-nums">{v.prefest.n} deals, {formatInr(v.prefest.cashInr)} cash</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">Weighted by each deal's payment terms (100/0, 75/25 or 50/50). Under 30 deals it is directional only.</p>
      </Card>

      <Card title="Early-bird and exclusive sectors">
        <PlanExtrasForm discountPct={v.extras.discountPct} deadline={v.extras.deadline} sectors={v.extras.sectors} locked={ctx.isLocked} />
      </Card>
    </>
  );
}