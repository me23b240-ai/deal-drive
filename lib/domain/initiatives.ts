export const INITIATIVES = ["bet-1", "bet-2", "bet-3", "bet-4", "bet-5"] as const;
export type InitiativeId = (typeof INITIATIVES)[number];
