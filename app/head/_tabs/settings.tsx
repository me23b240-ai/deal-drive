import { Card, ErrorBox } from "@/components/head/KpiCards";
import { DatesForm, GoalForm, HolidaysForm, PlanForm, RulesForm, StaleForm, TargetsForm } from "@/components/head/SettingsForms";
import { errorMessage } from "@/lib/db/errors";
import { getSettingsData, type SettingsData } from "@/lib/db/queries/head-b-settings";
import type { Ctx } from "@/lib/types";

export default async function SettingsTab({ ctx }: { ctx: Ctx }) {
  let d: SettingsData;
  try {
    d = await getSettingsData(ctx);
  } catch (error) {
    return <ErrorBox message={errorMessage(error)} />;
  }
  const locked = ctx.isLocked;
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Card title="Weekly outreach targets"><TargetsForm data={d} locked={locked} /></Card>
      <Card title="Team targets">
        <div className="grid gap-4 md:grid-cols-2">
          <GoalForm scenario="base" signed={d.goals.base?.signed_value_goal_inr ?? null} cash={d.goals.base?.cash_collected_goal_inr ?? null} locked={locked} />
          <GoalForm scenario="stretch" signed={d.goals.stretch?.signed_value_goal_inr ?? null} cash={d.goals.stretch?.cash_collected_goal_inr ?? null} locked={locked} />
        </div>
      </Card>
      <Card title="Model assumptions (ASSUMED)"><PlanForm data={d} locked={locked} /></Card>
      <Card title="Dates and observed rates"><DatesForm data={d} locked={locked} /></Card>
      <Card title="Stale rules (business days)"><StaleForm data={d} locked={locked} /></Card>
      <Card title="Holidays"><HolidaysForm data={d} locked={locked} /></Card>
      <Card title="Initiative rules"><RulesForm data={d} locked={locked} /></Card>
    </div>
  );
}