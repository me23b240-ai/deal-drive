"use client";

import { useState } from "react";
import { CHANNEL_LABELS, type ChannelCode } from "@/lib/domain/channels";
import { STATUS_LABELS, type StatusCode } from "@/lib/domain/status";
import { formatInr } from "@/lib/domain/money";
import { StatusPill } from "./badges";
import { PipelineStepper } from "./PipelineStepper";
import { fmtDay } from "./format";
import { useQueryNav } from "./nav";
import { BTN, BTN_PRIMARY, CARD, INPUT, LABEL } from "./styles";
import type { CompanyDetail, ContactRow } from "./types";
import { Modal } from "./ui";
import { useMutation } from "./use-mutation";

const dateTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateTime.format(d);
};

type QuickMode = "call" | "call_no_answer" | "note" | "followup";
const QUICK: { mode: QuickMode; label: string }[] = [
  { mode: "call", label: "Log call" },
  { mode: "call_no_answer", label: "Log call, no answer" },
  { mode: "note", label: "Log note" },
  { mode: "followup", label: "Set follow-up" },
];

function QuickActions({ detail, locked }: { detail: CompanyDetail; locked: boolean }) {
  const { run, busy } = useMutation();
  const [mode, setMode] = useState<QuickMode | null>(null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function pick(m: QuickMode) {
    setMode(m);
    setNote("");
    setDate(m === "followup" ? detail.nextFollowUp ?? "" : "");
    setError(null);
  }

  async function save() {
    if (!mode) return;
    setError(null);
    let res;
    if (mode === "followup") {
      if (!date) return setError("Pick a date.");
      res = await run("/api/crm/followup", "POST", { brandId: detail.id, date }, "Follow-up set", { silentError: true });
    } else {
      if (mode === "note" && !note.trim()) return setError("Write the note first.");
      const body: Record<string, unknown> = { brandId: detail.id, kind: mode, note: note.trim() || null };
      if (date) body.nextFollowUp = date;
      res = await run("/api/crm/activity", "POST", body, "Logged", { silentError: true });
    }
    if (res.ok) setMode(null);
    else setError(res.error);
  }

  return (
    <section className={`${CARD} p-4`} aria-label="Quick actions">
      <h3 className="mb-3 text-sm font-semibold">Quick actions</h3>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q.mode} type="button" className={BTN} disabled={locked || busy} aria-pressed={mode === q.mode} onClick={() => pick(q.mode)}>
            {q.label}
          </button>
        ))}
        <button type="button" className={BTN} onClick={() => { window.location.href = `/coordinator?tab=drafts&company=${detail.id}`; }}>
          Draft mail
        </button>
      </div>
      {mode ? (
        <div className="mt-3 flex flex-col gap-3">
          {mode !== "followup" ? (
            <div>
              <label className={LABEL} htmlFor="qa-note">
                {mode === "note" ? "Note" : "What happened (optional)"}
              </label>
              <textarea id="qa-note" className={`${INPUT} min-h-16 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : null}
          <div>
            <label className={LABEL} htmlFor="qa-date">
              {mode === "followup" ? "Follow-up date" : "Next follow-up (optional)"}
            </label>
            <input id="qa-date" type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save"}
            </button>
            <button type="button" className={BTN} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Contacts({ detail, locked }: { detail: CompanyDetail; locked: boolean }) {
  const { run, busy } = useMutation();
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const [f, setF] = useState({ name: "", jobTitle: "", email: "", phone: "", linkedinUrl: "" });
  const [error, setError] = useState<string | null>(null);

  function open(c: ContactRow | "new") {
    setEditing(c);
    setError(null);
    setF(c === "new" ? { name: "", jobTitle: "", email: "", phone: "", linkedinUrl: "" } : { name: c.name, jobTitle: c.jobTitle ?? "", email: c.email ?? "", phone: c.phone ?? "", linkedinUrl: c.linkedinUrl ?? "" });
  }

  async function save() {
    setError(null);
    if (!f.name.trim()) return setError("A contact needs a name.");
    const res = await run("/api/crm/contact", "POST", { brandId: detail.id, id: editing && editing !== "new" ? editing.id : null, ...f }, "Contact saved", { silentError: true });
    if (res.ok) setEditing(null);
    else setError(res.error);
  }

  const field = (key: keyof typeof f, label: string) => (
    <div key={key}>
      <label className={LABEL} htmlFor={`poc-${key}`}>
        {label}
      </label>
      <input id={`poc-${key}`} className={INPUT} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </div>
  );

  return (
    <section className={`${CARD} p-4`} aria-label="Points of contact">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Points of contact</h3>
        <button type="button" className={BTN} disabled={locked} onClick={() => open("new")}>
          Add contact
        </button>
      </div>
      {detail.contacts.length === 0 ? <p className="text-sm text-muted">No contact yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {detail.contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
            <span>
              {c.name}
              {c.jobTitle ? <span className="text-muted">, {c.jobTitle}</span> : null}
              <span className="block text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(" | ") || "No email or phone"}</span>
            </span>
            <button type="button" className={BTN} disabled={locked} onClick={() => open(c)}>
              Edit
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          {field("name", "Name")}
          {field("jobTitle", "Role")}
          {field("email", "Email")}
          {field("phone", "Phone")}
          {field("linkedinUrl", "LinkedIn URL")}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save contact"}
            </button>
            <button type="button" className={BTN} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DrawerBody({ detail, locked }: { detail: CompanyDetail; locked: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} p-4`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusPill status={detail.crmStatus as StatusCode} />
          <span className="text-xs text-muted">{detail.channel ? CHANNEL_LABELS[detail.channel as ChannelCode] ?? detail.channel : "No channel"}</span>
          {detail.tier ? <span className="text-xs capitalize text-muted">{detail.tier} company</span> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-xs text-muted">Approx. amount</dt>
          <dd className="tabular-nums">{detail.approxAmountInr > 0 ? formatInr(detail.approxAmountInr) : "-"}</dd>
          {detail.crmStatus === "converted" ? (
            <>
              <dt className="text-xs text-muted">Final amount</dt>
              <dd className="tabular-nums">
                {formatInr(detail.finalAmountInr)} ({formatInr(detail.finalInKindInr)} in-kind)
              </dd>
            </>
          ) : null}
          <dt className="text-xs text-muted">Next follow-up</dt>
          <dd>{fmtDay(detail.nextFollowUp)}</dd>
          <dt className="text-xs text-muted">Last touch</dt>
          <dd>{detail.lastTouchAt ? fmtDateTime(detail.lastTouchAt) : "-"}</dd>
          <dt className="text-xs text-muted">Call attempts</dt>
          <dd>{detail.callAttempts}</dd>
          {detail.sector ? (
            <>
              <dt className="text-xs text-muted">Sector</dt>
              <dd>{detail.sector}</dd>
            </>
          ) : null}
          {detail.rejectionReason ? (
            <>
              <dt className="text-xs text-muted">Rejected because</dt>
              <dd>{detail.rejectionReason}</dd>
            </>
          ) : null}
        </dl>
        {detail.notes ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted">{detail.notes}</p> : null}
      </section>

      <PipelineStepper detail={detail} />
      <QuickActions detail={detail} locked={locked} />
      <Contacts detail={detail} locked={locked} />

      {detail.deal ? (
        <section className={`${CARD} p-4`} aria-label="Deal">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Deal</h3><a className={BTN} href={`/coordinator/slab/${detail.id}`}>Build slab</a><a className={BTN} href={`/coordinator/mou/${detail.id}`}>MoU</a></div>
          <p className="text-sm">
            <span className="capitalize">{detail.deal.stage.replace("_", " ")}</span>
            {detail.deal.signedInr > 0 ? (
              <span className="text-muted">
                {" "}
                | signed {formatInr(detail.deal.signedInr)} (cash {formatInr(detail.deal.cashInr)}, in-kind {formatInr(detail.deal.inKindInr)})
              </span>
            ) : (
              <span className="text-muted"> | proposed {formatInr(detail.deal.proposedInr)}</span>
            )}
          </p>
          {detail.payments.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {detail.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="text-muted">{p.phase === "pre_fest" ? "Before fest" : "After fest"} (due {fmtDay(p.dueOn)})</span>
                  <span className="tabular-nums">
                    {formatInr(p.amountInr)} {p.receivedAt ? "received" : "pending"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className={`${CARD} p-4`} aria-label="Timeline">
        <h3 className="mb-3 text-sm font-semibold">Timeline</h3>
        {detail.timeline.length === 0 ? <p className="text-sm text-muted">Nothing logged yet.</p> : null}
        <ol className="flex flex-col gap-3">
          {detail.timeline.map((t, i) => (
            <li key={`${t.at}-${i}`} className="text-sm">
              <span className="text-xs text-muted">{fmtDateTime(t.at)}</span>
              <span className="block">{t.title.replace(/\b(\w+) to (\w[\w' ]*)$/, "$1 to $2")}</span>
              {t.detail ? <span className="block text-xs text-muted">{t.detail}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function CompanyDrawer({ detail, locked }: { detail: CompanyDetail | null; locked: boolean }) {
  const { setParams } = useQueryNav();
  return (
    <Modal open={detail !== null} onClose={() => setParams({ company: null })} title={detail?.name ?? "Company"} side>
      {detail ? <DrawerBody key={detail.id} detail={detail} locked={locked} /> : null}
    </Modal>
  );
}