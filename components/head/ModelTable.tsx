import type { ModelRow, PlanView } from "@/lib/db/queries/head-a-plan";
import { MIN_OBSERVED_N } from "@/lib/db/queries/head-a-plan";
import { formatInr } from "@/lib/domain/money";

function fmt(unit: ModelRow["unit"], v: number): string {
  if (unit === "inr") return formatInr(v);
  if (unit === "pct") return `${(v * 100).toFixed(1)}%`;
  if (unit === "deals") return v.toFixed(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;

export function ModelTable({ view }: { view: PlanView }) {
  const { settings } = view.model;
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Plan model with live numbers for floor, base and stretch</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-3 py-3 text-left font-medium">Row</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Floor</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Base</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Stretch</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key} className={`border-b border-border/60 ${r.key === "cash" ? "bg-border/20 font-semibold" : ""}`}>
                <th scope="row" className="px-3 py-2 text-left font-normal">{r.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.unit, r.floor)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.unit, r.base)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.unit, r.stretch)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">Formula</p>
        <p className="text-muted">
          signed = signed to date + open prospects x close rate + sum over warm and other of (leads x response x proposal rate x sign rate x average new deal).
          Cash before fest = signed x (1 - in-kind share) x pre-fest share.
        </p>
        <p className="text-muted">
          In-kind policy: <span className="font-medium text-foreground">{settings.inkindScope}</span>{" "}
          {settings.inkindScope === "all" ? "(applies the in-kind share to all signed)" : "(existing signed keeps its observed in-kind share)"}.
          Average new deal {formatInr(settings.avgNewDeal)}, pre-fest share {pct(settings.prefestShare)}. <span className="text-approx">ASSUMED</span>
        </p>
        <p className="font-medium">Worked example</p>
        <ul className="space-y-1 text-muted">
          {view.example.map((l) => (
            <li key={l} className="tabular-nums">{l}</li>
          ))}
        </ul>
        <p className="text-muted">
          Proposal definition: a company counts at the proposal stage once it has reached Prospective (a custom proposal is in discussion). Slabs sent is the generic first mail and does not count.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Observed vs assumed rates</h3>
        <div className="overflow-x-auto rounded-[16px] border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-3 text-left font-medium">Segment and rate</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Base (ASSUMED)</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Stretch (ASSUMED)</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Observed</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Sample</th>
              </tr>
            </thead>
            <tbody>
              {view.observed.map((o) => (
                <tr key={`${o.segment}-${o.metric}`} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="capitalize">{o.segment}</span>: {o.metric}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(o.base)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(o.stretch)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.observed === null ? "no data" : pct(o.observed)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted tabular-nums">
                    n = {o.n}
                    {o.enough ? "" : (
                      <span className="ml-2 inline-flex items-center gap-1 text-approx">
                        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />
                        under {MIN_OBSERVED_N} outreached
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}