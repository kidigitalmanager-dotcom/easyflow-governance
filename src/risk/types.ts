// Risk-Portal - Typen exakt nach INSURER-API-CONTRACT-2026-07-19.md.
// Quelle der Wahrheit sind die Fixtures in 02-Spezifikation/fixtures/; sie tragen
// zusaetzlich quality_tier, connected_sources und is_natural_person, die im
// Contract-Markdown noch fehlen (siehe STATUS.md, Fund B-1).

export type TenantType = "underwriting_book" | "investment";
export type CustomerSegment = "credit_insurer" | "factoring" | "alternative_lender";

export type RiskBand = "gesund" | "beobachten" | "kritisch" | "unbekannt";
export type QualityTier = "basis" | "erweitert" | "voll";
export type FreshnessStatus = "fresh" | "stale" | "dead" | "no_sla";
export type Availability = "live" | "connectable" | "building" | "planned";
export type ChangeSeverity = "info" | "warning" | "critical";
export type ChangeKind = "trend_down" | "anomaly" | "threshold_breach" | "distress_risk";
export type Direction = "up" | "down" | "flat";

/** Welche Quellen dieser Name angeschlossen hat. Bestimmt die Qualitaetsstufe. */
export type ConnectedSource =
  | "comms" | "shopify" | "stripe" | "bank" | "maesn" | "hubspot"
  | "einvoice" | "ticketing" | "meta_ads" | (string & {});

export type RiskFreshness = {
  last_observed_at: string | null;
  status: FreshnessStatus;
  age_hours: number | null;
};

/**
 * KLASSEN-Provenance. Das ist alles, was ein underwriting_book-Mandant je sieht.
 * `formula`, `input` und `evidence_refs` sind bewusst NICHT Teil dieses Typs -
 * sie liegen serverseitig hinter einem anderen Serialisierer. Die Laufzeit-
 * Gegenprobe steht in api.ts (assertClassProvenanceOnly).
 */
export type RiskClassProvenance = {
  method_label: string;
  sources_used: string[];
  window_weeks?: number | null;
};

export type RiskCategory = {
  key: string;
  name: string;
  score: number | null;
  confidence: number | null;
  coverage: number | null;
  kpis_with_data: number;
};

export type RiskMetric = {
  metric_key: string;
  short_code: string | null;
  name: string;
  category_key: string;
  measures: string | null;
  value: number | null;
  band: RiskBand;
  confidence: number | null;
  coverage: number | null;
  weight: number;
  availability: Availability;
  freshness: RiskFreshness;
  percentile_vertical: number | null;
  provenance: RiskClassProvenance;
  /**
   * Gesetzt, wenn die Kennzahl ihr Mindestmass nicht erreicht hat. Dann steht
   * `value` auf null - und die Oberflaeche sagt WARUM, statt einen Strich zu
   * zeigen. Ein leeres Feld wirkt wie ein Fehler, ein erklaertes wie Sorgfalt.
   */
  skipped_reason?: string | null;
};

/** Die vier Verhaltenssignale, Kurzform fuer die Bestandstabelle. */
export const BEHAVIOUR_METRIC_KEYS = [
  "beh_promise_break", "beh_creditor_silence", "beh_early_dispute", "beh_escalation_speed",
] as const;
export type BehaviourMetricKey = (typeof BEHAVIOUR_METRIC_KEYS)[number];

export type RiskReasonCode = {
  metric_key: string;
  short_code: string | null;
  name: string;
  value: number | null;
  /** Punkte am Gesamtscore, signiert. Sortierkriterium ist |contribution|. */
  contribution: number;
  direction: Direction;
  label: string;
  trend_6m: (number | null)[];
};

export type RiskCounterfactualLever = {
  metric_key: string;
  name: string;
  current: number | null;
  required: number | null;
  delta: number | null;
  text: string;
};

export type RiskCounterfactual = {
  target_band: RiskBand;
  target_score: number;
  gap: number;
  levers: RiskCounterfactualLever[];
  text: string;
};

export type RiskBenchmark = {
  vertical: string;
  median_health: number | null;
  p25_health: number | null;
  p75_health: number | null;
  n_accounts: number;
  delta_vs_median: number | null;
};

/** GET /entities/{account_id}/score */
export type RiskScore = {
  account_id: string;
  name: string;
  legal_form: string | null;
  vertical: string | null;
  period: string;
  model_version: string;
  computed_at: string;
  quality_tier: QualityTier;
  connected_sources: ConnectedSource[];
  health_score: number | null;
  band: RiskBand;
  confidence: number | null;
  coverage: number | null;
  trend_12m: (number | null)[];
  categories: RiskCategory[];
  reason_codes: RiskReasonCode[];
  counterfactual: RiskCounterfactual;
  metrics: RiskMetric[];
  benchmark: RiskBenchmark | null;
  /** z.B. "Historie im Aufbau (4 von 8 Wochen)". null = unauffaellig. */
  history_note: string | null;
};

