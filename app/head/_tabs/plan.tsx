import { Card, ErrorBox } from "@/components/head/KpiCards";
import { GatesChart } from "@/components/head/GatesChart";
import { LeadSupply } from "@/components/head/LeadSupply";
import { ModelTable } from "@/components/head/ModelTable";
import { errorMessage } from "@/lib/db/errors";
import { getPlanView, type PlanView } from "@/lib/db/queries/head-a-plan";
import { formatInr } from "@/lib/domain/money";
import type { Ctx } from "@/lib/types";

export default async function PlanTab({ ctx }: { ctx: Ctx }) {
  let view: PlanView;
  try {
    view = await getPlanView(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  const { model, goals } = view;
  const p = model.projection;
  const targets = [
    { label: "Base", goalSigned: goals.base?.signed_value_goal_inr ?? null, goalCash: goals.base?.cash_collected_goal_inr ?? null, signed: p.base.signed, cash: p.base.cashBeforeFest },
    { label: "Stretch", goalSigned: goals.stretch?.signed_value_goal_inr ?? null, goalCash: goals.stretch?.cash_collected_goal_inr ?? null, signed: p.stretch.signed, cash: p.stretch.cashBeforeFest },
  ];
  const diff = (a: number, b: number | null): string => (b === null ? "no target" : `${a - b >= 0 ? "+" : ""}${formatInr(a - b)}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Plan</h1>
        <span className="rounded-full border border-approx/40 px-2 py-0.5 text-xs text-approx">ASSUMED rates</span>
        <span className="text-xs text-muted tabular-nums">Window {model.planStart} to {model.planEnd}</span>
      </div>

      <Card title="Model: floor, base and stretch (live)">
        <ModelTable view={view} />
      </Card>

      <Card title="Pace and portfolio gates">
        <GatesChart report={view.gates} today={ctx.todayIst} planStart={model.planStart} />
      </Card>

      <Card title="Lead supply">
        <LeadSupply supply={model.leadSupply} />
      </Card>

      <Card title="Projection vs targets">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2 text-left font-medium">Scenario</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Projected signed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Target signed</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Projected cash</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Target cash</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Cash vs target</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.label} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{t.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(t.signed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.goalSigned === null ? "-" : formatInr(t.goalSigned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(t.cash)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.goalCash === null ? "-" : formatInr(t.goalCash)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{diff(t.cash, t.goalCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Attribution over floor (stretch)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <tbody>
              {model.attribution.rows.map((r) => (
                <tr key={r.bet} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{r.bet}: {r.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cashOverFloor)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <th scope="row" className="px-3 py-2 text-left">Sum over floor</th>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(model.attribution.sumOverFloor)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted tabular-nums">
          Floor {formatInr(model.attribution.floor)} + sum = stretch cash {formatInr(model.attribution.stretchCash)}.{" "}
          {model.attribution.reconciles ? "Reconciles within Rs 1,000." : "Does not reconcile within Rs 1,000: check the in-kind policy."}
        </p>
      </Card>
    </div>
  );
}