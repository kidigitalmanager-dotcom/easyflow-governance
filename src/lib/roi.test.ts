import { describe, it, expect } from "vitest";
import {
  computeRoi, computeM5Hook, sanitizeAssumptions, DEFAULT_ASSUMPTIONS, WEEK_TO_MONTH,
  BAND_LOW, BAND_HIGH, M5_AUTO_SHARE, M5_RELEASE_MINUTES, formatHoursRange, formatMinutes,
} from "./roi";

const A = DEFAULT_ASSUMPTIONS; // draft 8, triage 1, rate 40

describe("computeRoi", () => {
  it("weekly point estimate = drafts*draftMin + emails*triageMin (resolved NOT double-counted)", () => {
    const r = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 7 }, A, "week");
    // 10*8 + 50*1 = 130 min. resolved (7) must NOT add minutes.
    expect(r.minutesPoint).toBe(130);
    expect(r.drafts).toBe(10);
    expect(r.emails).toBe(50);
    expect(r.resolved).toBe(7);
  });

  it("resolved has zero effect on the total (subset guard)", () => {
    const lo = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 0 }, A, "week");
    const hi = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 10 }, A, "week");
    expect(lo.minutesPoint).toBe(hi.minutesPoint);
  });

  it("band: low < point < high with the fixed factors", () => {
    const r = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 0 }, A, "week");
    expect(r.minutesLow).toBeCloseTo(r.minutesPoint * BAND_LOW, 6);
    expect(r.minutesHigh).toBeCloseTo(r.minutesPoint * BAND_HIGH, 6);
    expect(r.minutesLow).toBeLessThan(r.minutesPoint);
    expect(r.minutesHigh).toBeGreaterThan(r.minutesPoint);
  });

  it("euro derives from minutes and hourlyRate", () => {
    const r = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 0 }, A, "week");
    expect(r.euroPoint).toBeCloseTo((130 / 60) * 40, 6);
  });

  it("month = week * WEEK_TO_MONTH, flagged projected", () => {
    const wk = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 3 }, A, "week");
    const mo = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 3 }, A, "month");
    expect(mo.projected).toBe(true);
    expect(wk.projected).toBe(false);
    expect(mo.drafts).toBe(Math.round(10 * WEEK_TO_MONTH));
    expect(mo.emails).toBe(Math.round(50 * WEEK_TO_MONTH));
  });

  it("thin when 0 drafts and <3 emails (judged on measured week values, even in month view)", () => {
    const wk = computeRoi({ drafts_created_week: 0, emails_week: 2, resolved_week: 0 }, A, "week");
    const mo = computeRoi({ drafts_created_week: 0, emails_week: 2, resolved_week: 0 }, A, "month");
    expect(wk.thin).toBe(true);
    expect(mo.thin).toBe(true);
    expect(wk.triageOnly).toBe(false);
  });

  it("triageOnly when 0 drafts but enough emails", () => {
    const r = computeRoi({ drafts_created_week: 0, emails_week: 40, resolved_week: 0 }, A, "week");
    expect(r.thin).toBe(false);
    expect(r.triageOnly).toBe(true);
    expect(r.minutesPoint).toBe(40); // 0*8 + 40*1
  });

  it("handles missing / nullish stats safely", () => {
    const r = computeRoi(null, A, "week");
    expect(r.minutesPoint).toBe(0);
    expect(r.thin).toBe(true);
  });

  it("negative / non-finite counts are floored to 0", () => {
    const r = computeRoi({ drafts_created_week: -5 as any, emails_week: NaN as any, resolved_week: -1 as any }, A, "week");
    expect(r.drafts).toBe(0);
    expect(r.emails).toBe(0);
    expect(r.minutesPoint).toBe(0);
  });
});

describe("sanitizeAssumptions", () => {
  it("clamps out-of-range values to bounds", () => {
    const a = sanitizeAssumptions({ draftMinutes: 999, triageMinutes: -3, hourlyRate: 99999 });
    expect(a.draftMinutes).toBe(30);
    expect(a.triageMinutes).toBe(0);
    expect(a.hourlyRate).toBe(500);
  });
  it("falls back to defaults for NaN / missing", () => {
    const a = sanitizeAssumptions({ draftMinutes: NaN, hourlyRate: undefined });
    expect(a.draftMinutes).toBe(1); // NaN -> clamp min
    expect(a.hourlyRate).toBe(DEFAULT_ASSUMPTIONS.hourlyRate);
  });
});

describe("computeM5Hook", () => {
  it("scales with drafts and uses the labelled placeholder constants", () => {
    const r = computeRoi({ drafts_created_week: 10, emails_week: 0, resolved_week: 0 }, A, "week");
    const m5 = computeM5Hook(r);
    expect(m5.minutes).toBeCloseTo(10 * M5_AUTO_SHARE * M5_RELEASE_MINUTES, 6);
  });
});

describe("formatters", () => {
  it("formatMinutes", () => {
    expect(formatMinutes(45)).toBe("45 Min");
    expect(formatMinutes(60)).toBe("1 Std");
    expect(formatMinutes(130)).toBe("2 Std 10 Min");
  });
  it("formatHoursRange switches unit under 1h", () => {
    expect(formatHoursRange(20, 40)).toBe("20–40 Min");
    expect(formatHoursRange(90, 150)).toBe("1,5–2,5 Std");
  });
});
