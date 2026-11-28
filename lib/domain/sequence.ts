import { addBusinessDays, type Holiday } from "./bizdays";

export const FOLLOW_UP_OFFSETS = { step1: 5, step2: 10 } as const;
export const DM_FOLLOW_UP_BDAYS = 3;

export type SequenceTask = { step: 1 | 2; dueOn: string; title: string };

/** Follow-up dates counted in business days from the send date. Nothing is scheduled once the company has replied. */
export function sequenceTasks(
  sentOn: string,
  holidays: Holiday[],
  opts: { replied: boolean; company: string; offsets?: { step1: number; step2: number } },
): SequenceTask[] {
  if (opts.replied) return [];
  const o = opts.offsets ?? FOLLOW_UP_OFFSETS;
  return [
    { step: 1, dueOn: addBusinessDays(sentOn, o.step1, holidays), title: `Follow-up 1: ${opts.company}` },
    { step: 2, dueOn: addBusinessDays(sentOn, o.step2, holidays), title: `Follow-up 2: ${opts.company}` },
  ];
}

export function dmFollowUpDate(sentOn: string, holidays: Holiday[]): string {
  return addBusinessDays(sentOn, DM_FOLLOW_UP_BDAYS, holidays);
}