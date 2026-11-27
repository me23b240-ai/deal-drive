export const CHANNELS = [
  "past_sponsors",
  "other_fest",
  "artist_linked",
  "agency",
  "csr",
  "new_local",
  "ipl_sports",
  "institute",
  "cold_database",
  "inbound_referral",
] as const;

export type ChannelCode = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<ChannelCode, string> = {
  past_sponsors: "Past sponsors",
  other_fest: "Other fest",
  artist_linked: "Artist linked",
  agency: "Agency",
  csr: "CSR",
  new_local: "New local",
  ipl_sports: "IPL / sports",
  institute: "Institute",
  cold_database: "Cold database",
  inbound_referral: "Inbound / referral",
};

export const WARM_CHANNELS: ReadonlySet<ChannelCode> = new Set([
  "past_sponsors",
  "other_fest",
  "artist_linked",
  "inbound_referral",
  "institute",
]);

export function channelToInitiative(channel: ChannelCode): string {
  if (channel === "artist_linked") return "bet-4";
  if (
    channel === "past_sponsors" ||
    channel === "other_fest" ||
    channel === "inbound_referral" ||
    channel === "institute"
  ) {
    return "bet-3";
  }
  return "bet-5";
}
