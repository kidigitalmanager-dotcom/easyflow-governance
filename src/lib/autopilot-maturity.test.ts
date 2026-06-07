import { describe, it, expect } from "vitest";
import {
  MIN_SAMPLES,
  computeGates,
  maturityStatus,
  nextMode,
  toNum,
} from "./autopilot-maturity";

describe("nextMode", () => {
  it("shadow → assisted → autonomous → null", () => {
    expect(nextMode("shadow")).toBe("assisted");
    expect(nextMode("assisted")).toBe("autonomous");
    expect(nextMode("autonomous")).toBeNull();
  });
  it("unbekannt/leer → konservativ assisted (wie shadow)", () => {
    expect(nextMode(undefined)).toBe("assisted");
    expect(nextMode("")).toBe("assisted");
  });
});

describe("toNum — pg-numeric als String", () => {
  it("koerziert Strings, lässt null/ungültig als null", () => {
    expect(toNum("0.031")).toBeCloseTo(0.031);
    expect(toNum(12)).toBe(12);
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum("")).toBeNull();
    expect(toNum("abc")).toBeNull();
  });
});

describe("computeGates", () => {
  it("Samples-Balken: 0, teilweise, voll", () => {
    expect(computeGates({ sample_count: 0 })[0]).toMatchObject({ pct: 0, status: "pending", valueText: `0 / ${MIN_SAMPLES}` });
    expect(computeGates({ sample_count: 200 })[0]).toMatchObject({ pct: 50, status: "pending" });
    expect(computeGates({ sample_count: 400 })[0]).toMatchObject({ pct: 100, status: "pass" });
    expect(computeGates({ sample_count: 999 })[0].pct).toBe(100);
  });
  it("Raten-Gates: pass/fail/pending (null = noch keine Messung)", () => {
    const g = computeGates({ sample_count: 10, shadow_mismatch_rate: 0.031, edit_rate: null });
    expect(g[1].status).toBe("pass");
    expect(g[1].valueText).toContain("3,1");
    expect(g[2].status).toBe("pending");
    expect(g[2].valueText).toBe("—");
  });
  it("Grenzwerte: exakt 5 % / 10 % sind PASS, knapp darüber FAIL", () => {
    const ok = computeGates({ shadow_mismatch_rate: 0.05, edit_rate: 0.1 });
    expect(ok[1].status).toBe("pass");
    expect(ok[2].status).toBe("pass");
    const bad = computeGates({ shadow_mismatch_rate: 0.051, edit_rate: "0.11" });
    expect(bad[1].status).toBe("fail");
    expect(bad[2].status).toBe("fail");
  });
});

describe("maturityStatus", () => {
  it("keine Row → no_data", () => {
    expect(maturityStatus(null).kind).toBe("no_data");
    expect(maturityStatus(undefined).kind).toBe("no_data");
  });
  it("autonomous → max (auch wenn Flags gesetzt sind)", () => {
    expect(maturityStatus({ mode: "autonomous", promotion_ready: true }).kind).toBe("max");
  });
  it("promotion_requested gewinnt vor ready", () => {
    const s = maturityStatus({ mode: "shadow", promotion_ready: true, promotion_requested: true, promotion_requested_at: "2026-06-01T10:00:00Z" });
    expect(s.kind).toBe("requested");
    expect(s.detail).toContain("1.6.2026");
  });
  it("promotion_ready → ready", () => {
    expect(maturityStatus({ mode: "shadow", promotion_ready: true }).kind).toBe("ready");
  });
  it("Samples unvollständig → collecting mit Rest-Zahl", () => {
    const s = maturityStatus({ mode: "shadow", sample_count: 150 });
    expect(s.kind).toBe("collecting");
    expect(s.label).toContain("250");
  });
  it("Samples voll + Gate gerissen → quality mit Detail", () => {
    const s = maturityStatus({ mode: "shadow", sample_count: 400, shadow_mismatch_rate: 0.2, edit_rate: 0.02 });
    expect(s.kind).toBe("quality");
    expect(s.detail).toContain("Abweichung");
  });
  it("Samples voll + alles im Limit, aber nightly noch nicht gelaufen → eval_pending", () => {
    const s = maturityStatus({ mode: "shadow", sample_count: 400, shadow_mismatch_rate: 0.01, edit_rate: 0.05 });
    expect(s.kind).toBe("eval_pending");
  });
  it("sample_count als String (pg-numeric) wird korrekt gerechnet", () => {
    const s = maturityStatus({ mode: "shadow", sample_count: "390" });
    expect(s.kind).toBe("collecting");
    expect(s.label).toContain("10");
  });
});
