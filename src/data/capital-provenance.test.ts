import { describe, it, expect } from "vitest";
import { humanizeMetricValue } from "./capital-provenance";
import type { CapMetric } from "@/lib/capital";

function metric(over: Partial<CapMetric> = {}): CapMetric {
  return {
    key: "proxy_web_presence", short_code: "WAYB", name: "Web-Präsenz (Wayback)",
    category_key: "ops", description: null, measures: "Digitale Präsenz & Archiv-Historie",
    early_indicator_for: null, source_layer: "external", is_predictive: true,
    weight: 1, status: "active", display_order: 1, ...over,
  };
}
const srcName = (k: string) => ({ wayback: "Wayback Machine", comms_inbox: "Kommunikation (Postfach)", gdelt: "GDELT (News)", greenhouse: "Greenhouse" }[k] ?? k);

describe("humanizeMetricValue — Wert-Band", () => {
  it("gesund/beobachten/kritisch/keine Daten", () => {
    expect(humanizeMetricValue(metric(), 88, { method: "external_proxy_v1", sources_used: ["wayback"] }, srcName).reason).toMatch(/grünen Bereich \(88\/100\)/);
    expect(humanizeMetricValue(metric(), 60, { method: "external_proxy_v1", sources_used: ["wayback"] }, srcName).band).toBe("beobachten");
    expect(humanizeMetricValue(metric(), 20, {}, srcName).band).toBe("kritisch");
    const none = humanizeMetricValue(metric({ status: "planned" }), null, null, srcName);
    expect(none.band).toBe("unbekannt");
    expect(none.reason).toMatch(/Noch keine Messwerte/);
  });
});

describe("humanizeMetricValue — Quellen", () => {
  it("mappt sources_used über den Katalog-Lookup", () => {
    const ex = humanizeMetricValue(metric(), 88, { method: "external_proxy_v1", sources_used: ["wayback"] }, srcName);
    expect(ex.sources).toEqual(["Wayback Machine"]);
    expect(ex.sourcesLabel).toBe("Quelle: Wayback Machine");
  });
  it("mehrere Quellen → 'Quellen: … · …'; keine → leer", () => {
    expect(humanizeMetricValue(metric(), 70, { sources_used: ["wayback", "gdelt"] }, srcName).sourcesLabel).toBe("Quellen: Wayback Machine · GDELT (News)");
    expect(humanizeMetricValue(metric(), 70, { sources_used: [] }, srcName).sourcesLabel).toBe("");
  });
});

describe("humanizeMetricValue — Methoden-Label + Technik", () => {
  it("Kemaris-Baseline: Fenster-Anreicherung aus window_weeks (top-level)", () => {
    const ex = humanizeMetricValue(
      metric({ key: "chi", name: "Customer Health Index", measures: "Beschwerde-Anteil je Kunde" }),
      74, { method: "kemaris_8w_baseline_v1", sources_used: ["comms_inbox"], window_weeks: 8 }, srcName);
    expect(ex.methodLabel).toMatch(/Kemaris/);
    expect(ex.reason).toMatch(/8-Wochen-Basislinie/);
    expect(ex.hasTechnical).toBe(true);
    expect(ex.inputPairs.find((p) => p.k === "window_weeks")?.v).toBe("8");
  });
  it("GDELT news_tone: Ton-Anreicherung aus input + formula in Details", () => {
    const ex = humanizeMetricValue(
      metric({ key: "proxy_news_tone", name: "Nachrichten-Ton", measures: "" }),
      51, { method: "gdelt_tone_v1", sources_used: ["gdelt"], formula: "clamp(60 + tone*4)", input: { avg_tone: -2.1, window_days: 30 } }, srcName);
    expect(ex.reason).toMatch(/Ø-Nachrichtenton -2\.1 über 30 Tage/);
    expect(ex.formula).toBe("clamp(60 + tone*4)");
    expect(ex.methodLabel).toMatch(/GDELT/);
  });
  it("Hiring: offene Stellen aus input", () => {
    const ex = humanizeMetricValue(
      metric({ key: "proxy_hiring", name: "Hiring-Momentum", measures: "" }),
      74, { method: "ats_hiring_v1", sources_used: ["greenhouse"], input: { open_roles: 8, trend: "steigend" } }, srcName);
    expect(ex.reason).toMatch(/8 offene Stellen, Tendenz steigend/);
    expect(ex.methodLabel).toMatch(/Karriere-Board/);
  });
  it("unbekannte Methode → prettify-Fallback, kein Absturz", () => {
    const ex = humanizeMetricValue(metric(), 80, { method: "some_new_source_v9", sources_used: ["x"] }, srcName);
    expect(ex.methodLabel).toBe("Some New Source V9");
    expect(ex.hasTechnical).toBe(true);
  });
  it("leere/kaputte provenance → keine Technik, kein Absturz", () => {
    const ex = humanizeMetricValue(metric(), 80, null, srcName);
    expect(ex.title).toBe("Web-Präsenz");
    expect(ex.hasTechnical).toBe(false);
    expect(ex.sourcesLabel).toBe("");
  });
});
