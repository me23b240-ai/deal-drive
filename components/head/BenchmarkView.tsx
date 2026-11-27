import type { BenchmarkData } from "@/lib/db/queries/head-b-benchmark";
import { formatInr } from "@/lib/domain/money";
import { Card, EmptyBox } from "./KpiCards";

const pct = (x: number | null): string => (x === null ? "-" : `${Math.round(x * 1000) / 10}%`);
const inr = (x: number | null): string => (x === null ? "-" : formatInr(x));
const TH = "px-3 py-3 font-medium";

export function BenchmarkView({ data }: { data: BenchmarkData }) {
  const s = data.size;
  return (
    <div className="space-y-6">
      <Card title="Campaign funnel">
        {data.campaigns.length === 0 ? (
          <EmptyBox message="No campaigns in this dataset." />
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className={`${TH} text-left`}>Campaign</th>
                  {["Reached", "Replied", "Positive", "Met", "Deals", "Proposals", "Signed", "Signed value"].map((h) => (
                    <th key={h} scope="col" className={`${TH} text-right`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <th scope="row" className="px-3 py-2 text-left font-medium">{c.name}<span className="ml-2 text-xs text-muted">{c.channel}</span></th>
                    {[c.reached, c.replied, c.positive, c.met, c.dealsCreated, c.proposals, c.signedDeals].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-right tabular-nums">{v}</td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(c.signedValueInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Brands reached are counted per campaign, so a brand in two campaigns appears in both rows.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Stage mix (opportunities)">
          <ul className="space-y-1 text-sm">
            {data.stageMix.map((m) => (
              <li key={m.stage} className="flex justify-between tabular-nums"><span>{m.stage.replace(/_/g, " ")}</span><span>{m.count}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted tabular-nums">{data.totalDeals} opportunities across {data.totalBrands} brands.</p>
        </Card>

        <Card title="Deal-size stats (signed)">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Signed deals</dt><dd className="tabular-nums">{s.signedDeals}</dd></div>
            <div><dt className="text-xs text-muted">Total signed</dt><dd className="tabular-nums">{formatInr(s.totalInr)}</dd></div>
            <div><dt className="text-xs text-muted">Cash / in-kind</dt><dd className="tabular-nums">{formatInr(s.cashInr)} / {formatInr(s.inKindInr)} ({s.inKindDeals} in-kind deals)</dd></div>
            <div><dt className="text-xs text-muted">In-kind share</dt><dd className="tabular-nums">{pct(s.inKindShare)}</dd></div>
            <div><dt className="text-xs text-muted">Average / cash average</dt><dd className="tabular-nums">{inr(s.averageInr)} / {inr(s.cashAverageInr)}</dd></div>
            <div><dt className="text-xs text-muted">Median, min, max</dt><dd className="tabular-nums">{inr(s.medianInr)}, {inr(s.minInr)}, {inr(s.maxInr)}</dd></div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Days from created to confirmed</dt>
              <dd className="tabular-nums">{s.days ? `median ${s.days.median}, min ${s.days.min}, max ${s.days.max}` : "not available"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Targets vs actual">
        {data.targets.length === 0 ? (
          <EmptyBox message="This dataset has no targets rows." />
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className={`${TH} text-left`}>Target</th>
                  <th scope="col" className={`${TH} text-left`}>Metric</th>
                  <th scope="col" className={`${TH} text-right`}>Goal</th>
                  <th scope="col" className={`${TH} text-right`}>Actual</th>
                </tr>
              </thead>
              <tbody>
                {data.targets.map((t, i) => (
                  <tr key={`${t.label}-${t.metric}-${i}`} className="border-b border-border/60">
                    <td className="px-3 py-2">{t.label}</td>
                    <td className="px-3 py-2">{t.metric}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.unit === "inr" ? formatInr(t.goal) : t.goal}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.actual === null ? "cannot measure" : t.unit === "inr" ? formatInr(t.actual) : t.actual}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Qualification status (latest per brand)">
        <ul className="flex flex-wrap gap-3 text-sm">
          {data.qualStatuses.map((q) => (
            <li key={q.status} className="rounded-full border border-border px-3 py-1 tabular-nums">{q.status}: {q.count}</li>
          ))}
        </ul>
      </Card>

      <Card title="What this dataset cannot tell us">
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>Cash collected: there are no payment records, so cash received is unknown.</li>
          <li>Spend: no spend is recorded per campaign, so cost per signed deal cannot be computed.</li>
          <li>Loss reasons: rejected or lost opportunities carry no reason.</li>
          <li>Activations ({data.activations} linked): they show association with attendee campaigns, not cause.</li>
        </ul>
      </Card>
    </div>
  );
}