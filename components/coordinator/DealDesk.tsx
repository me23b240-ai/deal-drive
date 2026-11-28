"use client";

import { useState } from "react";
import { formatInr } from "@/lib/domain/money";
import { TERMS_LABELS, type PaymentTerms } from "@/lib/domain/payments";
import type { DealDeskRow } from "@/lib/types";
import { bdays } from "./format";
import { useQueryNav } from "./nav";
import { BTN, CARD, INPUT } from "./styles";
import { StatusModal, type StatusTarget } from "./TransitionModals";
import { useMutation } from "./use-mutation";

type Row = Omit<DealDeskRow, "stage"> & {
  stage: string;
  payment_terms?: string | null;
  terms_status?: string | null;
  mou_sent_at?: string | null;
  mou_lag_bdays?: number | null;
};

const STAGES = [
  ["prospecting", "Prospecting"],
  ["proposal_sent", "Proposal sent"],
  ["negotiating", "Negotiating"],
] as const;
const SELECT = "min-h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50";

function termsText(r: Row): { text: string; flag: boolean } {
  const t = r.payment_terms && r.payment_terms in TERMS_LABELS ? TERMS_LABELS[r.payment_terms as PaymentTerms] : "Not set";
  if (r.terms_status === "pending_approval") return { text: `${t} | needs head approval`, flag: true };
  if (r.terms_status === "approved") return { text: `${t} | approved`, flag: false };
  return { text: t, flag: false };
}

export function DealDesk(props: { deals: DealDeskRow[]; nameOf: Record<string, string>; showOwner: boolean; meId: string | null; locked: boolean }) {
  const { run, busy } = useMutation();
  const { setParams } = useQueryNav();
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const deals = props.deals as unknown as Row[];
  const total = deals.reduce((sum, d) => sum + d.proposed_inr, 0);
  const patch = (dealId: string, body: Record<string, unknown>, text: string) => run("/api/crm/deals", "PATCH", { dealId, ...body }, text);

  return (
    <section className={`${CARD} overflow-hidden`} aria-label="Deal desk">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border p-3">
        <h2 className="text-sm font-semibold">
          Open deals <span className="font-normal text-muted">({deals.length} worth {formatInr(total)})</span>
        </h2>
        {props.showOwner ? <span className="text-xs text-muted">You are a closer, so every open deal is shown.</span> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">Company</th>
              {props.showOwner ? <th scope="col" className="px-3 py-2 text-left font-medium">Owner</th> : null}
              <th scope="col" className="px-3 py-2 text-left font-medium">Stage</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Proposed</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Terms</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Idle</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">MoU lag</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Nudges</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Next follow-up</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted">
                  No open deals. A company appears here once it becomes Prospective.
                </td>
              </tr>
            ) : (
              deals.map((d) => {
                const mine = d.owner_id === props.meId;
                const off = props.locked || busy;
                const mouOut = d.stage === "mou_sent";
                const terms = termsText(d);
                return (
                  <tr key={d.deal_id} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium">
                      {mine ? (
                        <button type="button" className="text-left hover:text-accent" onClick={() => setParams({ tab: null, company: d.brand_id })}>
                          {d.company}
                        </button>
                      ) : (
                        d.company
                      )}
                    </td>
                    {props.showOwner ? <td className="px-3 py-2 text-xs">{d.owner_id ? props.nameOf[d.owner_id] ?? "-" : "-"}</td> : null}
                    <td className="px-3 py-2">
                      {mouOut ? (
                        <span className="text-xs">MoU sent</span>
                      ) : (
                        <select className={SELECT} aria-label={`Stage for ${d.company}`} value={d.stage} disabled={off} onChange={(e) => patch(d.deal_id, { stage: e.target.value }, "Stage updated")}>
                          {STAGES.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums">{formatInr(d.proposed_inr)}</td>
                    <td className={`px-3 py-2 text-xs ${terms.flag ? "text-approx" : ""}`}>{terms.text}</td>
                    <td className={`px-3 py-2 text-xs ${d.idle_bdays >= 3 ? "text-approx" : ""}`}>{d.idle_bdays === 0 ? "Today" : bdays(d.idle_bdays)}</td>
                    <td className={`px-3 py-2 text-xs ${(d.mou_lag_bdays ?? 0) >= 3 ? "text-approx" : ""}`}>{d.mou_lag_bdays === null || d.mou_lag_bdays === undefined ? "-" : bdays(d.mou_lag_bdays)}</td>
                    <td className="px-3 py-2 text-xs">{d.nudges}</td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className={`${INPUT} min-h-8 text-xs`}
                        aria-label={`Next follow-up for ${d.company}`}
                        defaultValue={d.next_follow_up ?? ""}
                        disabled={off || mouOut}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (d.next_follow_up ?? null)) void patch(d.deal_id, { nextFollowUp: v }, "Follow-up updated");
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {!mouOut ? (
                          <a className={BTN} href={`/coordinator/slab/${d.brand_id}`}>
                            Slab
                          </a>
                        ) : null}
                        <a className={BTN} href={`/coordinator/mou/${d.brand_id}`}>
                          MoU
                        </a>
                        <button type="button" className={BTN} disabled={off} onClick={() => run("/api/crm/deals/nudge", "POST", { dealId: d.deal_id }, "Nudge logged")}>
                          Nudge
                        </button>
                        <button type="button" className={BTN} disabled={off} onClick={() => setTarget({ brandId: d.brand_id, name: d.company, to: "rejected" })}>
                          Lost
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <StatusModal target={target} onClose={() => setTarget(null)} />
    </section>
  );
}