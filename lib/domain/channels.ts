import { COLD_SIGNALS, SIGNAL_TO_BET, WARM_SIGNALS, isSignalTag } from "./signals";

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

/** Channels added for the v2 plan. The seed matrix still uses CHANNELS only. */
export const EXTRA_CHANNELS = ["peer_fest", "next_year", "creator_referral"] as const;
export type ExtraChannel = (typeof EXTRA_CHANNELS)[number];
export const LEAD_CHANNELS = [...CHANNELS, ...EXTRA_CHANNELS] as const;
export type LeadChannel = ChannelCode | ExtraChannel;

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

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  ...CHANNEL_LABELS,
  peer_fest: "Peer fest sponsor",
  next_year: "Next year",
  creator_referral: "Creator referral",
};

export const WARM_CHANNELS: ReadonlySet<ChannelCode> = new Set([
  "past_sponsors",
  "other_fest",
  "artist_linked",
  "inbound_referral",
  "institute",
]);

const EXTRA_WARM: ReadonlySet<string> = new Set(EXTRA_CHANNELS);

/** Warmth from channel and signal. Mirrors v_warmth_funnel in the database. */
export function isWarmLead(channel: string | null | undefined, signal?: string | null): boolean {
  if (signal && COLD_SIGNALS.has(signal)) return false;
  if (signal && WARM_SIGNALS.has(signal)) return true;
  if (!channel) return false;
  return WARM_CHANNELS.has(channel as ChannelCode) || EXTRA_WARM.has(channel);
}

/** Agency leads pay a 15% commission, so the forecast uses 85% of the deal. */
export const AGENCY_COMMISSION_PCT = 15;
export const AGENCY_NET_SHARE = 0.85;

export function netShare(channel: string | null | undefined, signal?: string | null): number {
  return channel === "agency" || signal === "agency" ? AGENCY_NET_SHARE : 1;
}

const CHANNEL_TO_BET: Record<string, string> = {
  peer_fest: "bet-2",
  other_fest: "bet-2",
  past_sponsors: "bet-2",
  next_year: "bet-2",
  inbound_referral: "bet-4",
  institute: "bet-4",
  creator_referral: "bet-4",
  artist_linked: "bet-5",
  cold_database: "bet-5",
  new_local: "bet-5",
  ipl_sports: "bet-5",
  csr: "bet-5",
  agency: "bet-5",
};

/** A signal, when present, decides the bet. Otherwise the channel does. */
export function channelToInitiative(channel: string, signal?: string | null): string {
  if (signal && isSignalTag(signal)) return SIGNAL_TO_BET[signal];
  return CHANNEL_TO_BET[channel] ?? "bet-5";
}