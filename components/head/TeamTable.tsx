import type { TeamRow, TeamTableData } from "@/lib/db/queries/head-a-team";
import { formatInr } from "@/lib/domain/money";
import { EmptyBox } from "./KpiCards";

const HEAD = [
  "Coordinator",
  "Total outreached",
  "This week",
  "Target",
  "Responded",
  "Converted",
  "Prospective",
  "Rejected",
  "Ghosting",
  "Approx amount",
  "Final amount",
  "Needs update",
  "Last active",
];

function Cells({ r }: { r: TeamRow }) {
  const n = (v: number) => <td className="px-3 py-2 text-right tabular-nums">{v}</td>;
  return (
    <>
      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{r.name}</th>
      {n(r.totalOutreached)}
      {n(r.thisWeek)}
      {n(r.target)}
      {n(r.responded)}
      {n(r.converted)}
      {n(r.prospective)}
      {n(r.rejected)}
      {n(r.ghosting)}
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(r.approxInr)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatInr(r.finalInr)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {r.needsUpdate > 0 ? (
          <span className="inline-flex items-center gap-1 text-approx">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />
            {r.needsUpdate}
          </span>
        ) : (
          0
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{r.lastActive ?? "never"}</td>
    </>
  );
}

export function TeamTable({ data }: { data: TeamTableData }) {
  if (data.rows.length === 0) return <EmptyBox message="No coordinators in this event yet." />;
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              {HEAD.map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-3 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.memberId} className="border-b border-border/60"><Cells r={r} /></tr>
            ))}
            <tr className="bg-border/20 font-semibold"><Cells r={data.totals} /></tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.rows.map((r) => {
          const share = r.target > 0 ? Math.min(100, (100 * r.thisWeek) / r.target) : 0;
          return (
            <div key={r.memberId} className="rounded-[16px] border border-border bg-card p-4">
              <p className="font-medium">{r.name}</p>
              <p className="mt-1 text-xs text-muted tabular-nums">
                Week of {data.weekStart}: {r.thisWeek} of {r.target} outreached
              </p>
              <div className="mt-2 h-2 rounded-full bg-border/60" role="progressbar" aria-valuemin={0} aria-valuemax={r.target} aria-valuenow={r.thisWeek} aria-label={`${r.name} weekly outreach`}>
                <div className="h-2 rounded-full bg-accent" style={{ width: `${share}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {r.needsUpdate > 0 ? `${r.needsUpdate} need an update` : "Nothing stale"}, last active {r.lastActive ?? "never"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}