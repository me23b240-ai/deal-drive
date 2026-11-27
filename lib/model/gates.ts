export type Gate = { gateOn: string; baseInr: number; stretchInr: number };
export type SignedDeal = { confirmedOn: string; amountInr: number };
export type GateStatusLabel = "ON TRACK" | "BEHIND BASE" | "UPCOMING";
export type GateStatus = {
  gateOn: string;
  baseInr: number;
  stretchInr: number;
  actualInr: number;
  status: GateStatusLabel;
  beatsStretch: boolean;
  gapToBase: number;
};

export const DEFAULT_GATES: Gate[] = [
  { gateOn: "2026-12-07", baseInr: 1_320_000, stretchInr: 1_680_000 },
  { gateOn: "2026-12-14", baseInr: 1_600_000, stretchInr: 2_390_000 },
  { gateOn: "2026-12-21", baseInr: 1_880_000, stretchInr: 3_110_000 },
];

export function signedAsOf(deals: SignedDeal[], date: string): number {
  return deals.filter((d) => d.confirmedOn <= date).reduce((t, d) => t + d.amountInr, 0);
}

export function gateStatuses(gates: Gate[], deals: SignedDeal[], today: string): GateStatus[] {
  return [...gates]
    .sort((a, b) => a.gateOn.localeCompare(b.gateOn))
    .map((g) => {
      const asOf = g.gateOn <= today ? g.gateOn : today;
      const actual = signedAsOf(deals, asOf);
      const status: GateStatusLabel = g.gateOn > today ? "UPCOMING" : actual >= g.baseInr ? "ON TRACK" : "BEHIND BASE";
      return { ...g, actualInr: actual, status, beatsStretch: g.gateOn <= today && actual >= g.stretchInr, gapToBase: g.baseInr - actual };
    });
}

export function closingOnlyPhase(gates: Gate[], today: string): boolean {
  const last = [...gates].sort((a, b) => a.gateOn.localeCompare(b.gateOn)).at(-1);
  return !!last && today > last.gateOn;
}

export function missedBaseGate(statuses: GateStatus[]): GateStatus | null {
  return statuses.find((s) => s.status === "BEHIND BASE") ?? null;
}

export type PacePoint = { date: string; base: number; stretch: number };

export function paceLine(gates: Gate[], today: string, actualToday: number, endDate: string, endBase: number, endStretch: number): PacePoint[] {
  const future = [...gates].filter((g) => g.gateOn > today).sort((a, b) => a.gateOn.localeCompare(b.gateOn));
  const pts: PacePoint[] = [{ date: today, base: actualToday, stretch: actualToday }];
  for (const g of future) pts.push({ date: g.gateOn, base: g.baseInr, stretch: g.stretchInr });
  if (endDate > (pts.at(-1)?.date ?? "")) pts.push({ date: endDate, base: endBase, stretch: endStretch });
  return pts;
}