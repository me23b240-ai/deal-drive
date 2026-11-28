import Link from "next/link";
import type { StatusCode } from "@/lib/domain/status";
import { formatInr } from "@/lib/domain/money";
import type { NeedsUpdateRow } from "@/lib/types";
import { StatusPill } from "./badges";
import { bdays, fmtDay } from "./format";
import { CARD } from "./styles";
import { TasksList } from "./TasksList";
import type { TaskRow } from "./types";

export function TodoRail({ needs, tasks, today, locked }: { needs: NeedsUpdateRow[]; tasks: TaskRow[]; today: string; locked: boolean }) {
  const shown = needs.slice(0, 8);
  return (
    <aside className="flex flex-col gap-4" aria-label="To-do">
      <section className={`${CARD} p-4`} aria-label="Needs update">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Needs update</h2>
          <span className="text-xs text-muted">{needs.length}</span>
        </div>
        {needs.length === 0 ? <p className="text-sm text-muted">Nothing is overdue. Nice.</p> : null}
        <ul className="flex flex-col gap-3">
          {shown.map((n) => (
            <li key={n.brand_id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/coordinator?company=${n.brand_id}`} className="font-medium hover:text-accent">
                  {n.company}
                </Link>
                <StatusPill status={n.crm_status as StatusCode} small />
              </div>
              <span className="block text-xs text-muted">
                {n.reason === "follow_up_due" ? `Follow-up due ${fmtDay(n.next_follow_up)}` : `No update for ${bdays(n.idle_bdays)}`}
                {n.approx_amount_inr ? ` | ${formatInr(n.approx_amount_inr)}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {needs.length > shown.length ? (
          <Link href="/coordinator?nu=1" className="mt-3 inline-block text-xs text-accent hover:underline">
            See all {needs.length} in the CRM
          </Link>
        ) : null}
      </section>

      <div className={`${CARD} p-4`}>
        <TasksList tasks={tasks} today={today} locked={locked} />
      </div>

      <section className={`${CARD} p-4`} aria-label="Assistant">
        <h2 className="text-sm font-semibold">Assistant</h2>
        <p className="mt-2 text-sm text-muted">The Growth Analyst chat is added in the chatbot step.</p>
      </section>
    </aside>
  );
}