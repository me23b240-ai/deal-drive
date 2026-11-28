import type { GateStatus } from "../model/gates";
import type { Badge } from "./initiatives";
import { formatInr } from "./money";

export type Severity = "high" | "medium" | "low";
export type TaskDraft = { ownerId: string | null; brandId: string | null; title: string };
export type Decision = {
  id: string;
  severity: Severity;
  title: string;
  evidence: string;
  action: string;
  tasksToCreate: TaskDraft[];
};

export type V2Signals = {
  mouSent: { dealId: string; company: string; ownerId: string | null; ownerName: string; amountInr: number; lagBdays: number }[];
  termsPending: { dealId: string; company: string; ownerName: string; amountInr: number; ageBdays: number }[];
  peerFest: { total: number; notStarted: number; bdaysSincePlanStart: number };
  upside: { extraQualified: number; byDate: string; today: string };
};

export type DecisionSnapshot = {
  initiatives: { code: string; name: string; badge: Badge; reason: string }[];
  coordinators: {
    id: string;
    name: string;
    activeCount: number;
    idleBdays: number;
    outreachedThisWeek: number;
    weeklyTarget: number;
    bdaysElapsed: number;
    bdaysInWeek: number;
    ghosting: number;
    engagedPool: number;
  }[];
  staleProspects: { brandId: string; company: string; ownerId: string; ownerName: string; amountInr: number; idleBdays: number; thresholdBdays: number }[];
  overduePayments: { dealId: string; company: string; ownerId: string | null; amountInr: number; dueDate: string }[];
  ownershipConflicts: { company: string; ownerIds: string[]; ownerNames: string[] }[];
  gates: GateStatus[];
  v2?: V2Signals;
};

