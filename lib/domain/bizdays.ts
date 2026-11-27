export type Holiday = { day: string };

const DAY_MS = 86_400_000;
const istFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function holidaySet(holidays: Holiday[]): Set<string> {
  return new Set(holidays.map((h) => h.day));
}

export function toIstDate(value: string | Date): string {
  return istFormat.format(typeof value === "string" ? new Date(value) : value);
}

export function todayIST(now: Date = new Date()): string {
  return istFormat.format(now);
}

export function addDays(iso: string, days: number): string {
  return formatMs(parseIso(iso) + days * DAY_MS);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseIso(end) - parseIso(start)) / DAY_MS);
}

export function isoDow(iso: string): number {
  const dow = new Date(parseIso(iso)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function isBusinessDay(iso: string, holidays: Holiday[] = []): boolean {
  return isoDow(iso) <= 5 && !holidaySet(holidays).has(iso);
}

/** Business days AFTER start, up to and including end (matches SQL business_days_between). */
export function businessDaysBetween(start: string, end: string, holidays: Holiday[] = []): number {
  if (end <= start) return 0;
  const hs = holidaySet(holidays);
  const last = parseIso(end);
  let count = 0;
  for (let ms = parseIso(start) + DAY_MS; ms <= last; ms += DAY_MS) {
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6 && !hs.has(formatMs(ms))) count += 1;
  }
  return count;
}

export function addBusinessDays(start: string, days: number, holidays: Holiday[] = []): string {
  const hs = holidaySet(holidays);
  let ms = parseIso(start);
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    ms += DAY_MS;
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6 && !hs.has(formatMs(ms))) remaining -= 1;
  }
  return formatMs(ms);
}

export function weekStartIST(iso: string): string {
  return addDays(iso, -(isoDow(iso) - 1));
}

export function weekEndIST(iso: string): string {
  return addDays(weekStartIST(iso), 6);
}

/** Business days left in the Mon-Sun week, counting today if it is a business day. */
export function businessDaysLeftInWeek(iso: string, holidays: Holiday[] = []): number {
  return businessDaysBetween(iso, weekEndIST(iso), holidays) + (isBusinessDay(iso, holidays) ? 1 : 0);
}