"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GateReport } from "@/lib/db/queries/plan";
import { formatInr, formatLakh } from "@/lib/domain/money";

type Point = { date: string; actual: number | null; base: number | null; stretch: number | null };

const CHIP: Record<string, string> = {
  "ON TRACK": "text-success",
  "BEHIND BASE": "text-danger",
  UPCOMING: "text-muted",
};
const DOT: Record<string, string> = {
  "ON TRACK": "bg-success",
  "BEHIND BASE": "bg-danger",
  UPCOMING: "bg-muted",
};

export function GatesChart(props: { report: GateReport; today: string; planStart: string }) {
  const { report, today, planStart } = props;
  const actualAt = (d: string): number => {
    let v = 0;
    for (const p of report.signedByDay) if (p.date <= d) v = p.cumulativeInr;
    return v;
  };
  const dates = [...new Set([planStart, today, ...report.pace.map((p) => p.date), ...report.statuses.map((s) => s.gateOn)])].sort();
  const data: Point[] = dates.map((date) => {
    const pace = report.pace.find((p) => p.date === date);
    const gate = report.statuses.find((s) => s.gateOn === date);
    return {
      date,
      actual: date <= today ? actualAt(date) : null,
      base: gate ? gate.baseInr : pace ? pace.base : null,
      stretch: gate ? gate.stretchInr : pace ? pace.stretch : null,
    };
  });

  return (
    <div className="space-y-4">
      {report.closingOnly ? (
        <p role="status" className="rounded-[16px] border border-approx/40 bg-approx/10 px-4 py-2 text-sm text-approx">
          Closing-only phase: the last gate has passed. No new outreach, close what is open.
        </p>
      ) : null}
      <div role="img" aria-label="Cumulative signed amount against base and stretch pace" className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#2a2f35" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} stroke="#8b949e" fontSize={12} />
            <YAxis tickFormatter={(v: number) => formatLakh(v)} stroke="#8b949e" fontSize={12} width={64} />
            <Tooltip
              contentStyle={{ background: "#15191d", border: "1px solid #2a2f35", borderRadius: 12, color: "#e8ecef" }}
              formatter={(v) => (typeof v === "number" ? formatInr(v) : String(v))}
            />
            <Legend />
            {report.statuses.map((s) => (
              <ReferenceLine key={s.gateOn} x={s.gateOn} stroke="#8b949e" strokeDasharray="2 4" />
            ))}
            <Line name="Actual signed" dataKey="actual" stroke="#2dd4bf" strokeWidth={2} type="stepAfter" connectNulls dot={false} />
            <Line name="Base pace" dataKey="base" stroke="#7aa2ff" strokeWidth={2} strokeDasharray="6 4" connectNulls />
            <Line name="Stretch pace" dataKey="stretch" stroke="#f5a524" strokeWidth={2} strokeDasharray="6 4" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {report.statuses.map((s) => (
          <li key={s.gateOn} className="rounded-[16px] border border-border p-3 text-sm">
            <p className="flex items-center justify-between">
              <span className="font-medium">Gate {s.gateOn}</span>
              <span className={`flex items-center gap-1 text-xs font-semibold ${CHIP[s.status] ?? ""}`}>
                <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${DOT[s.status] ?? "bg-muted"}`} />
                {s.status}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              Base {formatInr(s.baseInr)} / stretch {formatInr(s.stretchInr)}
            </p>
            <p className="text-xs text-muted tabular-nums">
              {s.status === "UPCOMING" ? `Signed so far ${formatInr(report.actualToday)}` : `Signed at gate ${formatInr(s.actualInr)}`}
            </p>
          </li>
        ))}
      </ul>
      {report.missed ? (
        <p role="alert" className="text-sm text-danger">
          Re-plan: base line missed at the {report.missed.gateOn} gate. Move hours to bet-1 and bet-3.
        </p>
      ) : null}
      <p className="text-xs text-muted">ASSUMED: gate values are editable plan assumptions. Actual signed comes from confirmed deals.</p>
    </div>
  );
}