"use client";

import Link from "next/link";
import { useState } from "react";
import type { QueueLead } from "@/lib/db/queries/crm-queue";
import { BTN_PRIMARY, CARD } from "./styles";
import { useMutation } from "./use-mutation";

export function QueuePanel({ leads, error, locked }: { leads: QueueLead[]; error: string | null; locked: boolean }) {
  const { run, busy } = useMutation();
  const [started, setStarted] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function start(lead: QueueLead) {
    setFailure(null);
    const res = await run<{ brandId: string }>("/api/crm/queue/start", "POST", { leadId: lead.id }, `${lead.company} moved to To Contact`, { silentError: true });
    if (res.ok) setStarted((prev) => ({ ...prev, [lead.id]: res.data.brandId }));
    else setFailure(res.error);
  }

  if (error) return <div className={`${CARD} p-6 text-sm text-danger`}>{error}</div>;

  return (
    <section aria-label="My queue" className="flex flex-col gap-3">
      <p className="text-sm text-muted">Leads the head has assigned to you. Start outreach moves a lead into your CRM as To Contact. You can't assign leads to yourself.</p>
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : null}
      {leads.length === 0 ? <div className={`${CARD} p-6 text-sm text-muted`}>No leads waiting. The head assigns new ones.</div> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {leads.map((l) => {
          const blocked = l.duplicate !== null;
          const id = started[l.id];
          return (
            <li key={l.id} className={`${CARD} flex flex-col gap-2 p-4`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{l.company}</h3>
                {l.signal ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{l.signal}</span> : null}
              </div>
              <p className="text-xs text-muted">Source: {l.source ?? "not recorded"}</p>
              {l.angle ? <p className="text-sm">Suggested angle: {l.angle}</p> : null}
              {l.duplicate ? (
                <p role="status" className="rounded-lg border border-approx/40 bg-approx/10 p-2 text-xs text-approx">
                  {l.duplicate.mine ? "This company is already in your list." : `Possible duplicate: already owned by ${l.duplicate.ownerName}. Talk to them before reaching out.`}
                </p>
              ) : null}
              <div className="mt-1">
                {id ? (
                  <Link className="text-sm text-accent underline" href={`/coordinator?company=${id}`}>
                    Open in the CRM
                  </Link>
                ) : (
                  <button type="button" className={BTN_PRIMARY} disabled={locked || busy || blocked} onClick={() => start(l)}>
                    Start outreach
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}