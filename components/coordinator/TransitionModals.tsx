"use client";

import { useState } from "react";
import { STATUS_LABELS, type StatusCode } from "@/lib/domain/status";
import { formatInr, parseInr } from "@/lib/domain/money";
import { BTN, BTN_PRIMARY, INPUT, LABEL } from "./styles";
import { Modal } from "./ui";
import { useMutation } from "./use-mutation";

export type StatusTarget = { brandId: string; name: string; to: StatusCode; defaultAmountInr?: number | null };

const REASONS = ["Budget not available", "Not a fit for the brand", "Already sponsoring another fest", "Timing doesn't work", "No longer interested"];

function StatusForm({ target, onClose }: { target: StatusTarget; onClose: () => void }) {
  const { run, busy } = useMutation();
  const to = target.to;
  const [amount, setAmount] = useState(target.defaultAmountInr ? String(target.defaultAmountInr) : "");
  const [inKind, setInKind] = useState("");
  const [reason, setReason] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finalAmt = to === "converted" ? parseInr(amount) : null;
  const inKindAmt = inKind.trim() ? parseInr(inKind) : 0;
  const cash = finalAmt && inKindAmt !== null ? finalAmt - inKindAmt : null;

  async function submit() {
    setError(null);
    const body: Record<string, unknown> = { brandId: target.brandId, to, note: note.trim() || null };
    if (to === "prospective") {
      const a = parseInr(amount);
      if (!a) return setError("Enter the approximate amount.");
      body.approxAmountInr = a;
      if (followUp) body.nextFollowUp = followUp;
    } else if (to === "converted") {
      if (!finalAmt) return setError("Enter the final amount.");
      if (inKindAmt === null || inKindAmt < 0 || inKindAmt > finalAmt) return setError("In-kind must be between zero and the final amount.");
      body.finalAmountInr = finalAmt;
      body.inKindInr = inKindAmt;
    } else if (to === "rejected") {
      if (!reason.trim()) return setError("Pick or type a reason.");
      body.rejectionReason = reason.trim();
    } else if (followUp) {
      body.nextFollowUp = followUp;
    }
    const res = await run("/api/crm/status", "POST", body, `${target.name} moved to ${STATUS_LABELS[to]}`, { silentError: true });
    if (res.ok) onClose();
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {target.name} will move to <span className="text-foreground">{STATUS_LABELS[to]}</span>.
      </p>

      {to === "prospective" || to === "converted" ? (
        <div>
          <label className={LABEL} htmlFor="amt">
            {to === "converted" ? "Final amount (INR)" : "Approximate amount (INR)"}
          </label>
          <input id="amt" className={INPUT} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500000" />
        </div>
      ) : null}

      {to === "converted" ? (
        <div>
          <label className={LABEL} htmlFor="ik">
            Of which in-kind (INR, optional)
          </label>
          <input id="ik" className={INPUT} inputMode="numeric" value={inKind} onChange={(e) => setInKind(e.target.value)} placeholder="0" />
          {cash !== null && cash > 0 ? (
            <p className="mt-2 text-xs text-muted">
              Cash {formatInr(cash)}: about 75% ({formatInr(Math.round(cash * 0.75))}) before the fest and 25% ({formatInr(cash - Math.round(cash * 0.75))}) after.
            </p>
          ) : null}
        </div>
      ) : null}

      {to === "rejected" ? (
        <div>
          <label className={LABEL} htmlFor="why">
            Reason
          </label>
          <select className={INPUT} value={REASONS.includes(reason) ? reason : ""} onChange={(e) => setReason(e.target.value)}>
            <option value="">Pick a reason...</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input id="why" className={`${INPUT} mt-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type your own" />
        </div>
      ) : null}

      {to !== "converted" && to !== "rejected" ? (
        <div>
          <label className={LABEL} htmlFor="fu">
            Next follow-up {to === "prospective" ? "(defaults to 3 business days)" : "(optional)"}
          </label>
          <input id="fu" type="date" className={INPUT} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>
      ) : null}

      <div>
        <label className={LABEL} htmlFor="note">
          Note (optional)
        </label>
        <textarea id="note" className={`${INPUT} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" className={BTN} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

/** One modal for every status change. Opens when `target` is set; the form resets each time it opens. */
export function StatusModal({ target, onClose }: { target: StatusTarget | null; onClose: () => void }) {
  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Move to ${STATUS_LABELS[target.to]}` : "Change status"}>
      {target ? <StatusForm key={`${target.brandId}:${target.to}`} target={target} onClose={onClose} /> : null}
    </Modal>
  );
}