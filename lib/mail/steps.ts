import type { SequenceStep } from "./template";

export type StepAccess = { enabled: boolean; reason: string | null };

const CLOSED = ["converted", "rejected", "left_company", "wrong_number"];
const FIRST_MAIL_STATUSES = ["to_contact", "send_mail", "didnt_pick"];

/** Which mail steps a company can have right now. Follow-ups unlock in order after the first mail is sent. */
export function stepAccess(status: string, sent: ReadonlySet<SequenceStep>): Record<SequenceStep, StepAccess> {
  if (CLOSED.includes(status)) {
    const closed: StepAccess = { enabled: false, reason: "This company is closed." };
    return { initial: closed, follow_up_1: closed, follow_up_2: closed };
  }
  const initial: StepAccess = sent.has("initial")
    ? { enabled: false, reason: "Already sent." }
    : FIRST_MAIL_STATUSES.includes(status)
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "This company is already past the first-mail stage." };
  const f1: StepAccess = sent.has("follow_up_1")
    ? { enabled: false, reason: "Already sent." }
    : sent.has("initial") || status === "slabs_sent"
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "Send the first mail first." };
  const f2: StepAccess = sent.has("follow_up_2")
    ? { enabled: false, reason: "Already sent." }
    : sent.has("follow_up_1")
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "Send follow-up 1 first." };
  return { initial, follow_up_1: f1, follow_up_2: f2 };
}

export function nextStep(status: string, sent: ReadonlySet<SequenceStep>): SequenceStep | null {
  const a = stepAccess(status, sent);
  if (a.initial.enabled) return "initial";
  if (a.follow_up_1.enabled) return "follow_up_1";
  if (a.follow_up_2.enabled) return "follow_up_2";
  return null;
}