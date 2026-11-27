import { requireHead } from "../guards";
import type { Ctx } from "../../types";
import { buildDecisions, type Decision } from "../../domain/decisions";
import type { GateStatus } from "../../model/gates";
import { getDecisionSnapshot } from "./decisions";
import { getDealBoard, type DealRow } from "./head-b-deals";
import { getLeadSupply } from "./plan";

export type RiskSignal = { id: string; title: string; evidence: string };
export type StaleGroup = {
  ownerId: string;
  ownerName: string;
  totalInr: number;
  items: { company: string; amountInr: number; idleBdays: number }[];
};
export type RisksData = {
  decisions: Decision[];
  staleGroups: StaleGroup[];
  staleTotalInr: number;
  signals: { title: string; items: RiskSignal[] }[];
  gates: GateStatus[];
  lead: { warmPool: number; baseNeed: number; stretchNeed: number; gapToBase: number; gapToStretch: number };
  top5Idle: DealRow[];
};

export async function getRisksData(ctx: Ctx): Promise<RisksData> {
  requireHead(ctx);
  const [snap, supply, board] = await Promise.all([getDecisionSnapshot(ctx), getLeadSupply(ctx), getDealBoard(ctx)]);
  const decisions = buildDecisions(snap);

  const groups = new Map<string, StaleGroup>();
  for (const p of snap.staleProspects.filter((x) => x.idleBdays > x.thresholdBdays)) {
    const g = groups.get(p.ownerId) ?? { ownerId: p.ownerId, ownerName: p.ownerName, totalInr: 0, items: [] };
    g.totalInr += p.amountInr;
    g.items.push({ company: p.company, amountInr: p.amountInr, idleBdays: p.idleBdays });
    groups.set(p.ownerId, g);
  }
  const staleGroups = [...groups.values()].sort((a, b) => b.totalInr - a.totalInr);

  const pick = (prefix: string): RiskSignal[] =>
    decisions.filter((d) => d.id.startsWith(prefix)).map((d) => ({ id: d.id, title: d.title, evidence: d.evidence }));

  return {
    decisions,
    staleGroups,
    staleTotalInr: staleGroups.reduce((t, g) => t + g.totalInr, 0),
    signals: [
      { title: "No recent activity", items: pick("idle-") },
      { title: "Below weekly pace", items: pick("pace-") },
      { title: "High ghosting", items: pick("ghost-") },
      { title: "Ownership conflicts", items: pick("conflict-") },
    ],
    gates: snap.gates,
    lead: {
      warmPool: supply.warmPool,
      baseNeed: supply.baseNeed,
      stretchNeed: supply.stretchNeed,
      gapToBase: supply.gapToBase,
      gapToStretch: supply.gapToStretch,
    },
    top5Idle: board.rows.filter((r) => r.isTop5 && r.idleBdays > 3),
  };
}