"use client";

import { useMemo, useState } from "react";
import { formatInr } from "@/lib/domain/money";
import { MOU_BANNER, DELIVERY_WINDOW_PLACEHOLDER, renderMou, validateMou, type MouFields } from "@/lib/domain/mou-template";
import { TERMS_LABELS } from "@/lib/domain/payments";
import type { MouState } from "@/lib/db/queries/crm-mou";
import { fmtDay } from "./format";
import { BTN, BTN_PRIMARY, CARD, INPUT, LABEL } from "./styles";
import { useMutation } from "./use-mutation";

const digits = (v: string): number => Number(v.replace(/[^0-9]/g, "")) || 0;

export function MouEditor({ state, locked }: { state: MouState; locked: boolean }) {
  const { run, busy } = useMutation();
  const [f, setF] = useState<MouFields>(state.fields);
  const [showErrors, setShowErrors] = useState(false);
  const [signedOn, setSignedOn] = useState(state.today);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const stage = state.deal.stage;
  const signed = stage === "partner_confirmed";
  const readOnly = locked || signed;
  const errors = useMemo(() => validateMou({ ...f, gstin: f.gstin.trim().toUpperCase() }), [f]);
  const preview = useMemo(() => renderMou(f, state.eventName), [f, state.eventName]);
  const set = <K extends keyof MouFields>(k: K, v: MouFields[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => (showErrors && errors[k] ? <span className="mt-1 block text-xs text-danger">{errors[k]}</span> : null);

  const body = () => ({ brandId: state.brand.id, ...f, gstin: f.gstin.trim().toUpperCase(), deliveryWindow: f.deliveryWindow ?? "" });

  async function save(): Promise<boolean> {
    setError(null);
    setInfo(null);
    setShowErrors(true);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted fields first.");
      return false;
    }
    const res = await run("/api/crm/mou", "POST", body(), "MoU details saved", { silentError: true });
    if (!res.ok) setError(res.error);
    return res.ok;
  }

  async function send() {
    if (!(await save())) return;
    const res = await run<{ taskWarning: string | null }>("/api/crm/mou/send", "POST", { brandId: state.brand.id }, "MoU marked as sent", { silentError: true });
    if (!res.ok) setError(res.error);
    else setInfo(res.data.taskWarning ?? "A task to chase the signature was added for 3 business days from now.");
  }

  async function sign() {
    setError(null);
    setInfo(null);
    const res = await run<{ paymentsCreated: number; warnings: string[] }>("/api/crm/mou/signed", "POST", { brandId: state.brand.id, signedOn }, "Deal closed", { silentError: true });
    if (!res.ok) setError(res.error);
    else setInfo([`Closed. ${res.data.paymentsCreated} payment row${res.data.paymentsCreated === 1 ? "" : "s"} created.`, ...res.data.warnings].join(" "));
  }

  const field = (k: keyof MouFields, label: string, props?: { type?: string; multiline?: boolean }) => (
    <div key={k}>
      <label className={LABEL} htmlFor={`mou-${k}`}>
        {label}
      </label>
      {props?.multiline ? (
        <textarea id={`mou-${k}`} className={`${INPUT} min-h-16 py-2`} value={String(f[k] ?? "")} disabled={readOnly} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input id={`mou-${k}`} className={INPUT} type={props?.type} value={String(f[k] ?? "")} disabled={readOnly} onChange={(e) => set(k, e.target.value as never)} />
      )}
      {err(k)}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 print:hidden">
        <section className={`${CARD} flex flex-col gap-3 p-4`} aria-label="MoU details">
          <h2 className="text-sm font-semibold">MoU details</h2>
          {field("brandName", "Brand name")}
          {field("officialAddress", "Official address", { multiline: true })}
          {field("signatoryName", "Signing authority name")}
          {field("signatoryDesignation", "Designation")}
          {field("tagline", "Brand tagline (optional)")}
          {field("gstin", "GSTIN")}
          <div className="grid grid-cols-2 gap-3">
            {field("mouDate", "MoU date", { type: "date" })}
            {field("proformaDueDate", "Pre-fest payment due date", { type: "date" })}
          </div>
          <div>
            <label className={LABEL} htmlFor="mou-amount">Amount (INR)</label>
            <input id="mou-amount" className={INPUT} inputMode="numeric" value={f.amountInr} disabled={readOnly} onChange={(e) => set("amountInr", digits(e.target.value))} />
            {err("amountInr")}
            {f.amountInr !== state.deal.totalInr ? <span className="mt-1 block text-xs text-approx">The slab total is {formatInr(state.deal.totalInr)}. Closing the deal uses the slab, not this field.</span> : null}
          </div>
          <p className="text-xs text-muted">Payment split: {TERMS_LABELS[f.terms]} (set in the slab builder).</p>
          <div>
            <label className={LABEL} htmlFor="mou-window">Delivery window (placeholder until confirmed with Cul-Ad)</label>
            <input id="mou-window" className={INPUT} placeholder={DELIVERY_WINDOW_PLACEHOLDER} value={f.deliveryWindow ?? ""} disabled={readOnly} onChange={(e) => set("deliveryWindow", e.target.value)} />
          </div>
          <div>
            <span className={LABEL}>Deliverables (from the slab, editable)</span>
            {err("deliverables")}
            <ul className="flex flex-col gap-2">
              {f.deliverables.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <input aria-label={`Deliverable ${i + 1}`} className={INPUT} value={d.name} disabled={readOnly} onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input aria-label={`Quantity ${i + 1}`} className={`${INPUT} w-16`} inputMode="numeric" value={d.qty} disabled={readOnly} onChange={(e) => set("deliverables", f.deliverables.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Math.min(50, digits(e.target.value))) } : x)))} />
                  <button type="button" className={BTN} disabled={readOnly} onClick={() => set("deliverables", f.deliverables.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={`${BTN} mt-2`} disabled={readOnly} onClick={() => set("deliverables", [...f.deliverables, { name: "", qty: 1 }])}>
              Add deliverable
            </button>
          </div>
        </section>

        <section className={`${CARD} flex flex-col gap-3 p-4`} aria-label="MoU actions">
          <h2 className="text-sm font-semibold">Steps</h2>
          <p className="text-sm text-muted">
            Deal stage: {stage.replace("_", " ")}
            {state.deal.mouSentAt ? ` | MoU sent ${fmtDay(state.deal.mouSentAt)}` : ""}
            {state.deal.mouSignedAt ? ` | signed ${fmtDay(state.deal.mouSignedAt)}` : ""}
          </p>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {info ? <p role="status" className="text-sm text-success">{info}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={readOnly || busy} onClick={save}>
              Save MoU details
            </button>
            <button type="button" className={BTN} onClick={() => window.print()}>
              Print or Save as PDF
            </button>
          </div>
          <div className="border-t border-border pt-3">
            <button type="button" className={BTN_PRIMARY} disabled={readOnly || busy || state.sendBlocked !== null} onClick={send}>
              Mark MoU sent
            </button>
            {state.sendBlocked ? <p className="mt-2 text-xs text-muted">{state.sendBlocked}</p> : null}
          </div>
          <div className="border-t border-border pt-3">
            <label className={LABEL} htmlFor="mou-signed">Date signed by both sides</label>
            <div className="flex gap-2">
              <input id="mou-signed" type="date" className={INPUT} value={signedOn} disabled={readOnly || stage !== "mou_sent"} onChange={(e) => setSignedOn(e.target.value)} />
              <button type="button" className={BTN_PRIMARY} disabled={readOnly || busy || stage !== "mou_sent"} onClick={sign}>
                MoU signed by both sides
              </button>
            </div>
            {stage !== "mou_sent" && !signed ? <p className="mt-2 text-xs text-muted">Available once the MoU is marked sent.</p> : null}
            {state.paymentPreview.length > 0 ? (
              <div className="mt-3 text-xs text-muted">
                <p>Signing creates these payments:</p>
                <ul>
                  {state.paymentPreview.map((p) => (
                    <li key={p.phase}>
                      {p.phase === "pre_fest" ? "Before the fest" : "After the fest"}: {formatInr(p.amountInr)}, due {fmtDay(p.dueOn)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className={`${CARD} p-6 print:border-0`} aria-label="MoU preview">
        <style>{`@media print { body * { visibility: hidden !important; } #mou-print, #mou-print * { visibility: visible !important; } #mou-print { position: absolute; left: 0; top: 0; width: 100%; padding: 32px; color: #000; background: #fff; } }`}</style>
        <div id="mou-print" className="flex flex-col gap-4 text-sm">
          <p className="rounded border border-approx/50 bg-approx/10 px-3 py-2 text-center text-xs font-medium text-approx print:border-black print:bg-transparent print:text-black">{MOU_BANNER}</p>
          <h2 className="text-base font-semibold">{preview.title}</h2>
          {preview.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted print:text-black">{s.heading}</h3>
              {s.lines.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}