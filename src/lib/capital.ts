// Shared types + score helpers for the Capital-Layer (UseEasy Signale / Investoren).

export type CapAccount = {
  id: string; name: string; slug: string; domain: string | null;
  vertical: string | null; account_type: "demo" | "tenant";
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
