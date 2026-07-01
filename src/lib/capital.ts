// Shared types + score helpers for the Capital-Layer (UseEasy Signale / Investoren).

export type CapAccount = {
  id: string; name: string; slug: string; domain: string | null;
  vertical: string | null; account_type: "demo" | "tenant" | "external";
  consent_data_sharing: boolean; consent_at: string | null;
  status: string; failure_month: string | null;
};
export type CapCategory = {
  key: string; name: string; description: string | null;
  weight: number; display_order: number; color: string | null;
};
export type CapMetric = {
  key: string; short_code: string | null; name: string; category_key: string | null;
  description: string | null; measures: string | null; early_indicator_for: string | null;
  source_layer: string; is_predictive: boolean; weight: number; status: string; display_order: number;
};
export type CapSource = {
  key: string; name: string; source_type: string | null; access: string | null;
  compliance_note: string | null; is_verified: boolean; display_order: number;
};
export type HealthPoint = {
  account_id: string; period: string; health_score: number | null;
  confidence: number | null; coverage: number | null; is_illustrative: boolean;
};
export type CategoryPoint = {
  account_id: string; category_key: string; period: string; category_score: number | null;
  confidence: number | null; coverage: number | null; kpis_with_data: number; is_illustrative: boolean;
};
export type MetricValue = {
  account_id: string; metric_key: string; period: string; value: number | null;
  confidence: number | null; coverage: number | null; provenance: any; is_illustrative: boolean;
};

export const RED_THRESHOLD = 50;

export function scoreColor(v: number | null | undefined): string {
  if (v == null) return "#5A6473";
  if (v >= 70) return "#10b981"; // emerald — gesund
  if (v >= RED_THRESHOLD) return "#E8A33D"; // amber — beobachten
  return "#C0392B"; // red — kritisch
}
export function scoreLabel(v: number | null | undefined): string {
  if (v == null) return "Keine Daten";
  if (v >= 70) return "Gesund";
  if (v >= RED_THRESHOLD) return "Beobachten";
  return "Kritisch";
}
export function fmtPct(x: number | null | undefined): string {
  return x == null ? "–" : Math.round(x * 100) + "%";
}
export function fmtMonth(p: string | null | undefined): string {
  return p ? p.slice(0, 7) : "";
}

// Vertical / Branche → deutsches Label (Markt-Index-Filter + Karten).
export function verticalLabelDe(v?: string | null): string {
  if (!v) return "";
  const m: Record<string, string> = {
    ecom: "E-Commerce", finance: "Finanzen", insurance: "Versicherung",
    real_estate: "Immobilien", b2b_sales: "B2B-Vertrieb", saas: "SaaS",
    bau: "Bau", platform: "Plattform", global: "Allgemein",
  };
  return m[v] ?? v;
}

// ── Forecast / alerts (Step 1) ───────────────────────────────────────────────
export type AlertKind = "trend_down" | "anomaly" | "threshold_breach" | "distress_risk";
export type AlertSeverity = "info" | "warning" | "critical";

export type CapAlert = {
  id: number; account_id: string; account_slug?: string; account_name?: string;
  vertical?: string | null; account_type?: string; failure_month?: string | null;
  scope: "health" | "category" | "metric"; subject_key: string; kind: AlertKind;
  severity: AlertSeverity; severity_rank: number; status: "open" | "resolved";
  message: string; window_months: number | null; value_now: number | null; slope: number | null;
  projection: { horizon_months?: number; projected_value?: number; cross_level?: number; months_to_cross?: number | null; note?: string } | null;
  period: string; confidence: number | null; coverage: number | null; is_illustrative: boolean;
  first_detected_at: string; last_evaluated_at: string;
};

export type CapHealthBenchmark = {
  vertical: string; median_health: number | null; p25_health: number | null; p75_health: number | null;
  n_accounts: number; has_illustrative: boolean;
};
export type CapCategoryBenchmark = {
  vertical: string; category_key: string; median_score: number | null; p25_score: number | null; p75_score: number | null; n_accounts: number;
};

export const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  distress_risk: "Distress-Risiko",
  threshold_breach: "Rot-Schwelle",
  trend_down: "Abwärtstrend",
  anomaly: "Einbruch",
};
export function severityColor(s: AlertSeverity | undefined): string {
  if (s === "critical") return "#C0392B";
  if (s === "warning") return "#E8A33D";
  return "#5A6473";
}

// trailing least-squares slope over the last `window` numeric points (per month).
export function trailingSlope(values: (number | null | undefined)[], window = 6): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).slice(-window);
  if (v.length < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < v.length; i++) { sx += i; sy += v[i]; sxx += i * i; sxy += i * v[i]; }
  const d = v.length * sxx - sx * sx;
  return d === 0 ? null : (v.length * sxy - sx * sy) / d;
}

export type RiskDir = "rising" | "stable" | "falling" | "unknown";
export function riskFromSlope(slope: number | null, points = 99): { dir: RiskDir; label: string; color: string } {
  if (slope == null || points < 3) return { dir: "unknown", label: "—", color: "#5A6473" };
  if (slope <= -1.0) return { dir: "falling", label: "Fallend", color: "#C0392B" };
  if (slope >= 1.0) return { dir: "rising", label: "Steigend", color: "#10b981" };
  return { dir: "stable", label: "Stabil", color: "#E8A33D" };
}
