import { describe, expect, it } from "vitest";
import {
  AGENCY_NET_SHARE,
  CHANNELS,
  WARM_CHANNELS,
  channelToInitiative,
  isWarmLead,
  netShare,
} from "@/lib/domain/channels";
import { SIGNAL_TAGS, SIGNAL_TO_BET, isSignalTag } from "@/lib/domain/signals";

describe("channelToInitiative", () => {
  it("maps channels to bets", () => {
    for (const c of ["peer_fest", "other_fest", "past_sponsors", "next_year"]) expect(channelToInitiative(c)).toBe("bet-2");
    for (const c of ["inbound_referral", "institute", "creator_referral"]) expect(channelToInitiative(c)).toBe("bet-4");
    for (const c of ["cold_database", "new_local", "ipl_sports", "csr", "agency", "artist_linked"]) expect(channelToInitiative(c)).toBe("bet-5");
  });
  it("lets a signal decide the bet", () => {
    for (const s of ["alumni_acr", "dean", "director", "creator_referral", "signed_sponsor_intro"]) expect(channelToInitiative("cold_database", s)).toBe("bet-4");
    for (const s of ["new_store", "product_launch", "artist_concert", "agency"]) expect(channelToInitiative("past_sponsors", s)).toBe("bet-5");
    for (const s of ["peer_fest", "next_year"]) expect(channelToInitiative("cold_database", s)).toBe("bet-2");
  });
  it("maps every channel and signal to one of the five bets", () => {
    for (const c of CHANNELS) expect(channelToInitiative(c)).toMatch(/^bet-[1-5]$/);
    for (const s of SIGNAL_TAGS) expect(SIGNAL_TO_BET[s]).toMatch(/^bet-[1-5]$/);
    expect(channelToInitiative("something_new")).toBe("bet-5");
    expect(channelToInitiative("cold_database", "not_a_signal")).toBe("bet-5");
  });
  it("validates signal tags", () => {
    expect(isSignalTag("dean")).toBe(true);
    expect(isSignalTag("nope")).toBe(false);
    expect(isSignalTag(null)).toBe(false);
  });
});

describe("warmth", () => {
  it("keeps the channel based warm set", () => {
    for (const c of CHANNELS) expect(isWarmLead(c)).toBe(WARM_CHANNELS.has(c));
    expect(isWarmLead("peer_fest")).toBe(true);
    expect(isWarmLead(null)).toBe(false);
  });
  it("makes signals decide warmth", () => {
    for (const s of ["peer_fest", "next_year", "alumni_acr", "dean", "director", "creator_referral", "signed_sponsor_intro"]) {
      expect(isWarmLead("cold_database", s)).toBe(true);
    }
    for (const s of ["new_store", "product_launch", "artist_concert"]) expect(isWarmLead("past_sponsors", s)).toBe(false);
  });
});

describe("agency net share", () => {
  it("is 85% for agency leads and 100% otherwise", () => {
    expect(netShare("agency")).toBe(AGENCY_NET_SHARE);
    expect(netShare("cold_database", "agency")).toBe(0.85);
    expect(netShare("past_sponsors")).toBe(1);
  });
});