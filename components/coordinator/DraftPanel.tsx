"use client";

import { useState } from "react";
import { wordCount } from "@/lib/ai/guards";
import { buildEmail, SEQUENCE_STEPS, STEP_LABELS, type SequenceStep } from "@/lib/mail/template";
import type { ComposerState, DraftQueueItem, DraftView } from "@/lib/db/queries/crm-drafts";
import { fmtDay } from "./format";
import { useQueryNav } from "./nav";
import { BTN, BTN_PRIMARY, CARD, INPUT, LABEL } from "./styles";
import { useToast } from "./ui";
import { useMutation } from "./use-mutation";

function DraftEditor({ draft, locked }: { draft: DraftView; locked: boolean }) {
  const { run, busy } = useMutation();
  const { push } = useToast();
  const [subject, setSubject] = useState(draft.subject);
  const [opening, setOpening] = useState(opening0(draft));
  const [error, setError] = useState<string | null>(null);
  const email = buildEmail({ step: draft.step, ...draft.mail, subject, opening });
  const words = wordCount(opening);
  const [step1, setStep1] = useState("5");
  const [step2, setStep2] = useState("10");

  async function copyAndOpen() {
    setError(null);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([email.html], { type: "text/html" }),
          "text/plain": new Blob([email.text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(email.text);
      } catch {
        setError("Copying failed. Select the preview text and copy it by hand.");
        return;
      }
    }
    push("success", "Email copied. Paste it into the Gmail window.");
    const to = draft.mail.recipientEmail ? `&to=${encodeURIComponent(draft.mail.recipientEmail)}` : "";
    window.open(`https://mail.google.com/mail/?view=cm&fs=1${to}&su=${encodeURIComponent(email.subject)}`, "_blank", "noopener");
  }

  async function save() {
    setError(null);
    const res = await run("/api/draft", "PATCH", { draftId: draft.id, subject, opening }, "Draft saved", { silentError: true });
    if (!res.ok) setError(res.error);
  }

  async function markSent() {
    setError(null);
    const res = await run<{ tasksCreated: number; taskWarning: string | null }>("/api/draft/send", "POST", { draftId: draft.id, subject, opening, step1Bd: Number(step1) || 5, step2Bd: Number(step2) || 10 }, "Marked as sent", { silentError: true }).then((r) => { if (r.ok && r.data.taskWarning) push("error", r.data.taskWarning); return r; });
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-3">
      {draft.warning ? (
        <p role="status" className="rounded-lg border border-approx/40 bg-approx/10 p-3 text-sm text-approx">
          {draft.warning}
        </p>
      ) : null}
      <div>
        <label className={LABEL} htmlFor="dr-sub">
          Subject
        </label>
        <input id="dr-sub" className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} />
      </div>
      <div>
        <label className={LABEL} htmlFor="dr-open">
          Opening paragraph ({words} words, aim for 90 or fewer) {draft.personalised ? "| personalised" : "| template-only"}
        </label>
        <textarea id="dr-open" className={`${INPUT} min-h-28 py-2`} value={opening} onChange={(e) => setOpening(e.target.value)} disabled={locked} />
        {draft.factsUsed.length > 0 ? <p className="mt-1 text-xs text-muted">Facts used: {draft.factsUsed.join(" | ")}</p> : null}
      </div>
      <div>
        <span className={LABEL}>Preview{draft.mail.recipientEmail ? ` (to ${draft.mail.recipientEmail})` : " (no email on file for this contact)"}</span>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm">{email.text}</pre>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} disabled={locked || busy} onClick={save}>
          Save draft
        </button>
        <button type="button" className={BTN_PRIMARY} disabled={locked} onClick={copyAndOpen}>
          Copy email and open Gmail
        </button>
        <button type="button" className={BTN} disabled={locked || busy} onClick={markSent}>
          Mark sent
        </button>
      </div>
      {draft.step === "initial" ? (<div className="flex flex-wrap items-end gap-3 text-sm"><div><label className={LABEL} htmlFor="seq1">Follow-up 1 after (business days)</label><input id="seq1" className={`${INPUT} w-28`} inputMode="numeric" value={step1} onChange={(e) => setStep1(e.target.value)} /></div><div><label className={LABEL} htmlFor="seq2">Follow-up 2 after (business days)</label><input id="seq2" className={`${INPUT} w-28`} inputMode="numeric" value={step2} onChange={(e) => setStep2(e.target.value)} /></div><p className="text-xs text-muted">Marking sent creates one task for each, due that day. They are removed if the company replies.</p></div>) : null}
      <p className="text-xs text-muted">Send it from Gmail first, then press Mark sent. That logs the mail, moves a new company to Slabs sent and sets the next follow-up in 3 business days.</p>
    </div>
  );
}