/** POST /entities/batch mit fields=compact - die Zeile der Bestandstabelle. */
export type RiskCompactRow = {
  account_id: string;
  name: string;
  legal_form: string | null;
  is_natural_person: boolean;
  vertical: string | null;
  health_score: number | null;
  band: RiskBand;
  confidence: number | null;
  coverage: number | null;
  quality_tier: QualityTier;
  connected_sources: ConnectedSource[];
  categories: Record<string, number | null>;
  top_reason: {
    metric_key: string; short_code: string | null; name: string;
    contribution: number; label: string;
  } | null;
  exposure: number | null;
  history_note: string | null;
  /** Verhaltenssignale als Spaltenwerte. null = Mindestmass nicht erreicht. */
  behaviour?: Partial<Record<BehaviourMetricKey, number | null>>;
};

/** GET /changes */
export type RiskChange = {
  account_id: string;
  name: string;
  changed_at: string;
  score_before: number | null;
  score_after: number | null;
  delta: number;
  band_before: RiskBand;
  band_after: RiskBand;
  crossed_threshold: boolean;
  severity: ChangeSeverity;
  kind: ChangeKind;
  top_driver: { metric_key: string; name: string; contribution: number } | null;
  confidence: number | null;
  exposure: number | null;
  quality_tier: QualityTier;
  /** Serverseitig berechnet (exposure x |delta| x confidence). NIE im Client sortieren. */
  priority_rank: number;
};

export type RiskChangesResponse = {
  changes: RiskChange[];
  next_cursor: string | null;
  has_more: boolean;
};

/** GET /governance */
export type RiskGovernance = {
  model: { version: string; valid_from: string; changelog_url: string; spec_pdf_url: string };
  coverage: {
    accounts_total: number;
    with_consent: number;
    by_tier: Record<QualityTier, number>;
    by_metric: { metric_key: string; coverage: number; accounts_with_data: number }[];
    by_vertical: { vertical: string; n: number; avg_coverage: number }[];
  };
  freshness: { fresh: number; stale: number; dead: number; median_age_hours: number };
  drift: { psi: number; status: string; history: { period: string; psi: number }[] };
  discrimination: {
    available: boolean;
    reason: string | null;
    n_defaults: number;
    n_accounts: number;
    gini: number | null;
    auc: number | null;
    ci95: [number, number] | null;
  };
  legal_form_split: { personenbezogen: number; juristische_person: number };
};

/** POST /portfolio/match */
export type RiskMatchResult = {
  summary: {
    submitted: number; matched: number; match_rate: number;
    with_consent: number; confident: number; ambiguous: number;
    by_tier: Record<QualityTier, number>;
  };
  matches: { ref: string; account_id: string; match_confidence: number; matched_on: string[] }[];
  unmatched_sample: { ref: string; name: string; reason: string }[];
};

/** Startansicht + Standard-Spalten je Kundengruppe. Steuert NIE den Datenumfang. */
export type SegmentDefaults = {
  label: string;
  start_view: "changes" | "portfolio";
  columns: string[];
  sort: string;
  highlight_categories: string[];
};
export type SegmentDefaultsMap = Record<CustomerSegment, SegmentDefaults>;

/**
 * Entscheidungsvermerk (Block 6).
 *
 * Nicht nur Arbeitsorganisation: der Vermerk belegt die Befassung durch einen
 * Menschen und ist damit das Gegenstueck, das Art. 22 Abs. 3 DSGVO zur
 * automatisierten Bewertung verlangt (Hinweis aus Stream A, 19.07.).
 *
 * Zwei Konsequenzen fuer die Umsetzung:
 * 1. **append-only** - ein Vermerk wird nie ueberschrieben, nur ergaenzt.
 *    Eine ueberschreibbare Notiz belegt gar nichts.
 * 2. Er haelt fest, **auf welchen Score-Stand** sich die Entscheidung bezog.
 *    Ohne Modellversion, Periode und Score zum Zeitpunkt der Entscheidung ist
 *    die Befassung spaeter nicht rekonstruierbar.
 *
 * Der Contract hat dafuer bisher keinen Endpunkt (STATUS.md, Fund B-2).
 */
export type DecisionStatus = "limit_erhoeht" | "limit_gehalten" | "limit_gesenkt" | "abgelehnt" | "eskaliert";
export type DecisionNote = {
  account_id: string;
  status: DecisionStatus;
  note: string;
  author: string;
  created_at: string;
  /** Bezugspunkt der Entscheidung - macht die Befassung nachvollziehbar. */
  model_version: string;
  period: string;
  score_at_decision: number | null;
  computed_at: string;
};
