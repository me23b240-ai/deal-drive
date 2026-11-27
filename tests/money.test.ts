import { describe, expect, it } from "vitest";
import { formatInr, formatLakh, parseInr } from "@/lib/domain/money";

const R = "\u20B9";

describe("money", () => {
  it("groups in the Indian system", () => {
    expect(formatInr(3700000)).toBe(`${R}37,00,000`);
    expect(formatInr(742500)).toBe(`${R}7,42,500`);
    expect(formatInr(950)).toBe(`${R}950`);
    expect(formatInr(-1500)).toBe(`-${R}1,500`);
    expect(formatInr(null)).toBe("-");
  });

  it("formats lakh", () => {
    expect(formatLakh(2207500)).toBe(`${R}22.1L`);
    expect(formatLakh(1490063)).toBe(`${R}14.9L`);
  });

  it("parses input", () => {
    expect(parseInr(`${R}1,25,000`)).toBe(125000);
    expect(parseInr("2.5L")).toBe(250000);
    expect(parseInr("abc")).toBeNull();
  });
});