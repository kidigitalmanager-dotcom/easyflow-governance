// ─────────────────────────────────────────────────────────────────────────────
// report-model.ts — reine Aufbereitung der Capital-Layer-Daten für den
// Investoren-Report-Export (Print/PDF). KEIN Backend-Call, KEIN DB-Touch:
// nimmt exakt die Arrays, die AccountDashboard ohnehin lädt (Health-Serie,
// Kategorie-Scores, KPI-Werte mit Provenance, Alerts, Freshness, Benchmark,
// Verifikations-Tier) und baut daraus ein flaches, druckbares Modell.
// Spiegelt die `model`-Memo aus AccountDashboard.tsx + die Alert-Qualitäts-
// Schicht (alert-quality.ts) + die Provenance-Kurzform (capital-provenance.ts).
// Rein & testbar (report-model.test.ts) — die UI (CapitalReport.tsx) rendert nur.
// ─────────────────────────────────────────────────────────────────────────────
import {
  scoreLabel, trailingSlope, verticalLabelDe, deriveKpiState,
  type CapAccount, type CapCategory, type CapMetric, type CapSource,
  type HealthPoint, type CategoryPoint, type MetricValue, type CapAlert,
  type FreshnessRow, type CapHealthBenchmark, type VerificationTierKind,
} from "@/lib/capital";
import { humanizeMetricValue, type MetricExplanation } from "@/data/capital-provenance";
import { classifyAlert, type AlertQuality } from "@/lib/alert-quality";

export type FreshnessStatus = "fresh" | "stale" | "dead" | "no_sla";
const FRESH_RANK: Record<string, number> = { dead: 3, stale: 2, no_sla: 1, fresh: 0 };

// Mirror von CapitalFreshness.worstFreshness (bewusst dupliziert, damit dieses
// Modell UI-frei und leichtgewichtig testbar bleibt).
export function worstFreshnessRow(rows: FreshnessRow[]): FreshnessRow | null {
  if (!rows.length) return null;
  return rows.reduce((w, r) => (FRESH_RANK[r.status] > FRESH_RANK[w.status] ? r : w), rows[0]);
}

// Mirror von CapitalFreshness.signalBasis: wie viele unabhängige Signale (≥12 Mo)
// tragen die Bewertung (Coverage-Gate → ehrliche "Historie im Aufbau"-Anzeige).
export function signalBasisOf(values: MetricValue[]): { nSignals12: number; nSignals: number; maxMonths: number } {
  const byMetric = new Map<string, Set<string>>();
  for (const v of values) {
    if (v.value == null) continue;
    if (!byMetric.has(v.metric_key)) byMetric.set(v.metric_key, new Set());
    byMetric.get(v.metric_key)!.add(String(v.period).slice(0, 7));
  }
  let nSignals12 = 0, maxMonths = 0;
  for (const months of byMetric.values()) {
    if (months.size >= 12) nSignals12++;
    if (months.size > maxMonths) maxMonths = months.size;
  }
  return { nSignals12, nSignals: byMetric.size, maxMonths };
}

export function monthsBetween(aIso: string, bIso: string): number {
  const [ay, am] = aIso.slice(0, 7).split("-").map(Number);
  const [by, bm] = bIso.slice(0, 7).split("-").map(Number);
  return (ay - by) * 12 + (am - bm);
}

export type ReportKpiRow = {
  metric: CapMetric; value: number | null; coverage: number | null;
  isLive: boolean; stateKind: string; stateLabel: string;
  sources: string[]; explanation: MetricExplanation; isIllustrative: boolean;
};
export type ReportCategory = { category: CapCategory; score: number | null; coverage: number | null; kpis: ReportKpiRow[] };
export type ReportAlert = { alert: CapAlert; quality: AlertQuality };
export type ReportFreshness =
  | { worst: FreshnessStatus; bySource: { source_key: string; status: string; last_observed_at: string | null }[] }
  | null;

export type ReportBenchmark = { median: number | null; p25: number | null; p75: number | null; n: number; delta: number | null };

export type ReportModel = {
  account: CapAccount; verticalLabel: string;
  latestPeriod: string | null; health: number | null; healthLabel: string;
  coverage: number | null; confidence: number | null; slope: number | null; points: number;
  isIllustrative: boolean;
  verificationTier: VerificationTierKind | null;
  freshness: ReportFreshness;
  signal: { nSignals12: number; nSignals: number; maxMonths: number };
  categories: ReportCategory[];
  alertsConfirmed: ReportAlert[]; alertsWatch: ReportAlert[]; alertsResolved: ReportAlert[];
  benchmark: ReportBenchmark | null;
  healthSeries: { period: string; v: number | null }[];
  sourcesUsed: string[]; sourcesMissing: string[];
  lead: number | null; firstRed: string | null;
};

export type BuildReportInput = {
  account: CapAccount;
  catalog: { categories: CapCategory[]; metrics: CapMetric[]; sources: CapSource[] } | undefined;
  health: HealthPoint[]; categories: CategoryPoint[]; values: MetricValue[];
  alerts: CapAlert[]; freshness: FreshnessRow[];
  benchmarks: CapHealthBenchmark[]; tier: VerificationTierKind | null;
  variant?: "tenant" | "investor";
  now?: Date;
};

// Quellen, deren Fehlen wir im Report ehrlich als "noch nicht verbunden" ausweisen
// (identisch zu AccountDashboard.model.missing).
const MISSING_SOURCE_KEYS = ["comms_inbox", "stripe", "shopify", "insolvenz", "handelsregister", "bank_psp"];

function alertQuality(a: CapAlert, now: Date): AlertQuality {
  return classifyAlert(
    { severity: a.severity, status: a.status, period: a.period, first_detected_at: a.first_detected_at, last_evaluated_at: a.last_evaluated_at },
    now,
  );
}

