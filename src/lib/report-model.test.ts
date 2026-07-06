import { describe, expect, it } from "vitest";
import { buildReportModel, signalBasisOf, worstFreshnessRow, monthsBetween } from "./report-model";
import type {
  CapAccount, CapCategory, CapMetric, CapSource,
  HealthPoint, CategoryPoint, MetricValue, CapAlert,
  FreshnessRow, CapHealthBenchmark,
} from "@/lib/capital";

const NOW = new Date("2026-07-06T12:00:00Z");

const account: CapAccount = {
  id: "acc-1", name: "Muster GmbH", slug: "muster-gmbh", domain: "muster.de",
  vertical: "ecom", account_type: "external", consent_data_sharing: false,
  consent_at: null, status: "active", failure_month: null,
};

const catalog = {
  categories: [
    { key: "comms", name: "Kommunikation", description: null, weight: 1, display_order: 1, color: null },
    { key: "risk", name: "Risiko", description: null, weight: 1, display_order: 2, color: null },
  ] as CapCategory[],
  metrics: [
    { key: "chi", short_code: "CHI", name: "Beschwerde-Index", category_key: "comms", description: null, measures: "Beschwerde-Aufkommen", early_indicator_for: null, source_layer: "comms", is_predictive: true, weight: 1, status: "active", display_order: 1, availability: "live", connect_source: "comms_inbox" },
    { key: "rev", short_code: "REV", name: "Umsatzwachstum", category_key: "risk", description: null, measures: "Umsatz", early_indicator_for: null, source_layer: "financial", is_predictive: false, weight: 1, status: "planned", display_order: 2, availability: "planned", connect_source: "stripe" },
  ] as CapMetric[],
  sources: [
    { key: "comms_inbox", name: "Postfach", source_type: null, access: null, compliance_note: null, is_verified: true, display_order: 1 },
    { key: "stripe", name: "Stripe", source_type: null, access: null, compliance_note: null, is_verified: true, display_order: 2 },
  ] as CapSource[],
};

const health: HealthPoint[] = [
  { account_id: "acc-1", period: "2026-05-01", health_score: 80, confidence: 0.7, coverage: 0.6, is_illustrative: false },
  { account_id: "acc-1", period: "2026-06-01", health_score: 74, confidence: 0.7, coverage: 0.6, is_illustrative: false },
  { account_id: "acc-1", period: "2026-07-01", health_score: 68, confidence: 0.7, coverage: 0.65, is_illustrative: false },
];
const categories: CategoryPoint[] = [
  { account_id: "acc-1", category_key: "comms", period: "2026-07-01", category_score: 66, confidence: 0.7, coverage: 0.6, kpis_with_data: 1, is_illustrative: false },
];
const values: MetricValue[] = [
  { account_id: "acc-1", metric_key: "chi", period: "2026-07-01", value: 66, confidence: 0.7, coverage: 0.65, provenance: { method: "kemaris_8w_baseline_v1", sources_used: ["comms_inbox"] }, is_illustrative: false },
];
const freshness: FreshnessRow[] = [
  { slug: "muster-gmbh", account_type: "external", account_id: "acc-1", metric_key: "chi", source_key: "comms_inbox", last_observed_at: "2026-07-05T00:00:00Z", last_period: "2026-07-01", expected_cadence_hours: 168, staleness_ratio: 0.5, status: "fresh", suggested_confidence_penalty: 0 },
  { slug: "muster-gmbh", account_type: "external", account_id: "acc-1", metric_key: "chi", source_key: "gdelt", last_observed_at: "2026-05-01T00:00:00Z", last_period: "2026-05-01", expected_cadence_hours: 168, staleness_ratio: 3, status: "stale", suggested_confidence_penalty: 0.1 },
];
const benchmarks: CapHealthBenchmark[] = [
  { vertical: "ecom", median_health: 60, p25_health: 50, p75_health: 72, n_accounts: 5, has_illustrative: false },
];

function alertOf(over: Partial<CapAlert>): CapAlert {
  return {
    id: 1, account_id: "acc-1", scope: "health", subject_key: "health", kind: "trend_down",
    severity: "critical", severity_rank: 3, status: "open", message: "Abwärtstrend",
    window_months: 6, value_now: 68, slope: -6, projection: null, period: "2026-07-01",
    confidence: 0.7, coverage: 0.6, is_illustrative: false,
    first_detected_at: "2026-05-30T10:00:00Z", last_evaluated_at: "2026-07-05T10:00:00Z",
    ...over,
  };
}