const opening0 = (d: DraftView): string => d.opening;

function Composer({ state, locked }: { state: ComposerState; locked: boolean }) {
  const { run, busy } = useMutation();
  const firstEnabled = SEQUENCE_STEPS.find((s) => state.steps[s].enabled) ?? "initial";
  const [step, setStep] = useState<SequenceStep>(firstEnabled);
  const [contactId, setContactId] = useState(state.contacts[0]?.id ?? "");
  const [personalise, setPersonalise] = useState(true);
  const [local, setLocal] = useState<Partial<Record<SequenceStep, DraftView>>>({});
  const [rev, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const draft = local[step] ?? state.drafts.find((d) => d.step === step) ?? null;
  const access = state.steps[step];

  async function generate() {
    setError(null);
    const res = await run<DraftView>("/api/draft", "POST", { brandId: state.brand.id, contactId: contactId || null, step, personalise }, "Draft ready", { silentError: true });
    if (res.ok) {
      setLocal((prev) => ({ ...prev, [step]: res.data }));
      setRev((r) => r + 1);
    } else setError(res.error);
  }

  return (
    <div className={`${CARD} flex flex-col gap-4 p-4`}>
      <h2 className="text-base font-semibold">{state.brand.name}</h2>

      <div>
        <span className={LABEL}>Mail step</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mail step">
          {SEQUENCE_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === step}
              disabled={!state.steps[s].enabled && s !== step}
              title={state.steps[s].reason ?? undefined}
              onClick={() => setStep(s)}
              className={`${BTN} ${s === step ? "border-accent" : ""}`}
            >
              {STEP_LABELS[s]}
            </button>
          ))}
        </div>
        {access.reason ? <p className="mt-2 text-xs text-muted">{access.reason}</p> : null}
      </div>

      {access.enabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="dr-contact">
              Send to
            </label>
            <select id="dr-contact" className={INPUT} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {state.contacts.length === 0 ? <option value="">No contact yet</option> : null}
              {state.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` (${c.email})` : " (no email)"}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={personalise} onChange={(e) => setPersonalise(e.target.checked)} />
            Personalise the opening paragraph
          </label>
          <p className="text-xs text-muted sm:col-span-2">Switch personalising off to use the plain template. That group is the control for the personalisation experiment.</p>
          <div className="sm:col-span-2">
            <button type="button" className={BTN_PRIMARY} disabled={locked || busy} onClick={generate}>
              {busy ? "Working..." : draft ? "Regenerate" : "Generate draft"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {draft && access.enabled ? <DraftEditor key={`${draft.id}:${rev}`} draft={draft} locked={locked} /> : null}

      {state.history.length > 0 ? (
        <section aria-label="Sent mails" className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">Sent</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {state.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span>
                  {STEP_LABELS[h.step]}
                  <span className="text-muted"> | {h.subject}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{h.sentAt ? fmtDay(h.sentAt) : "-"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function DraftPanel({ queue, state, selectedId, locked }: { queue: DraftQueueItem[]; state: ComposerState | null; selectedId: string | null; locked: boolean }) {
  const { setParams } = useQueryNav();
  const follow = queue.filter((q) => q.nextStep !== "initial");
  const first = queue.filter((q) => q.nextStep === "initial");

  const list = (title: string, items: DraftQueueItem[]) => (
    <section aria-label={title}>
      <h3 className="mb-1 px-1 text-xs font-medium text-muted">
        {title} ({items.length})
      </h3>
      <ul className="flex flex-col gap-1">
        {items.map((q) => (
          <li key={q.brandId}>
            <button
              type="button"
              onClick={() => setParams({ company: q.brandId })}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:border-accent ${selectedId === q.brandId ? "border-accent" : "border-border"}`}
            >
              <span className="block font-medium">{q.company}</span>
              <span className="block text-xs text-muted">
                {STEP_LABELS[q.nextStep]} | {q.idleBdays === 0 ? "touched today" : `idle ${q.idleBdays} bdays`}
                {q.inProgress ? " | draft started" : ""}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 ? <li className="px-1 text-xs text-muted">None right now.</li> : null}
      </ul>
    </section>
  );

  return (
    <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
        {list("Follow-ups", follow)}
        {list("First mail", first)}
      </div>
      {state ? <Composer key={state.brand.id} state={state} locked={locked} /> : <div className={`${CARD} p-6 text-sm text-muted`}>Pick a company from the list to write its next mail.</div>}
    </div>
  );
}