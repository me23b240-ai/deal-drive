import { Card, EmptyBox, ErrorBox } from "@/components/head/KpiCards";
import { DecisionsList } from "@/components/head/DecisionsList";
import { errorMessage } from "@/lib/db/errors";
import { getRisksData, type RisksData } from "@/lib/db/queries/head-b-risks";
import { formatInr } from "@/lib/domain/money";
import type { Ctx } from "@/lib/types";

const CHIP: Record<string, { cls: string; dot: string }> = {
  "ON TRACK": { cls: "text-success", dot: "bg-success" },
  "BEHIND BASE": { cls: "text-danger", dot: "bg-danger" },
  UPCOMING: { cls: "text-muted", dot: "bg-muted" },
};

export default async function RisksTab({ ctx }: { ctx: Ctx }) {
  let d: RisksData;
  try {
    d = await getRisksData(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Risks and decisions</h1>

      <Card title="Decisions">
        <DecisionsList decisions={d.decisions} locked={ctx.isLocked} />
      </Card>

      <Card title="Stale prospects by coordinator">
        {d.staleGroups.length === 0 ? (
          <EmptyBox message="No prospective company is past its threshold." />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted tabular-nums">{formatInr(d.staleTotalInr)} at risk.</p>
            {d.staleGroups.map((g) => (
              <div key={g.ownerId}>
                <p className="text-sm font-medium">{g.ownerName} <span className="ml-2 text-xs text-muted tabular-nums">{formatInr(g.totalInr)}</span></p>
                <ul className="mt-1 space-y-1 text-sm text-muted">
                  {g.items.map((i) => (
                    <li key={i.company} className="tabular-nums">{i.company}: {formatInr(i.amountInr)}, {i.idleBdays} business days idle</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Team signals">
        <div className="grid gap-4 md:grid-cols-2">
          {d.signals.map((s) => (
            <div key={s.title}>
              <p className="text-sm font-medium">{s.title} ({s.items.length})</p>
              {s.items.length === 0 ? (
                <p className="mt-1 text-xs text-muted">None.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-xs text-muted">
                  {s.items.map((i) => <li key={i.id}>{i.title}. {i.evidence}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Gates and lead supply">
        <ul className="grid gap-3 sm:grid-cols-3">
          {d.gates.map((g) => {
            const c = CHIP[g.status] ?? CHIP.UPCOMING;
            return (
              <li key={g.gateOn} className="rounded-[16px] border border-border p-3 text-sm">
                <p className="flex items-center justify-between">
                  <span className="font-medium">Gate {g.gateOn}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${c?.cls ?? ""}`}>
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${c?.dot ?? ""}`} />
                    {g.status}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted tabular-nums">Base {formatInr(g.baseInr)}, signed {formatInr(g.actualInr)}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-muted tabular-nums">
          Warm pool {d.lead.warmPool}: gap to base need ({d.lead.baseNeed}) is {d.lead.gapToBase}, gap to stretch need ({d.lead.stretchNeed}) is {d.lead.gapToStretch}.
        </p>
      </Card>

      <Card title="Top-5 prospects idle more than 3 business days">
        {d.top5Idle.length === 0 ? (
          <EmptyBox message="No top-5 deal is idle." />
        ) : (
          <ul className="space-y-1 text-sm">
            {d.top5Idle.map((r) => (
              <li key={r.dealId} className="tabular-nums">{r.company} ({r.ownerName}): {formatInr(r.proposedInr)}, {r.idleBdays} business days idle</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}