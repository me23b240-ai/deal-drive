import { EventSwitch } from "@/components/shell/EventSwitch";
import { MemberPicker } from "@/components/shell/MemberPicker";
import { RoleToggle } from "@/components/shell/RoleToggle";
import { getCtx } from "@/lib/db/queries/ctx";
import { coordinatorsOf, listTeam } from "@/lib/db/queries/team";
import type { DemoRole } from "@/lib/session";

export async function Header(props: { role: DemoRole; eventId?: string; memberId?: string | null }) {
  const ctx = await getCtx(props.role);
  const coordinators =
    props.role === "coordinator" ? coordinatorsOf(await listTeam(ctx.eventId).catch(() => [])) : [];

  return (
    <>
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold tracking-wide text-accent">Deal Drive</span>
          <EventSwitch eventId={ctx.eventId} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {coordinators.length > 0 ? (
            <MemberPicker
              members={coordinators.map((m) => ({ id: m.id, name: m.name }))}
              memberId={ctx.memberId}
            />
          ) : null}
          <RoleToggle role={props.role} />
        </div>
      </header>
      {ctx.isLocked ? (
        <div className="border-b border-approx/40 bg-approx/10 px-4 py-2 text-sm text-approx">
          Locked original dataset: read-only. Switch to CampusFest work to edit a copy.
        </div>
      ) : null}
    </>
  );
}