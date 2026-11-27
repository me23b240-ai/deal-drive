export const STATUS_CODES = [
  "to_contact",
  "send_mail",
  "slabs_sent",
  "didnt_pick",
  "contacted",
  "ghosting",
  "prospective",
  "converted",
  "rejected",
  "left_company",
  "wrong_number",
] as const;

export type StatusCode = (typeof STATUS_CODES)[number];

export const STATUS_LABELS: Record<StatusCode, string> = {
  to_contact: "To Contact",
  send_mail: "Send Mail",
  slabs_sent: "Slabs sent",
  didnt_pick: "Didn't Pick",
  contacted: "Contacted",
  ghosting: "Ghosting",
  prospective: "Prospective",
  converted: "Converted",
  rejected: "Rejected",
  left_company: "Left the Company",
  wrong_number: "Wrong number",
};

export const RESPONDED_STATUSES: StatusCode[] = [
  "contacted",
  "prospective",
  "converted",
  "rejected",
];
