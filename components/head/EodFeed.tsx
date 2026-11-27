import type { EodData } from "@/lib/db/queries/head-b-eod";
import { EmptyBox } from "./KpiCards";

const CELL = {
  submitted: { text: "Submitted", cls: "text-success", dot: "bg-success" },
  missing: { text: "Missing", cls: "text-danger", dot: "bg-danger" },
  pending: { text: "Due today", cls: "text-muted", dot: "bg-muted" },
} as const;

export function EodFeed({ data }: { data: EodData }) {
  if (data.members.length === 0) return <EmptyBox message="No coordinators in this event yet." />;
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">End-of-day reports for the last five business days</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Coordinator</th>
              {data.days.map((d) => <th key={d} scope="col" className="px-3 py-3 text-left font-medium">{d.slice(5)}</th>)}
              <th scope="col" className="px-3 py-3 text-right font-medium">Missing</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.memberId} className="border-b border-border/60">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{m.name}</th>
                {m.cells.map((c, i) => (
                  <td key={data.days[i]} className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-xs ${CELL[c].cls}`}>
                      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${CELL[c].dot}`} />
                      {CELL[c].text}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{m.missingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Submitted reports</h2>
        {data.reports.length === 0 ? (
          <EmptyBox message="No end-of-day reports in this window." />
        ) : (
          data.reports.map((r) => (
            <article key={r.id} className="rounded-[16px] border border-border bg-card p-4 text-sm">
              <p className="font-medium">{r.name} <span className="ml-2 text-xs text-muted tabular-nums">{r.date}</span></p>
              {r.lines.length > 0 ? <p className="mt-1 text-xs text-muted">{r.lines.join(", ")}</p> : null}
              {r.note ? <p className="mt-2">{r.note}</p> : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}