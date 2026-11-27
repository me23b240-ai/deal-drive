import type { FunnelStage } from "@/lib/model/derive";
import { formatInr } from "@/lib/domain/money";

const pct = (x: number | null): string => (x === null ? "-" : `${Math.round(x * 1000) / 10}%`);

export function FunnelChart(props: {
  funnel: FunnelStage[];
  bottleneck: string | null;
  cashCollectedInr: number;
  cashScheduledInr: number;
}) {
  const max = Math.max(1, ...props.funnel.map((s) => s.count));
  const cashRate = props.cashScheduledInr > 0 ? props.cashCollectedInr / props.cashScheduledInr : null;
  return (
    <ol className="space-y-3" aria-label="Sponsorship funnel">
      {props.funnel.map((s) => (
        <li key={s.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{s.label}</span>
            <span className="flex items-center gap-3 tabular-nums">
              {props.bottleneck === s.key ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-danger" />
                  BOTTLENECK
                </span>
              ) : null}
              <span className="text-xs text-muted">{s.rateFromPrev === null ? "start" : `${pct(s.rateFromPrev)} of previous`}</span>
              <span className="w-12 text-right font-semibold">{s.count}</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-border/60">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (100 * s.count) / max)}%` }} />
          </div>
        </li>
      ))}
      <li>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Cash collected</span>
          <span className="flex items-center gap-3 tabular-nums">
            <span className="text-xs text-muted">{cashRate === null ? "nothing scheduled" : `${pct(cashRate)} of scheduled cash`}</span>
            <span className="text-right font-semibold">{formatInr(props.cashCollectedInr)}</span>
          </span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-border/60">
          <div className="h-2 rounded-full bg-approx" style={{ width: `${Math.max(2, Math.min(100, (cashRate ?? 0) * 100))}%` }} />
        </div>
      </li>
    </ol>
  );
}