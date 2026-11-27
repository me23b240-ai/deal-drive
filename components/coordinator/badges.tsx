import { STATUS_LABELS, type StatusCode } from "@/lib/domain/status";
import { fmtDay } from "./format";

const TONE: Record<StatusCode, string> = {
  to_contact: "border-border text-muted",
  send_mail: "border-border text-muted",
  slabs_sent: "border-border text-foreground",
  didnt_pick: "border-approx/40 text-approx",
  contacted: "border-border text-foreground",
  ghosting: "border-approx/40 text-approx",
  prospective: "border-prospective/40 bg-prospective/10 text-prospective",
  converted: "border-success/40 bg-success/10 text-success",
  rejected: "border-danger/40 bg-danger/10 text-danger",
  left_company: "border-border text-muted",
  wrong_number: "border-border text-muted",
};

export function StatusPill({ status, small = false }: { status: StatusCode; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 ${small ? "py-0 text-[11px]" : "py-0.5 text-xs"} ${TONE[status]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function FlagDot({ flag, nextFollowUp }: { flag: "idle" | "follow_up_due" | null; nextFollowUp: string | null }) {
  if (!flag) return <span className="text-xs text-muted">-</span>;
  const text = flag === "follow_up_due" ? `Follow-up due ${fmtDay(nextFollowUp)}` : "Needs update";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-approx">
      <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
      {text}
    </span>
  );
}