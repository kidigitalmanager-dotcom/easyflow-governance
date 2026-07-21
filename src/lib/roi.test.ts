import { describe, it, expect } from "vitest";
import {
  computeRoi, computeRoiFromCounts, computeM5Hook, sanitizeAssumptions, DEFAULT_ASSUMPTIONS,
  WEEK_TO_MONTH, BAND_LOW, BAND_HIGH, M5_AUTO_SHARE, M5_RELEASE_MINUTES,
  formatHoursRange, formatMinutes, migrateV2Assumptions,
} from "./roi";

const A = DEFAULT_ASSUMPTIONS; // draft 8, triage 2, deadline 15, rate 60 (Methode 21.07.2026)

describe("computeRoiFromCounts (measured path)", () => {
  it("point = drafts*8 + emails*2 + deadlines*15 (resolved NOT counted)", () => {
    const r = computeRoiFromCounts(
      { drafts_prepared: 10, resolved: 7, emails_triaged: 50, deadlines_caught: 2 },
      A, { period: "week", measured: true },
    );
    expect(r.minutesPoint).toBe(10 * 8 + 50 * 2 + 2 * 15); // 210
    expect(r.deadlines).toBe(2);
    expect(r.resolved).toBe(7);
    expect(r.measured).toBe(true);
    expect(r.projected).toBe(false);
  });

  it("resolved has zero effect on the total", () => {
    const lo = computeRoiFromCounts({ drafts_prepared: 10, resolved: 0, emails_triaged: 50, deadlines_caught: 0 }, A, { period: "week" });
    const hi = computeRoiFromCounts({ drafts_prepared: 10, resolved: 99, emails_triaged: 50, deadlines_caught: 0 }, A, { period: "week" });
    expect(lo.minutesPoint).toBe(hi.minutesPoint);
  });

  it("measured month is NOT projected (real endpoint data)", () => {
    const r = computeRoiFromCounts({ drafts_prepared: 40, resolved: 10, emails_triaged: 200, deadlines_caught: 5 }, A, { period: "month", measured: true });
    expect(r.projected).toBe(false);
    expect(r.measured).toBe(true);
    expect(r.drafts).toBe(40); // no scaling
  });

  it("band low<point<high", () => {
    const r = computeRoiFromCounts({ drafts_prepared: 10, resolved: 0, emails_triaged: 50, deadlines_caught: 0 }, A, { period: "week" });
    expect(r.minutesLow).toBeCloseTo(r.minutesPoint * BAND_LOW, 6);
    expect(r.minutesHigh).toBeCloseTo(r.minutesPoint * BAND_HIGH, 6);
  });

  it("thin considers deadlines too (0 drafts, <3 emails, 0 deadlines)", () => {
    expect(computeRoiFromCounts({ drafts_prepared: 0, resolved: 0, emails_triaged: 2, deadlines_caught: 0 }, A, { period: "week" }).thin).toBe(true);
    // a caught deadline alone lifts it out of thin
    const d = computeRoiFromCounts({ drafts_prepared: 0, resolved: 0, emails_triaged: 2, deadlines_caught: 1 }, A, { period: "week" });
    expect(d.thin).toBe(false);
    expect(d.triageOnly).toBe(true);
    expect(d.minutesPoint).toBe(2 * 2 + 1 * 15);
  });

  it("scale applies to counts but not to thin/triage decision", () => {
    const r = computeRoiFromCounts({ drafts_prepared: 0, resolved: 0, emails_triaged: 2, deadlines_caught: 0 }, A, { period: "month", projected: true, scale: WEEK_TO_MONTH });
    expect(r.thin).toBe(true); // judged on measured base (2 < 3)
  });

  it("NaN / negative counts floored to 0", () => {
    const r = computeRoiFromCounts({ drafts_prepared: -5, emails_triaged: NaN as any, deadlines_caught: -1, resolved: -9 }, A, { period: "week" });
    expect(r.drafts).toBe(0);
    expect(r.emails).toBe(0);
    expect(r.deadlines).toBe(0);
    expect(r.minutesPoint).toBe(0);
  });
});

describe("computeRoi (fallback path from /stats)", () => {
  it("week measured, deadlines 0", () => {
    const r = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 7 }, A, "week");
    expect(r.minutesPoint).toBe(180); // 10*8 + 50*2 (+0 deadlines)
    expect(r.deadlines).toBe(0);
    expect(r.projected).toBe(false);
    expect(r.measured).toBe(false);
  });
  it("month = week * WEEK_TO_MONTH, flagged projected", () => {
    const mo = computeRoi({ drafts_created_week: 10, emails_week: 50, resolved_week: 3 }, A, "month");
    expect(mo.projected).toBe(true);
    expect(mo.drafts).toBe(Math.round(10 * WEEK_TO_MONTH));
  });
  it("thin judged on measured week even in month view", () => {
    expect(computeRoi({ drafts_created_week: 0, emails_week: 2, resolved_week: 0 }, A, "month").thin).toBe(true);
  });
  it("null-safe", () => {
    const r = computeRoi(null, A, "week");
    expect(r.minutesPoint).toBe(0);
    expect(r.thin).toBe(true);
  });
});

describe("sanitizeAssumptions", () => {
  it("clamps out-of-range incl. deadlineMinutes", () => {
    const a = sanitizeAssumptions({ draftMinutes: 999, triageMinutes: -3, deadlineMinutes: 9999, hourlyRate: 99999 });
    expect(a.draftMinutes).toBe(30);
    expect(a.triageMinutes).toBe(0);
    expect(a.deadlineMinutes).toBe(120);
    expect(a.hourlyRate).toBe(500);
  });
  it("defaults for NaN / missing", () => {
    const a = sanitizeAssumptions({ deadlineMinutes: NaN });
    expect(a.deadlineMinutes).toBe(1); // NaN -> clamp min
    expect(a.draftMinutes).toBe(DEFAULT_ASSUMPTIONS.draftMinutes);
  });
});

describe("computeM5Hook", () => {
  it("scales with drafts", () => {
    const r = computeRoiFromCounts({ drafts_prepared: 10, resolved: 0, emails_triaged: 0, deadlines_caught: 0 }, A, { period: "week" });
    expect(computeM5Hook(r).minutes).toBeCloseTo(10 * M5_AUTO_SHARE * M5_RELEASE_MINUTES, 6);
  });
});

describe("Methode 21.07.2026 (Addendum): Defaults identisch zu Pitch-Demo/demo-jana", () => {
  it("8 Min Entwurf, 2 Min Triage, 15 Min Frist, 60 EUR/Std", () => {
    expect(DEFAULT_ASSUMPTIONS).toEqual({ draftMinutes: 8, triageMinutes: 2, deadlineMinutes: 15, hourlyRate: 60 });
  });
  it("v2-Migration: unangetastete v2-Defaults -> neue Defaults, bewusste Overrides bleiben", () => {
    expect(migrateV2Assumptions({ draftMinutes: 8, triageMinutes: 1, deadlineMinutes: 15, hourlyRate: 40 }))
      .toEqual(DEFAULT_ASSUMPTIONS);
    expect(migrateV2Assumptions({ draftMinutes: 12, triageMinutes: 1, deadlineMinutes: 20, hourlyRate: 40 }))
      .toEqual({ draftMinutes: 12, triageMinutes: 2, deadlineMinutes: 20, hourlyRate: 60 });
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
