import { fmtDay } from "./format";
import { CARD } from "./styles";
import type { WeeklyStrip as WeeklyStripData } from "@/lib/types";

export function WeeklyStrip({ data }: { data: WeeklyStripData }) {
  const pct = data.target > 0 ? Math.min(100, Math.round((data.outreached / data.target) * 100)) : 0;
  const pace =
    data.target === 0
      ? "No target set for this week."
      : data.remaining === 0
        ? "Target reached for this week."
        : data.businessDaysLeft === 0
          ? `${data.remaining} to go and no business days left this week.`
          : `${data.remaining} to go, about ${(data.requiredPerDay ?? 0).toFixed(1)} per business day (${data.businessDaysLeft} left).`;

  return (
    <section className={`${CARD} p-4`} aria-label="This week">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          This week <span className="font-normal text-muted">({fmtDay(data.weekStart)} to {fmtDay(data.weekEnd)})</span>
        </h2>
        <span className="text-xs text-muted">
          {data.label}
          {data.source === "default" ? " (default target)" : ""}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-48 flex-1">
          <div className="mb-1 flex justify-between text-xs">
            <span>
              {data.outreached} of {data.target} outreaches
            </span>
            <span className="text-muted">{pct}%</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Weekly outreach progress" className="h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="text-xs text-muted">
          Responded {data.responded}
          {data.responseRate !== null ? ` (${Math.round(data.responseRate * 100)}%)` : ""}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted">{pace}</p>
    </section>
  );
}