describe("report-model (reine Aufbereitung für den Investoren-Report)", () => {
  const model = buildReportModel({
    account, catalog, health, categories, values,
    alerts: [
      alertOf({ id: 1, severity: "critical", status: "open", first_detected_at: "2026-05-30T10:00:00Z" }), // → confirmed (Monats-Roll ≥1)
      alertOf({ id: 2, severity: "warning", status: "open", first_detected_at: "2026-07-04T10:00:00Z", period: "2026-07-01" }), // → watch
      alertOf({ id: 3, severity: "critical", status: "resolved", first_detected_at: "2026-04-01T10:00:00Z" }), // → resolved
    ],
    freshness, benchmarks, tier: "external_proxy", variant: "investor", now: NOW,
  });

  it("nimmt den jüngsten Health-Stand + fallenden Slope", () => {
    expect(model.latestPeriod).toBe("2026-07-01");
    expect(model.health).toBe(68);
    expect(model.healthLabel).toBe("Beobachten");
    expect(model.slope).not.toBeNull();
    expect(model.slope!).toBeLessThan(0);
    expect(model.points).toBe(3);
  });

  it("baut Kategorien mit KPI-Drill-down (nur Kategorien mit Kennzahlen)", () => {
    // beide Katalog-Kategorien haben je 1 Metrik → beide erscheinen
    expect(model.categories.map((c) => c.category.key).sort()).toEqual(["comms", "risk"]);
    const comms = model.categories.find((c) => c.category.key === "comms")!;
    expect(comms.score).toBe(66);
    const chi = comms.kpis.find((k) => k.metric.key === "chi")!;
    expect(chi.isLive).toBe(true);
    expect(chi.value).toBe(66);
    expect(chi.sources).toEqual(["Postfach"]);
    // planned KPI ohne Wert → nicht live, ehrliches State-Label
    const rev = model.categories.find((c) => c.category.key === "risk")!.kpis.find((k) => k.metric.key === "rev")!;
    expect(rev.isLive).toBe(false);
    expect(rev.stateKind).toBe("planned");
  });

  it("teilt Alerts in Bestätigt / Beobachtung / Erledigt", () => {
    expect(model.alertsConfirmed.map((a) => a.alert.id)).toEqual([1]);
    expect(model.alertsWatch.map((a) => a.alert.id)).toEqual([2]);
    expect(model.alertsResolved.map((a) => a.alert.id)).toEqual([3]);
    expect(model.alertsConfirmed[0].quality.tier).toBe("confirmed");
  });

  it("rechnet den Sektor-Benchmark-Delta korrekt (68 − 60 = +8)", () => {
    expect(model.benchmark).not.toBeNull();
    expect(model.benchmark!.delta).toBe(8);
    expect(model.benchmark!.n).toBe(5);
  });

  it("meldet den schlechtesten Freshness-Status je Quelle", () => {
    expect(model.freshness).not.toBeNull();
    expect(model.freshness!.worst).toBe("stale");
    expect(model.freshness!.bySource.length).toBe(2);
  });

  it("weist verwendete + relevant-fehlende Quellen aus", () => {
    expect(model.sourcesUsed).toContain("Postfach");
    expect(model.sourcesMissing).toContain("Stripe");
  });

  it("führt Verifikations-Tier + Vertical-Label durch", () => {
    expect(model.verificationTier).toBe("external_proxy");
    expect(model.verticalLabel).toBe("E-Commerce");
  });

  it("kein failure_month → kein Frühwarn-Vorlauf", () => {
    expect(model.lead).toBeNull();
  });

  it("Demo-Firma mit failure_month → Vorlauf in Monaten", () => {
    const dm = buildReportModel({
      account: { ...account, failure_month: "2026-09-01", account_type: "demo" },
      catalog,
      health: [
        { account_id: "acc-1", period: "2026-03-01", health_score: 40, confidence: 0.5, coverage: 0.5, is_illustrative: true },
      ],
      categories: [], values: [], alerts: [], freshness: [], benchmarks: [], tier: "illustrative", now: NOW,
    });
    expect(dm.isIllustrative).toBe(true);
    expect(dm.firstRed).toBe("2026-03-01");
    expect(dm.lead).toBe(6); // Sep − Mär = 6 Monate
  });
});

describe("report-model helpers", () => {
  it("signalBasisOf zählt Signale mit ≥12 Monaten Historie", () => {
    const vs: MetricValue[] = [];
    for (let i = 0; i < 13; i++) vs.push({ account_id: "a", metric_key: "chi", period: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`, value: 50, confidence: null, coverage: null, provenance: {}, is_illustrative: false });
    // 13 Einträge, aber nur 12 verschiedene Monate → nSignals12 = 1
    const r = signalBasisOf(vs);
    expect(r.nSignals).toBe(1);
    expect(r.maxMonths).toBe(12);
    expect(r.nSignals12).toBe(1);
  });
  it("worstFreshnessRow bevorzugt dead > stale > no_sla > fresh", () => {
    const rows: FreshnessRow[] = [
      { slug: "x", account_type: "e", account_id: "a", metric_key: "m", source_key: "s1", last_observed_at: null, last_period: null, expected_cadence_hours: null, staleness_ratio: null, status: "fresh", suggested_confidence_penalty: null },
      { slug: "x", account_type: "e", account_id: "a", metric_key: "m", source_key: "s2", last_observed_at: null, last_period: null, expected_cadence_hours: null, staleness_ratio: null, status: "dead", suggested_confidence_penalty: null },
    ];
    expect(worstFreshnessRow(rows)!.status).toBe("dead");
    expect(worstFreshnessRow([])).toBeNull();
  });
  it("monthsBetween rechnet Jahr+Monat", () => {
    expect(monthsBetween("2026-09-01", "2026-03-01")).toBe(6);
    expect(monthsBetween("2027-01-01", "2026-11-01")).toBe(2);
  });
});
