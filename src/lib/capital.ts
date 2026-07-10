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
  // Additive Katalog-Metadaten (KEIN Rollup-Impact) — steuern das ehrliche KPI-Status-Label.
  connect_source?: string | null;                                  // stripe|shopify|bank|maesn|hubspot|…
  availability?: "live" | "connectable" | "building" | "planned" | null;
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

// ── Ehrlichkeits-Gate: ist der Score als Urteil belastbar? ───────────────
// Ein roter Score bzw. Score 0 darf nur dann als "Kritisch" gelten, wenn die
// Datenlage frisch und breit genug ist. Bei toten/veralteten Quellen, unter
// einem Coverage-Minimum oder bei zu kurzer Historie zeigen wir stattdessen
// "Eingeschränkt bewertbar" (grau, kein Score), damit fehlende Daten nie als
// echter Distress erscheinen (Investor-Rangliste + eigener Health).
export const COVERAGE_FLOOR_FOR_VERDICT = 0.4;   // unter 40 % Coverage = zu dünn
export const MIN_MONTHS_FOR_VERDICT = 3;         // unter 3 Monatswerten = Historie im Aufbau

export type HonestScoreKind = "healthy" | "watch" | "critical" | "limited" | "nodata";
export type HonestScore = { limited: boolean; kind: HonestScoreKind; label: string; color: string; hint: string | null };
export function honestScore(inp: {
  score: number | null | undefined;
  coverage?: number | null;
  worstFreshness?: "fresh" | "stale" | "dead" | "none" | "no_sla" | null;
  verificationTier?: VerificationTierKind | null;
  historyMonths?: number | null;
}): HonestScore {
  const { score } = inp;
  if (score == null) return { limited: false, kind: "nodata", label: "Keine Daten", color: "#5A6473", hint: null };
  const staleSource = inp.worstFreshness === "dead" || inp.worstFreshness === "stale";
  const staleTier = inp.verificationTier === "first_party_stale";
  const thinCoverage = inp.coverage != null && inp.coverage < COVERAGE_FLOOR_FOR_VERDICT;
  const thinHistory = inp.historyMonths != null && inp.historyMonths < MIN_MONTHS_FOR_VERDICT;
  if (staleSource || staleTier || thinCoverage || thinHistory) {
    const hint = staleSource || staleTier
      ? "Datenquelle liefert aktuell keine frischen Werte, der Score ist noch nicht belastbar."
      : thinHistory
        ? "Historie im Aufbau (unter " + MIN_MONTHS_FOR_VERDICT + " Monaten), der Score ist noch nicht belastbar."
        : "Datenlage noch zu dünn (Coverage unter " + Math.round(COVERAGE_FLOOR_FOR_VERDICT * 100) + " %), der Score ist noch nicht belastbar.";
    return { limited: true, kind: "limited", label: "Eingeschränkt bewertbar", color: "#5A6473", hint };
  }
  return { limited: false, kind: score >= 70 ? "healthy" : score >= RED_THRESHOLD ? "watch" : "critical", label: scoreLabel(score), color: scoreColor(score), hint: null };
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

export type FreshnessRow = {
  slug: string;
  account_type: string;
  account_id: string;
  metric_key: string;
  source_key: string;
  last_observed_at: string | null;
  last_period: string | null;
  expected_cadence_hours: number | null;
  staleness_ratio: number | null;
  status: "fresh" | "stale" | "dead" | "no_sla";
  suggested_confidence_penalty: number | null;
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

// ── KPI-Status-Taxonomie (ehrliche 4 Zustände statt binär "geplant") ──────────
// Ersetzt das alte `status==='planned' || !value` → das warf "wirklich geplant",
// "aktiv aber (noch) kein Wert" und "Connector gebaut, nicht verbunden" in einen Topf.
export type KpiStateKind = "live" | "collecting" | "unconnected" | "planned" | "nodata";
export type KpiState = {
  kind: KpiStateKind;
  label: string;               // Kurztext für die Zelle ("" bei live → Score wird gerendert)
  connectSource: string | null; // Quelle/Connector (für Deep-Link bzw. "braucht: X")
  linkable: boolean;            // nur Kunden-Ansicht + Connector, der eine Karte in /signale hat
};

// Presentation-Label je Connector-Key (Machine-Key steht in cap_metrics.connect_source).
export const CONNECT_SOURCE_LABEL: Record<string, string> = {
  stripe: "Stripe", shopify: "Shopify", bank: "Bank-Konto (finAPI)", maesn: "Buchhaltung (Maesn)",
  hubspot: "HubSpot", einvoice: "E-Rechnungen", comms_inbox: "Postfach", trustpilot: "Trustpilot",
  meta_ads: "Meta Ads", survey: "Umfrage-Tool", ticketing: "Ticketing-System",
  logistics: "Versand/Logistik", crm_targets: "Vertriebsziele", insolvency_feed: "Insolvenz-Feed",
};
// Connectoren mit einer Connect-Karte in der /signale-Datenquellen-Sub-Sidebar → Deep-Link möglich.
export const CONNECTABLE_IN_SIGNALE = new Set(["stripe", "shopify", "bank", "maesn", "hubspot", "meta_ads", "ticketing"]);

export function connectSourceLabel(cs: string | null | undefined): string | null {
  if (!cs) return null;
  return CONNECT_SOURCE_LABEL[cs] ?? cs;
}

// Leitet den ehrlichen Anzeige-Zustand einer KPI für EIN Konto ab.
// variant "tenant" = eigene /signale-Ansicht (kann handeln → Deep-Links); "investor" = /investoren.
export function deriveKpiState(
  metric: Pick<CapMetric, "status" | "availability" | "connect_source">,
  hasValue: boolean,
  variant: "tenant" | "investor" = "investor",
): KpiState {
  const active = metric.status === "active";
  const avail = metric.availability ?? (active ? "live" : "planned");
  const cs = metric.connect_source ?? null;

  // Validierter, aktiver Wert → echter Score.
  if (active && hasValue) return { kind: "live", label: "", connectSource: cs, linkable: false };
  // Wert vorhanden, Metrik aber (noch) nicht 'active' (z.B. dünnes Portal → 0) → Rohwert NICHT als Score zeigen.
  if (hasValue) return { kind: "collecting", label: "wird erhoben", connectSource: cs, linkable: false };

  // Ab hier: kein Wert.
  if (avail === "connectable") {
    if (variant === "tenant") {
      return { kind: "unconnected", label: "nicht verbunden", connectSource: cs, linkable: !!cs && CONNECTABLE_IN_SIGNALE.has(cs) };
    }
    return { kind: "nodata", label: "—", connectSource: cs, linkable: false };
  }
  if (avail === "planned") {
    const csl = connectSourceLabel(cs);
    return { kind: "planned", label: csl ? `geplant · braucht ${csl}` : "geplant", connectSource: cs, linkable: false };
  }
  // building | live, aber (für dieses Konto) noch kein Wert.
  if (variant === "tenant") return { kind: "collecting", label: "wird erhoben", connectSource: cs, linkable: false };
  return { kind: "nodata", label: "—", connectSource: cs, linkable: false };
}


// ── Verifikations-Tier (P1 BP1.2): "offiziell bestätigt (First-Party)" vs "extern (Proxy)" ──
export type VerificationTierKind =
  | "first_party_verified" | "first_party_partial" | "first_party_stale"
  | "external_proxy" | "illustrative" | "unrated";
export type VerificationTierRow = {
  account_id: string; slug: string; verification_tier: VerificationTierKind;
  is_latest: boolean; n_fp_real: number; n_ext_real: number;
};
// Badge NUR für die First-Party-Abstufungen — external_proxy trägt bereits "Öffentliche Signale".
export function verificationTierMeta(t?: VerificationTierKind | null): { label: string; color: string; hint: string } | null {
  switch (t) {
    case "first_party_verified": return { label: "Verifiziert · First-Party", color: "#10b981", hint: "Aus verbundenen Operationsdaten (Postfach/Bank/CRM) berechnet und bestätigt — keine Näherung." };
    case "first_party_partial":  return { label: "Teil-verifiziert", color: "#E8A33D", hint: "First-Party-Quelle verbunden, aber dünn (nur wenige Kennzahlen)." };
    case "first_party_stale":    return { label: "Verbindung inaktiv", color: "#E8A33D", hint: "First-Party-Quelle war aktiv, liefert aktuell keine frischen Werte." };
    default: return null; // external_proxy / illustrative / unrated → kein eigenes Badge
  }
}

// ── Risk Shield: Geschaeftspartner-Fruehwarnung ──────────────────────────────
// Der Tenant fuehrt eine Watchlist seiner Partner (Domains); jede wird gegen das
// externe Distress-Universe (cap_accounts + cap_alerts) gematcht -> Ampel.
export type RiskAmpel = "red" | "amber" | "green" | "gray";
export type RiskPartnerAlert = {
  kind: AlertKind; severity: AlertSeverity; message: string;
  value_now: number | null; slope: number | null; period: string | null;
  tier: "confirmed" | "watch"; first_detected_at: string | null;
};
export type RiskPartner = {
  domain: string; name: string | null; source: "manual" | "inbox"; matched: boolean;
  account_slug: string | null; account_name: string | null; vertical: string | null;
  health_score: number | null; ampel: RiskAmpel; reason: string; confirmed_count: number; alerts: RiskPartnerAlert[];
};
export type RiskShieldSummary = { total: number; red: number; amber: number; green: number; gray: number };
export type RiskShield = { has_tenant: boolean; tenant_id: string | null; summary: RiskShieldSummary; partners: RiskPartner[] };

export function ampelColor(a: RiskAmpel): string {
  switch (a) { case "red": return "#C0392B"; case "amber": return "#E8A33D"; case "green": return "#10b981"; default: return "#5A6473"; }
}
export function ampelLabel(a: RiskAmpel): string {
  switch (a) { case "red": return "Bestätigter Distress"; case "amber": return "Beobachtung"; case "green": return "Stabil"; default: return "Nicht überwacht"; }
}

// ── Foerder-Radar: latentes Foerderkapital ──────────────────────────────────
export type GrantStatusClass = "verified" | "verify" | "paused";
export type GrantClass = "zuschuss" | "stipendium" | "kredit" | "gemischt" | "finanzierung";
export type FoerderMatch = "match" | "conditional" | "excluded";
export type FoerderProgram = {
  program_key: string; name: string; level: string | null; region: string | null;
  provider: string | null; funding_type: string | null; grant_class: GrantClass;
  status_class: GrantStatusClass; source_type?: "curated" | "auto"; description: string | null; eligibility: string | null;
  amount_min_eur: number | null; amount_max_eur: number | null; source: string | null;
  is_startup_program?: boolean; conditional_note?: string | null;
  match_status?: FoerderMatch; match_reason?: string | null;
};
export type FoerderKpi = {
  grant_count: number; verified_count: number; financing_count: number; total_visible?: number;
  conditional_count?: number;
  latent_verified_min: number; latent_verified_max: number;
  latent_total_min: number; latent_total_max: number; latent_conditional_max?: number;
  top_program: { name: string; amount_max_eur: number } | null;
};
export type FoerderProfile = {
  founding_year: number | null; city: string | null; region: string | null;
  postal_code: string | null; employee_count: number | null; confirmed_at?: string | null;
};
export type FoerderRadar = {
  has_tenant: boolean; account_name?: string | null;
  vertical: string | null; vertical_label?: string; icp?: string;
  kpi?: FoerderKpi; programs?: FoerderProgram[]; conditional_programs?: FoerderProgram[];
  profile?: FoerderProfile | null; suggested?: { founding_year: number | null };
};
export function fmtEur(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
}
export const FOERDER_VERTICALS: { key: string; label: string }[] = [
  { key: "ecom", label: "E-Commerce" },
  { key: "fintech", label: "Fintech" },
  { key: "real_estate", label: "Immobilienverwaltung" },
  { key: "bau", label: "Bau & Handwerk" },
  { key: "b2b_sales", label: "Dienstleistung" },
];
export const BUNDESLAENDER: { key: string; label: string }[] = [
  { key: "BW", label: "Baden-Württemberg" }, { key: "BY", label: "Bayern" }, { key: "BE", label: "Berlin" },
  { key: "BB", label: "Brandenburg" }, { key: "HB", label: "Bremen" }, { key: "HH", label: "Hamburg" },
  { key: "HE", label: "Hessen" }, { key: "MV", label: "Mecklenburg-Vorpommern" }, { key: "NI", label: "Niedersachsen" },
  { key: "NRW", label: "Nordrhein-Westfalen" }, { key: "RP", label: "Rheinland-Pfalz" }, { key: "SL", label: "Saarland" },
  { key: "SN", label: "Sachsen" }, { key: "ST", label: "Sachsen-Anhalt" }, { key: "SH", label: "Schleswig-Holstein" },
  { key: "TH", label: "Thüringen" },
];


// ── Jana-Chat (Read-only Q&A ueber die eigenen Signale) ──────────────────────
export type JanaCitation = {
  type: "kpi" | "source" | "alert" | "category" | "health" | "divergence" | "product";
  key: string; label?: string; value?: number | null; period?: string | null;
};
export type JanaSuggestion = { key: string; name: string; price_eur: number | null };
export type JanaDeepLink = { label: string; path: string };
export type JanaChatResponse = {
  ok: boolean; has_own_account: boolean; mode?: string; visible?: boolean;
  account?: { name: string; slug: string; vertical: string | null } | null;
  llm_configured?: boolean; llm_error?: string;
  answer: string | null; citations: JanaCitation[];
  used_data?: boolean | null; confidence?: number | null;
  dropped_citations?: number; parse_ok?: boolean;
  model?: string; latest_period?: string | null;
  // Produktwissen (v14): action="product" | Deep-Link auf den Abo-Tab | Feature-Vorschlaege.
  action?: string;
  deep_link?: JanaDeepLink | null;
  suggestions?: JanaSuggestion[];
  unverified_prices?: number[];
};
export type WeeklyPriority = {
  rank: number; title: string; severity: AlertSeverity | string; kind: AlertKind | string;
  handlung: string;
  beleg: { kpi: string | null; value: number | null; period: string | null; sources: string[] };
  tier: "confirmed" | "watch" | string; alert_id: string;
};
export type WeeklyPrioritiesResponse = {
  ok: boolean; has_own_account: boolean;
  account?: { name: string; slug: string; vertical: string | null } | null;
  latest_period?: string | null; priorities: WeeklyPriority[]; open_alert_count?: number;
};


// ── Investor Data-Room (M2): Portfolio-Screening ─────────────────────────────
// Spiegelt die Antwort der jana-chat-Aktion `investor_portfolio` (deterministisch
// gerankte Firmen des sichtbaren Universe + belegte LLM-Formulierung).
export type PortfolioFilterKey = "falling_slope" | "critical_alerts" | "stale_data" | "adverse_news";
export type PortfolioHit = {
  id: string | null; slug: string; name: string; vertical: string | null; account_type: string | null;
  is_illustrative: boolean; verification_tier: VerificationTierKind | null;
  health: number | null; band: string; slope6: number | null; net_drop6: number | null;
  risk_dir: "rising" | "stable" | "falling" | "unknown";
  coverage: number | null; period: string | null;
  open_alerts: number; critical_alerts: number; confirmed_alerts: number;
  worst_freshness: "fresh" | "stale" | "dead" | "none"; stale_count: number;
  news_tone: number | null; concern: number;
};
export type FirmCitation = { type: "firm"; key: string; label?: string; value?: number | null };
export type InvestorPortfolioResponse = {
  ok: boolean; mode?: string; action?: string;
  filter: PortfolioFilterKey | null; universe_size: number; hits: PortfolioHit[];
  llm_configured?: boolean; llm_error?: string;
  answer: string | null; citations: FirmCitation[];
  used_data?: boolean | null; confidence?: number | null; dropped_citations?: number; parse_ok?: boolean;
  model?: string; proxy_model?: string | null; generated_at?: string;
};
export const PORTFOLIO_FILTERS: { key: PortfolioFilterKey; label: string; hint: string }[] = [
  { key: "falling_slope", label: "Fallende Health-Kurve", hint: "Firmen mit der stärksten negativen 6-Monats-Steigung zuerst." },
  { key: "critical_alerts", label: "Kritische Alerts", hint: "Firmen mit offenen kritischen Frühwarn-Signalen (bestätigte zuerst)." },
  { key: "stale_data", label: "Dünne Datenlage", hint: "Firmen mit veralteten oder ausgefallenen Datenquellen." },
  { key: "adverse_news", label: "Negativer News-Ton", hint: "Firmen mit dem schwächsten Nachrichten-Ton (adverse media, GDELT)." },
];
export const PORTFOLIO_FILTER_LABEL: Record<PortfolioFilterKey, string> = {
  falling_slope: "Fallende Health-Steigung (6 Monate)",
  critical_alerts: "Offene kritische Frühwarn-Signale",
  stale_data: "Dünne/veraltete Datenlage",
  adverse_news: "Negativer Nachrichten-Ton",
};
export function worstFreshnessLabel(w: PortfolioHit["worst_freshness"]): string {
  return w === "dead" ? "Quelle inaktiv" : w === "stale" ? "veraltet" : "aktuell";
}

// ── Morning-Briefing (V1 Jana): Tagesfenster über cap_alerts, deterministisch ──
export type MorningNightDelta = {
  since?: string | null; window_hours?: number;
  new: number; new_critical: number; escalated: number; resolved: number; note: string;
};
export type MorningSuggestion = {
  alert_id: string; kpi: string | null; title: string;
  cta_label: string; cta_action: string; prep: string; focus: string | null;
} | null;
export type MorningHealth = { now: number | null; prev: number | null; slope6: number | null; band: string } | null;
export type MorningFreshness = { fresh: number; stale: number; dead: number; level: "ok" | "limited"; note: string };
export type MorningBriefingResponse = {
  ok: boolean; mode?: string; has_own_account: boolean;
  account?: { name: string; slug: string; vertical: string | null } | null;
  latest_period?: string | null; generated_at?: string | null;
  window_hours?: number; empty_case?: boolean; headline?: string;
  health?: MorningHealth; open_alert_count?: number;
  night_delta?: MorningNightDelta;
  data_freshness?: MorningFreshness;
  top_priorities?: WeeklyPriority[]; suggestion?: MorningSuggestion;
};


// ── M4 Foerder-RAG: belegte Antrags-Zusammenfassung (RAG) + Berater-Bundle ────
// Spiegelt die Antwort der foerder-detail Edge-Function: jede Unterlage/jeder
// Schritt/jede Frist ist mit einem Richtlinien-Ausschnitt (C1..Cn) belegt.
export type FoerderDetailItem = { text: string; quelle: string };
export type FoerderExcerpt = { id: string; chunk_idx: number; content: string; similarity: number };
export type FoerderDetailInner = {
  summary: string;
  documents_needed: FoerderDetailItem[];
  steps: FoerderDetailItem[];
  deadlines_conditions: FoerderDetailItem[];
  sources: string[];
  dropped?: number; parse_ok?: boolean; model?: string;
};
export type FoerderDetailSignal = { metric_key: string; value: number | null; period: string | null; is_illustrative?: boolean };
export type FoerderDetailFirm = {
  has_tenant: boolean; account_name?: string | null; vertical?: string | null;
  profile?: FoerderProfile | null; signals?: FoerderDetailSignal[];
};
export type FoerderDetailProgram = {
  program_key: string; name: string; provider?: string | null; level?: string | null;
  funding_type?: string | null; grant_class?: string | null;
  amount_min_eur?: number | null; amount_max_eur?: number | null;
  eligibility?: string | null; conditions?: string | null; description?: string | null;
  source?: string | null; source_type?: string | null;
};
export type FoerderDetailResponse = {
  ok: boolean;
  program?: FoerderDetailProgram;
  indexed: boolean;
  llm_configured?: boolean | null; llm_error?: string;
  detail?: FoerderDetailInner | null;
  excerpts?: FoerderExcerpt[];
  disclaimer?: string; source_url?: string; message?: string;
  firm?: FoerderDetailFirm | null;
};
// Menschlich lesbares Label fuer die aggregierten fin_*-Signale (0-100, KEINE Rohunterlagen).
export function foerderSignalLabel(key: string): string {
  const m: Record<string, string> = {
    fin_mrr: "Wiederkehrender Umsatz (Index)", fin_burn: "Liquiditaets-Burn (Index)",
    fin_liquidity: "Liquiditaet (Index)", fin_runway: "Runway (Index)",
    fin_dso: "Zahlungseingang / DSO (Index)", fin_dpo: "Zahlungsziel / DPO (Index)",
    fin_ar_aging: "Forderungsalter (Index)", fin_ap_pressure: "Verbindlichkeitsdruck (Index)",
    fin_gross_margin: "Bruttomarge (Index)", fin_working_capital: "Working Capital (Index)",
    fin_cash_conversion: "Cash Conversion (Index)",
  };
  return m[key] ?? key;
}
