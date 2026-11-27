"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Decision } from "@/lib/domain/decisions";
import { EmptyBox } from "./KpiCards";

const SEV = {
  high: { cls: "text-danger", dot: "bg-danger", text: "HIGH" },
  medium: { cls: "text-approx", dot: "bg-approx", text: "MEDIUM" },
  low: { cls: "text-muted", dot: "bg-muted", text: "LOW" },
} as const;

export function DecisionsList({ decisions, locked }: { decisions: Decision[]; locked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(id: string) {
    setBusy(id);
    setMsg(null);
    const res = await fetch("/api/head/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok: boolean; error?: string; data?: { created: number; skipped: number } } | null;
    setBusy(null);
    setConfirming(null);
    if (json?.ok && json.data) {
      setMsg({ ok: true, text: `${json.data.created} tasks created, ${json.data.skipped} skipped (already open).` });
      startTransition(() => router.refresh());
    } else {
      setMsg({ ok: false, text: json?.error ?? "Request failed." });
    }
  }

  if (decisions.length === 0) return <EmptyBox message="No decisions right now. Nothing is stale, behind pace or in conflict." />;
  return (
    <div className="space-y-3">
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}
      {decisions.map((d) => {
        const s = SEV[d.severity];
        return (
          <article key={d.id} className="rounded-[16px] border border-border bg-card p-4 text-sm">
            <p className={`flex items-center gap-1 text-xs font-semibold ${s.cls}`}>
              <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
              {s.text}
            </p>
            <h3 className="mt-1 font-medium">{d.title}</h3>
            <p className="mt-1 text-muted">Evidence: {d.evidence}</p>
            <p className="mt-1">Recommended: {d.action}</p>
            {d.tasksToCreate.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirming === d.id ? (
                  <>
                    <span className="text-xs">Create {d.tasksToCreate.length} tasks in the coordinators to-do lists?</span>
                    <button
                      type="button"
                      disabled={busy === d.id}
                      onClick={() => void create(d.id)}
                      className="min-h-9 rounded-lg bg-accent px-3 text-xs font-medium text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="min-h-9 rounded-lg border border-border px-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={locked || pending}
                    onClick={() => setConfirming(d.id)}
                    className="min-h-9 rounded-lg border border-border px-3 text-xs hover:bg-border/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Create tasks ({d.tasksToCreate.length})
                  </button>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
      {locked ? <p className="text-xs text-approx">Locked dataset: read-only.</p> : null}
    </div>
  );
}