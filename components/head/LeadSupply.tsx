import type { LeadSupply as LeadSupplyData } from "@/lib/model/derive";

function Bar(props: { label: string; pool: number; need: number }) {
  const share = props.need > 0 ? Math.min(100, (100 * props.pool) / props.need) : 100;
  const gap = Math.max(0, props.need - props.pool);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span>{props.label}</span>
        <span className="tabular-nums text-muted">
          {props.pool} of {props.need}
          {gap > 0 ? (
            <span className="ml-2 inline-flex items-center gap-1 text-approx">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-approx" />
              gap {gap}
            </span>
          ) : (
            <span className="ml-2 text-success">covered</span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-border/60">
        <div className={`h-2 rounded-full ${gap > 0 ? "bg-approx" : "bg-success"}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

export function LeadSupply({ supply }: { supply: LeadSupplyData }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Warm pool = warm companies still queued plus warm companies first outreached since the plan start.
      </p>
      <Bar label="Warm pool vs base need" pool={supply.warmPool} need={supply.baseNeed} />
      <Bar label="Warm pool vs stretch need" pool={supply.warmPool} need={supply.stretchNeed} />
      <div className="space-y-4 border-t border-border pt-4">
        {supply.perBet.map((b) => (
          <Bar key={b.code} label={`${b.label} (${b.code})`} pool={b.pool} need={b.need} />
        ))}
      </div>
    </div>
  );
}