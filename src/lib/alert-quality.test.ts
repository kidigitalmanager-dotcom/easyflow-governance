import { describe, expect, it } from "vitest";
import { classifyAlert, monthRolls, splitAlerts } from "./alert-quality";

const NOW = new Date("2026-07-02T12:00:00Z");

describe("alert-quality (Konsumenten-Regel aus den Backtests)", () => {
  it("Monats-Roll: period Juli vs Erkennung Juni = 1", () => {
    expect(monthRolls("2026-07-01", "2026-06-30T18:00:00Z")).toBe(1);
  });
  it("bestätigt: kritisch + 1 Monats-Roll (ext_home24-Fall)", () => {
    const q = classifyAlert({ severity: "critical", status: "open", period: "2026-07-01", first_detected_at: "2026-06-30T10:00:00Z" }, NOW);
    expect(q.tier).toBe("confirmed");
    expect(q.monthRolls).toBe(1);
  });
  it("frischer critical ohne Persistenz = Beobachtung", () => {
    const q = classifyAlert({ severity: "critical", status: "open", period: "2026-07-01", first_detected_at: "2026-07-01T08:00:00Z" }, NOW);
    expect(q.tier).toBe("watch");
  });
  it("warning wird NIE bestätigt (auch mit Persistenz)", () => {
    const q = classifyAlert({ severity: "warning", status: "open", period: "2026-07-01", first_detected_at: "2026-05-01T08:00:00Z" }, NOW);
    expect(q.tier).toBe("watch");
  });
  it("Demo-Seed mit historischer period (negativer Roll) bestätigt über 28-Tage-Haltedauer", () => {
    const q = classifyAlert({ severity: "critical", status: "open", period: "2022-11-01", first_detected_at: "2026-06-01T08:00:00Z" }, NOW);
    expect(q.monthRolls).toBeLessThan(0);
    expect(q.daysHeld).toBeGreaterThanOrEqual(28);
    expect(q.tier).toBe("confirmed");
  });
  it("resolved zählt nicht als bestätigt", () => {
    const q = classifyAlert({ severity: "critical", status: "resolved", period: "2026-07-01", first_detected_at: "2026-05-01T08:00:00Z" }, NOW);
    expect(q.tier).toBe("watch");
  });
  it("splitAlerts trennt korrekt", () => {
    const a = { severity: "critical", status: "open", period: "2026-07-01", first_detected_at: "2026-06-15T08:00:00Z" };
    const b = { severity: "warning", status: "open", period: "2026-07-01", first_detected_at: "2026-06-15T08:00:00Z" };
    const { confirmed, watch } = splitAlerts([a, b], NOW);
    expect(confirmed).toHaveLength(1);
    expect(watch).toHaveLength(1);
  });
});
