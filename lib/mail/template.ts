export const TEMPLATE_VERSION = "v1";
export const SEQUENCE_STEPS = ["initial", "follow_up_1", "follow_up_2"] as const;
export type SequenceStep = (typeof SEQUENCE_STEPS)[number];

export const STEP_LABELS: Record<SequenceStep, string> = {
  initial: "First mail",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2 (last note)",
};

export type MailParts = {
  step: SequenceStep;
  eventName: string;
  senderName: string;
  company: string;
  contactName: string | null;
  subject?: string | null;
  opening: string;
};

/** Safe opening used for the template-only arm and whenever the AI output is rejected. No numbers, no claims. */
export function genericOpening(step: SequenceStep, eventName: string, company: string): string {
  if (step === "follow_up_1") return `I wanted to follow up on my earlier note about ${eventName}, in case it got buried in your inbox.`;
  if (step === "follow_up_2") return `This is my last note about ${eventName}, and I would be glad to share the details whenever it suits you.`;
  return `I am reaching out to introduce ${eventName} and to explore whether a partnership with ${company} could make sense this year.`;
}

export function defaultSubject(step: SequenceStep, eventName: string, company: string): string {
  if (step === "follow_up_1") return `Following up: ${eventName} partnership with ${company}`;
  if (step === "follow_up_2") return `Last note: ${eventName} partnership`;
  return `Partnership opportunity: ${eventName} x ${company}`;
}

function bodyFor(step: SequenceStep, eventName: string, company: string): string {
  if (step === "follow_up_1") {
    return "Happy to resend the slabs or answer any questions, and a short call is easy to arrange at a time that works for you.";
  }
  if (step === "follow_up_2") {
    return "If the timing is not right this year, no problem at all. I will leave it here, and the door stays open if things change.";
  }
  return `We are writing on behalf of the ${eventName} sponsorship team. We would be glad to share our sponsorship slabs and discuss how ${company} could be part of the festival. If it helps, I can send a short deck or set up a quick call at a time that suits you.`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildEmail(p: MailParts): { subject: string; text: string; html: string } {
  const subject = (p.subject ?? "").trim() || defaultSubject(p.step, p.eventName, p.company);
  const greeting = p.contactName && p.contactName.trim() ? `Dear ${p.contactName.trim()},` : "Hello,";
  const paragraphs = [
    greeting,
    p.opening.trim(),
    bodyFor(p.step, p.eventName, p.company),
    `Warm regards,\n${p.senderName}\n${p.eventName} Sponsorship Team`,
  ];
  return {
    subject,
    text: paragraphs.join("\n\n"),
    html: paragraphs.map((x) => `<p>${escapeHtml(x).replace(/\n/g, "<br>")}</p>`).join(""),
  };
}