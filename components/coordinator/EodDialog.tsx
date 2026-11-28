"use client";

import { useState } from "react";
import type { EodState } from "@/lib/db/queries/crm-eod";
import { BTN, BTN_PRIMARY, INPUT, LABEL } from "./styles";
import { Modal } from "./ui";
import { useMutation } from "./use-mutation";

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

function EodForm({ state, locked, onClose }: { state: EodState; locked: boolean; onClose: () => void }) {
  const { run, busy } = useMutation();
  const [note, setNote] = useState(state.submitted?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const s = state.summary;

  const rows: [string, string][] = [
    ["Mails sent", String(s.mailsSent)],
    ["Calls logged", `${s.calls}${s.callsNoAnswer ? ` (${s.callsNoAnswer} no answer)` : ""}`],
    ["Status changes", String(s.statusChanges)],
    ["Notes logged", String(s.notes)],
    ["Tasks done", String(s.tasksDone)],
    ["Still need an update", s.needsUpdate === 0 ? "0" : `${s.needsUpdate}${s.needsUpdateTop.length ? ` (${s.needsUpdateTop.join(", ")}${s.needsUpdate > s.needsUpdateTop.length ? ", ..." : ""})` : ""}`],
  ];

  async function submit() {
    setError(null);
    const res = await run("/api/crm/eod", "POST", { note: note.trim() || null }, state.submitted ? "Report updated" : "Report submitted", { silentError: true });
    if (res.ok) onClose();
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Counted automatically for today. Add a note on anything the numbers don't show.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <label className={LABEL} htmlFor="eod-note">
          Note for the head (optional)
        </label>
        <textarea id="eod-note" className={`${INPUT} min-h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} disabled={locked} />
      </div>
      {state.submitted ? <p className="text-xs text-muted">Submitted today at {time.format(new Date(state.submitted.submittedAt))}. Saving again updates it.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy || locked}>
          {busy ? "Saving..." : state.submitted ? "Update report" : "Submit report"}
        </button>
      </div>
    </div>
  );
}

export function EodDialog({ state, locked }: { state: EodState; locked: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={BTN} onClick={() => setOpen(true)}>
        {state.submitted ? "Update today's report" : "End my day"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="End my day">
        <EodForm state={state} locked={locked} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}