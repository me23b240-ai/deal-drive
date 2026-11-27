import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  businessDaysLeftInWeek,
  isBusinessDay,
  isoDow,
  toIstDate,
  weekEndIST,
  weekStartIST,
} from "@/lib/domain/bizdays";

const H = [{ day: "2026-12-25" }, { day: "2027-01-01" }];

describe("bizdays", () => {
  it("knows the weekday of known dates", () => {
    expect(isoDow("2026-11-27")).toBe(5);
    expect(isoDow("2026-11-28")).toBe(6);
    expect(isoDow("2026-11-29")).toBe(7);
    expect(isoDow("2026-11-30")).toBe(1);
  });

  it("flags business days", () => {
    expect(isBusinessDay("2026-11-27", H)).toBe(true);
    expect(isBusinessDay("2026-11-28", H)).toBe(false);
    expect(isBusinessDay("2026-12-25", H)).toBe(false);
  });

  it("counts 25 business days from 27 Nov to 5 Jan with two holidays", () => {
    expect(businessDaysBetween("2026-11-27", "2027-01-05", H)).toBe(25);
    expect(businessDaysBetween("2026-11-27", "2027-01-05", [])).toBe(27);
  });

  it("returns 0 for same day or reversed range", () => {
    expect(businessDaysBetween("2026-11-27", "2026-11-27", H)).toBe(0);
    expect(businessDaysBetween("2026-11-30", "2026-11-27", H)).toBe(0);
  });

  it("adds business days skipping weekends and holidays", () => {
    expect(addBusinessDays("2026-11-27", 1, H)).toBe("2026-11-30");
    expect(addBusinessDays("2026-12-24", 1, H)).toBe("2026-12-28");
    expect(addBusinessDays("2026-11-27", 0, H)).toBe("2026-11-27");
    expect(addBusinessDays("2026-11-30", 5, H)).toBe("2026-12-07");
  });

  it("computes the Monday to Sunday week", () => {
    expect(weekStartIST("2026-11-27")).toBe("2026-11-23");
    expect(weekEndIST("2026-11-27")).toBe("2026-11-29");
    expect(weekStartIST("2026-11-30")).toBe("2026-11-30");
    expect(weekStartIST("2026-11-29")).toBe("2026-11-23");
  });

  it("counts business days left in the week including today", () => {
    expect(businessDaysLeftInWeek("2026-11-23", H)).toBe(5);
    expect(businessDaysLeftInWeek("2026-11-27", H)).toBe(1);
    expect(businessDaysLeftInWeek("2026-11-28", H)).toBe(0);
  });

  it("converts timestamps to IST dates", () => {
    expect(toIstDate("2026-11-26T20:00:00Z")).toBe("2026-11-27");
    expect(toIstDate("2027-01-05")).toBe("2027-01-05");
  });
});