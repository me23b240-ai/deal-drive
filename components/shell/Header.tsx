import { EventSwitch } from "@/components/shell/EventSwitch";
import { RoleToggle } from "@/components/shell/RoleToggle";
import type { DemoRole } from "@/lib/session";

export function Header(props: {
  role: DemoRole;
  eventId: string;
  memberId: string | null;
}) {
  return (
    <header className="flex min-h-11 items-center justify-between gap-4 border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide text-accent">Deal Drive</span>
        <EventSwitch eventId={props.eventId} />
      </div>
      <RoleToggle role={props.role} />
    </header>
  );
}
