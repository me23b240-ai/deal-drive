export const CREATOR_STATUSES = ["to_dm", "dm_sent", "replied", "confirmed", "declined"] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

export const CREATOR_LABELS: Record<CreatorStatus, string> = {
  to_dm: "To DM",
  dm_sent: "DM sent",
  replied: "Replied",
  confirmed: "Confirmed",
  declined: "Declined",
};

const NEXT: Record<CreatorStatus, CreatorStatus[]> = {
  to_dm: ["dm_sent"],
  dm_sent: ["replied", "declined"],
  replied: ["confirmed", "declined"],
  confirmed: [],
  declined: [],
};

export const canMoveCreator = (from: CreatorStatus, to: CreatorStatus): boolean => NEXT[from].includes(to);
export const nextCreatorStatuses = (from: CreatorStatus): CreatorStatus[] => NEXT[from];

/** Accepts @name, a bare name or an instagram.com link. Returns null when it isn't a valid handle. */
export function normaliseHandle(raw: string): string | null {
  const h = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** Opens the DM window in the coordinator's own browser. Nothing is sent or scraped. */
export const dmUrl = (handle: string): string => `https://ig.me/m/${handle}`;

export const CREATOR_CSV_HEADERS = ["Handle", "Name", "Niche", "Followers", "City", "Rate", "Notes"] as const;