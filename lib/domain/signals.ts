export const SIGNAL_TAGS = [
  "new_store",
  "product_launch",
  "artist_concert",
  "next_year",
  "alumni_acr",
  "dean",
  "director",
  "agency",
  "creator_referral",
  "signed_sponsor_intro",
  "peer_fest",
] as const;

export type SignalTag = (typeof SIGNAL_TAGS)[number];

export const SIGNAL_LABELS: Record<SignalTag, string> = {
  new_store: "New store opening",
  product_launch: "Product launch",
  artist_concert: "Artist or concert tie-in",
  next_year: "Asked to come back next year",
  alumni_acr: "Alumni or ACR contact",
  dean: "Dean introduction",
  director: "Director introduction",
  agency: "Agency",
  creator_referral: "Creator referral",
  signed_sponsor_intro: "Introduced by a signed sponsor",
  peer_fest: "Sponsor of a peer fest",
};

/** Signals that make a lead warm, whatever its channel. */
export const WARM_SIGNALS: ReadonlySet<string> = new Set([
  "peer_fest",
  "next_year",
  "alumni_acr",
  "dean",
  "director",
  "creator_referral",
  "signed_sponsor_intro",
]);

/** Signals that force a lead to count as other (cold), whatever its channel. */
export const COLD_SIGNALS: ReadonlySet<string> = new Set(["new_store", "product_launch", "artist_concert"]);

export const SIGNAL_TO_BET: Record<SignalTag, string> = {
  peer_fest: "bet-2",
  next_year: "bet-2",
  alumni_acr: "bet-4",
  dean: "bet-4",
  director: "bet-4",
  creator_referral: "bet-4",
  signed_sponsor_intro: "bet-4",
  new_store: "bet-5",
  product_launch: "bet-5",
  artist_concert: "bet-5",
  agency: "bet-5",
};

export function isSignalTag(value: unknown): value is SignalTag {
  return typeof value === "string" && (SIGNAL_TAGS as readonly string[]).includes(value);
}