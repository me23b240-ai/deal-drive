const dayMonth = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
});

export function fmtDay(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? "-" : dayMonth.format(d);
}

export function bdays(n: number): string {
  return `${n} bday${n === 1 ? "" : "s"}`;
}