export const MOU_LATE_BDAYS = 5;
export const TERMS_LATE_BDAYS = 1;
export const PEER_FEST_START_BDAYS = 3;
export const UPSIDE_EXTRA_LEADS = 25;

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function buildDecisions(s: DecisionSnapshot): Decision[] {
  const out: Decision[] = [];

  for (const i of s.initiatives) {
    if (i.badge !== "STOP" && i.badge !== "CHANGE" && i.badge !== "SCALE" && i.badge !== "BEHIND") continue;
    const verb = { STOP: "Stop", CHANGE: "Change", SCALE: "Scale", BEHIND: "Catch up on" }[i.badge];
    out.push({
      id: `initiative-${i.code}`,
      severity: i.badge === "STOP" || i.badge === "BEHIND" ? "high" : "medium",
      title: `${verb} ${i.name} (${i.code})`,
      evidence: i.reason,
      action: i.badge === "SCALE" ? "Double the effort on this lane." : i.badge === "CHANGE" ? "Change the hook or the matching before spending more time." : i.badge === "STOP" ? "Stop this lane and move the hours to the best performing lane." : "Add a closer and review blockers at the next stand-up.",
      tasksToCreate: [],
    });
  }

  for (const c of s.coordinators) {
    if (c.activeCount > 0 && c.idleBdays >= 3) {
      out.push({
        id: `idle-${c.id}`, severity: "high", title: `${c.name} has had no activity for ${c.idleBdays} business days`,
        evidence: `${c.activeCount} companies in active statuses, last activity ${c.idleBdays} business days ago.`,
        action: "Check in today and agree what moves this week.",
        tasksToCreate: [{ ownerId: c.id, brandId: null, title: "Update your active companies and log today's activity" }],
      });
    }
    const expected = c.bdaysInWeek > 0 ? (c.weeklyTarget * c.bdaysElapsed) / c.bdaysInWeek : 0;
    if (c.weeklyTarget > 0 && c.bdaysElapsed > 0 && c.outreachedThisWeek < 0.5 * expected) {
      out.push({
        id: `pace-${c.id}`, severity: "medium", title: `${c.name} is below pace this week`,
        evidence: `${c.outreachedThisWeek} outreached against ${expected.toFixed(1)} expected by now (target ${c.weeklyTarget}).`,
        action: "Agree a catch-up plan and clear the queue first.",
        tasksToCreate: [{ ownerId: c.id, brandId: null, title: `Reach your weekly target of ${c.weeklyTarget} outreaches` }],
      });
    }
    if (c.engagedPool > 0 && c.ghosting / c.engagedPool > 0.25) {
      out.push({
        id: `ghost-${c.id}`, severity: "medium", title: `High ghosting share for ${c.name}`,
        evidence: `${c.ghosting} of ${c.engagedPool} engaged companies are ghosting (${Math.round((100 * c.ghosting) / c.engagedPool)}%).`,
        action: "Switch channel for these contacts: call instead of mail, or reach another person at the company.",
        tasksToCreate: [{ ownerId: c.id, brandId: null, title: "Try a different channel on your ghosting companies" }],
      });
    }
  }

  const stale = s.staleProspects.filter((p) => p.idleBdays > p.thresholdBdays);
  if (stale.length > 0) {
    const total = stale.reduce((t, p) => t + p.amountInr, 0);
    out.push({
      id: "stale-prospects", severity: "high", title: `${stale.length} prospective companies are past their threshold`,
      evidence: `${formatInr(total)} at risk: ${stale.slice(0, 5).map((p) => `${p.company} (${formatInr(p.amountInr)}, idle ${p.idleBdays} business days)`).join("; ")}.`,
      action: "Nudge each one today, and the head calls the largest directly.",
      tasksToCreate: stale.map((p) => ({ ownerId: p.ownerId, brandId: p.brandId, title: `Nudge ${p.company}: idle ${p.idleBdays} business days` })),
    });
  }

  if (s.overduePayments.length > 0) {
    const total = s.overduePayments.reduce((t, p) => t + p.amountInr, 0);
    out.push({
      id: "overdue-payments", severity: "high", title: `${s.overduePayments.length} payments are overdue`,
      evidence: `${formatInr(total)} overdue: ${s.overduePayments.map((p) => `${p.company} (due ${p.dueDate})`).join("; ")}.`,
      action: "Send a payment reminder with the invoice today.",
      tasksToCreate: s.overduePayments.map((p) => ({ ownerId: p.ownerId, brandId: null, title: `Chase payment from ${p.company} (${formatInr(p.amountInr)})` })),
    });
  }

  for (const k of s.ownershipConflicts) {
    out.push({
      id: `conflict-${k.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, severity: "low", title: `Two owners for ${k.company}`,
      evidence: `${k.ownerNames.join(" and ")} both hold this company.`,
      action: "Pick one owner and tell the other to drop it.",
      tasksToCreate: k.ownerIds.map((id) => ({ ownerId: id, brandId: null, title: `Confirm who owns ${k.company}` })),
    });
  }

  const missed = s.gates.find((g) => g.status === "BEHIND BASE");
  if (missed) {
    out.push({
      id: "replan-gates", severity: "high", title: "Re-plan: move hours to bet-1 and bet-3",
      evidence: `Signed ${formatInr(missed.actualInr)} at the ${missed.gateOn} gate, base line is ${formatInr(missed.baseInr)}.`,
      action: "Move hours from the colder lanes to the deal desk and warm renewals.",
      tasksToCreate: [],
    });
  }

  const v = s.v2;
  if (v) {
    const lateMou = v.mouSent.filter((m) => m.lagBdays > MOU_LATE_BDAYS);
    if (lateMou.length > 0) {
      out.push({
        id: "mou-unsigned", severity: "high", title: `${lateMou.length} MoUs sent but not signed after ${MOU_LATE_BDAYS} business days`,
        evidence: lateMou.map((m) => `${m.company} (${formatInr(m.amountInr)}, waiting ${m.lagBdays} business days)`).join("; ") + ".",
        action: "Call the signatory today and ask what is blocking the signature.",
        tasksToCreate: lateMou.map((m) => ({ ownerId: m.ownerId, brandId: null, title: `Chase MoU signature from ${m.company}` })),
      });
    }
    const late = v.termsPending.filter((t) => t.ageBdays > TERMS_LATE_BDAYS);
    if (late.length > 0) {
      out.push({
        id: "terms-pending", severity: "high", title: `${late.length} deals wait for terms approval`,
        evidence: late.map((t) => `${t.company} (${formatInr(t.amountInr)}, ${t.ageBdays} business days, ${t.ownerName})`).join("; ") + ".",
        action: "Open the approvals queue and approve or reject today so the coordinator can move.",
        tasksToCreate: [],
      });
    }
    if (v.peerFest.total > 0 && v.peerFest.notStarted > 0 && v.peerFest.bdaysSincePlanStart >= PEER_FEST_START_BDAYS) {
      out.push({
        id: "peerfest-research", severity: "medium", title: `Peer-fest research not started on ${v.peerFest.notStarted} of ${v.peerFest.total} fests`,
        evidence: `${v.peerFest.bdaysSincePlanStart} business days have passed since the plan start.`,
        action: "Assign a researcher to each fest that is still marked todo.",
        tasksToCreate: [],
      });
    }
    if (v.upside.extraQualified >= UPSIDE_EXTRA_LEADS && v.upside.today <= v.upside.byDate) {
      out.push({
        id: "upside-trigger", severity: "low", title: "Upside trigger reached: the moonshot case is in reach",
        evidence: `${v.upside.extraQualified} qualified peer-fest leads against ${UPSIDE_EXTRA_LEADS} needed by ${v.upside.byDate}.`,
        action: "Review the upside scenario on the Plan page and raise the stretch warm lead target.",
        tasksToCreate: [],
      });
    }
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}