export function buildReportModel(input: BuildReportInput): ReportModel {
  const { account, catalog, health, categories, values, alerts, freshness, benchmarks, tier } = input;
  const variant = input.variant ?? "investor";
  const now = input.now ?? new Date();

  const cats = catalog?.categories ?? [];
  const metrics = catalog?.metrics ?? [];
  const sources = catalog?.sources ?? [];
  const sourceName = (k: string) => sources.find((s) => s.key === k)?.name ?? k;

  const hs = health;
  const latestPeriod = hs.length ? hs[hs.length - 1].period : null;
  const latestHealth = hs.length ? hs[hs.length - 1] : null;
  const slope = trailingSlope(hs.map((h) => h.health_score));

  const scoreByKey: Record<string, { score: number | null; coverage: number | null }> = {};
  categories.filter((c) => c.period === latestPeriod).forEach((c) => { scoreByKey[c.category_key] = { score: c.category_score, coverage: c.coverage }; });

  const latestByMetric: Record<string, MetricValue> = {};
  values.filter((v) => v.period === latestPeriod).forEach((v) => { latestByMetric[v.metric_key] = v; });

  // Quellen: verwendet vs. (relevant, aber) fehlend — spiegelt ProvenancePanel.
  const used = new Set<string>();
  Object.values(latestByMetric).forEach((v) => ((v.provenance?.sources_used ?? []) as string[]).forEach((s) => used.add(s)));
  const sourcesUsed = Array.from(used).map(sourceName);
  const sourcesMissing = sources.filter((s) => !used.has(s.key) && MISSING_SOURCE_KEYS.includes(s.key)).map((s) => s.name);

  // Kategorien + KPI-Drill-down (nur Kategorien mit Kennzahlen).
  const reportCategories: ReportCategory[] = cats
    .map((c): ReportCategory => {
      const sc = scoreByKey[c.key] ?? { score: null, coverage: null };
      const catMetrics = metrics.filter((m) => m.category_key === c.key);
      const kpis: ReportKpiRow[] = catMetrics.map((m) => {
        const v = latestByMetric[m.key];
        const val = v?.value ?? null;
        const st = deriveKpiState(m, val != null, variant);
        const usedS: string[] = ((v?.provenance?.sources_used ?? []) as string[]).map(sourceName);
        return {
          metric: m, value: val, coverage: v?.coverage ?? null,
          isLive: st.kind === "live", stateKind: st.kind, stateLabel: st.label,
          sources: usedS, explanation: humanizeMetricValue(m, val, v?.provenance, sourceName),
          isIllustrative: !!v?.is_illustrative,
        };
      });
      return { category: c, score: sc.score, coverage: sc.coverage, kpis };
    })
    .filter((rc) => rc.kpis.length > 0);

  // Alerts: offen → Bestätigt/Beobachtung (Debounce), plus erledigte separat.
  const alertsConfirmed: ReportAlert[] = [];
  const alertsWatch: ReportAlert[] = [];
  const alertsResolved: ReportAlert[] = [];
  for (const a of alerts) {
    const q = alertQuality(a, now);
    if (a.status === "resolved") alertsResolved.push({ alert: a, quality: q });
    else if (q.tier === "confirmed") alertsConfirmed.push({ alert: a, quality: q });
    else alertsWatch.push({ alert: a, quality: q });
  }

  // Sektor-Benchmark (nur bei ≥2 sichtbaren Firmen belastbar).
  const bm = benchmarks.find((b) => b.vertical === account.vertical) ?? null;
  const hVal = latestHealth?.health_score ?? null;
  const benchmark: ReportBenchmark | null =
    bm && bm.n_accounts >= 2 && hVal != null && bm.median_health != null
      ? { median: bm.median_health, p25: bm.p25_health, p75: bm.p75_health, n: bm.n_accounts, delta: Math.round((hVal - bm.median_health) * 10) / 10 }
      : null;

  // Freshness (advisory) — schlechtester Status je Quelle.
  const worst = worstFreshnessRow(freshness);
  const bySource = new Map<string, FreshnessRow>();
  for (const r of freshness) {
    const prev = bySource.get(r.source_key);
    if (!prev || FRESH_RANK[r.status] > FRESH_RANK[prev.status]) bySource.set(r.source_key, r);
  }
  const freshnessModel: ReportFreshness = worst
    ? { worst: worst.status as FreshnessStatus, bySource: Array.from(bySource.values()).map((r) => ({ source_key: r.source_key, status: r.status, last_observed_at: r.last_observed_at })) }
    : null;

  // Frühwarn-Vorlauf (nur Demo-Firmen mit failure_month).
  let lead: number | null = null;
  let firstRed: string | null = null;
  if (account.failure_month) {
    const fr = hs.find((h) => h.health_score != null && (h.health_score as number) < 50);
    if (fr) { firstRed = fr.period; lead = monthsBetween(account.failure_month, fr.period); }
  }

  return {
    account,
    verticalLabel: verticalLabelDe(account.vertical),
    latestPeriod,
    health: hVal,
    healthLabel: scoreLabel(hVal),
    coverage: latestHealth?.coverage ?? null,
    confidence: latestHealth?.confidence ?? null,
    slope,
    points: hs.length,
    isIllustrative: !!latestHealth?.is_illustrative,
    verificationTier: tier,
    freshness: freshnessModel,
    signal: signalBasisOf(values),
    categories: reportCategories,
    alertsConfirmed, alertsWatch, alertsResolved,
    benchmark,
    healthSeries: hs.map((h) => ({ period: h.period, v: h.health_score })),
    sourcesUsed, sourcesMissing,
    lead, firstRed,
  };
}
