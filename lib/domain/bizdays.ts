const IST = "Asia/Kolkata";

export type Holiday = { on_date: string };

function toUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+05:30`);
}

function formatDateIST(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isoDow(isoDate: string): number {
  const dow = toUtcDate(isoDate).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function isBusinessDay(isoDate: string, holidays: Holiday[]): boolean {
  const dow = isoDow(isoDate);
  if (dow > 5) return false;
  return !holidays.some((h) => h.on_date === isoDate);
}

export function businessDaysBetween(start: string, end: string, holidays: Holiday[]): number {
  if (end <= start) return 0;
  let count = 0;
  const cursor = toUtcDate(start);
  const last = toUtcDate(end);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= last.getTime()) {
    const iso = formatDateIST(cursor);
    if (isBusinessDay(iso, holidays)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function addBusinessDays(start: string, days: number, holidays: Holiday[]): string {
  const cursor = toUtcDate(start);
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = formatDateIST(cursor);
    if (isBusinessDay(iso, holidays)) remaining -= 1;
  }
  return formatDateIST(cursor);
}

export function weekStartIST(isoDate: string): string {
  const cursor = toUtcDate(isoDate);
  const dow = isoDow(isoDate);
  cursor.setUTCDate(cursor.getUTCDate() - (dow - 1));
  return formatDateIST(cursor);
}

export function weekEndIST(isoDate: string): string {
  const start = toUtcDate(weekStartIST(isoDate));
  start.setUTCDate(start.getUTCDate() + 6);
  return formatDateIST(start);
}

export function businessDaysLeftInWeek(isoDate: string, holidays: Holiday[]): number {
  return businessDaysBetween(isoDate, weekEndIST(isoDate), holidays) + (isBusinessDay(isoDate, holidays) ? 1 : 0);
}
