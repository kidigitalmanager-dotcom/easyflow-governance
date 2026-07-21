// src/lib/roi.ts
// ROI-Schaetzung "Was Jana dir gespart hat" — reine, testbare Logik (V2-Kachel).
//
// Zwei Datenpfade:
//  1) ECHT (bevorzugt): GET /v1/dashboard/roi liefert gemessene Wochen- UND
//     Monats-Zaehler (drafts_prepared, resolved, emails_triaged, deadlines_caught).
//  2) FALLBACK: GET /v1/dashboard/stats (nur Wochen-Zaehler) → Woche gemessen,
//     Monat als klar gekennzeichnete Hochrechnung (×WEEK_TO_MONTH).
//
// Ehrlichkeit: konservative Schaetzung mit sichtbaren Annahmen + Bandbreite,
// nie als exakter Fakt. resolved ist Teilmenge der Entwuerfe → NICHT separat in
// Minuten gezaehlt (Doppelzaehlung), dient nur als Kontext + M5-Hook.

import type { DashboardStats } from "@/lib/api-client";

export type RoiPeriod = "week" | "month";

/** Gemessene Zaehler eines Zeitfensters (aus /v1/dashboard/roi). */
export interface RoiCounts {
  drafts_prepared: number;
  resolved: number;
  emails_triaged: number;
  deadlines_caught: number;
}

export interface RoiAssumptions {
  /** Gesparte Schreib-/Formulierzeit je vorbereitetem Entwurf (Minuten). */
  draftMinutes: number;
  /** Gesparte Sortier-/Priorisierzeit je eingeordneter E-Mail (Minuten). */
  triageMinutes: number;
  /** Gesparte Zeit je erfasster Frist/Termin (nicht verpasst) (Minuten). */
  deadlineMinutes: number;
  /** Stundensatz fuer die optionale Euro-Umrechnung (EUR/Std). */
  hourlyRate: number;
}

// Methoden-Angleichung 21.07.2026 (Leon): identische Annahmen wie Pitch-Demo und
// demo-jana-Backend (8 Min je Entwurf, 2 Min Triage, 60 EUR/Std). Bewusst
// konservativer als der Website-ROI-Rechner (HausverwaltungRechner.tsx,
// Durchschnitt 5 Min je E-Mail ueber ALLE Mails).
export const DEFAULT_ASSUMPTIONS: RoiAssumptions = {
  draftMinutes: 8,
  triageMinutes: 2,
  deadlineMinutes: 15,
  hourlyRate: 60,
};

// Grenzen fuer die justierbaren Felder (Schutz vor Unsinns-Eingaben).
export const ASSUMPTION_BOUNDS = {
  draftMinutes: { min: 1, max: 30 },
  triageMinutes: { min: 0, max: 10 },
  deadlineMinutes: { min: 1, max: 120 },
  hourlyRate: { min: 0, max: 500 },
} as const;

// Unsicherheits-Bandbreite um die Punkt-Schaetzung (die tatsaechliche Ersparnis
// je Fall schwankt) — bewusst sichtbar als "ca. X–Y".
export const BAND_LOW = 0.75;
export const BAND_HIGH = 1.25;

// 7-Tage-Zaehler → Monat (nur im FALLBACK-Pfad): Hochrechnung, NICHT gemessen.
// Durchschnittliche Tage pro Monat geteilt durch 7.
export const WEEK_TO_MONTH = 30.437 / 7; // ≈ 4.35

// Schwelle: unter dieser Aktivitaet ist die Schaetzung nicht belastbar.
export const THIN_MIN_EMAILS = 3;

// M5-Upsell-Hook (Platzhalter — wird mit der naechsten Autopilot-Stufe scharf-
// geschaltet). Rein illustrativer, klar gekennzeichneter Vorwaerts-Blick.
export const M5_AUTO_SHARE = 0.4;
export const M5_RELEASE_MINUTES = 2;

export const STORAGE_KEY = "ue.roi.assumptions.v3";
// v2-Bestand (bis 21.07.2026, Defaults 8/1/15/40): Die Kachel hat die geladenen
// Werte beim ersten Rendern automatisch persistiert, d.h. ein v2-Eintrag ist
// meist KEINE bewusste Nutzer-Einstellung. Migration: Felder, die noch exakt auf
// dem v2-Default stehen, uebernehmen den neuen Default; bewusste Abweichungen
// bleiben erhalten (Addendum 21.07.: bestehende Overrides respektieren).
export const STORAGE_KEY_V2 = "ue.roi.assumptions.v2";
export const V2_DEFAULTS: RoiAssumptions = {
  draftMinutes: 8,
  triageMinutes: 1,
  deadlineMinutes: 15,
  hourlyRate: 40,
};

export interface RoiResult {
  period: RoiPeriod;
  /** true = Monat aus dem Wochen-Schnitt hochgerechnet (nur Fallback-Pfad). */
  projected: boolean;
  /** true = Zahlen gemessen aus /v1/dashboard/roi (nicht hochgerechnet). */
  measured: boolean;
  thin: boolean;
  triageOnly: boolean;
  drafts: number;
  emails: number;
  resolved: number;
  deadlines: number;
  minutesPoint: number;
  minutesLow: number;
  minutesHigh: number;
  euroPoint: number;
  euroLow: number;
  euroHigh: number;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// Zaehler robust einlesen: nicht-endliche (NaN) oder negative Werte → 0.
// (?? faengt nur null/undefined, NICHT NaN — daher explizit.)
function toNonNegInt(x: unknown): number {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toCounts(x: Partial<RoiCounts> | null | undefined): RoiCounts {
  return {
    drafts_prepared: toNonNegInt(x?.drafts_prepared),
    resolved: toNonNegInt(x?.resolved),
    emails_triaged: toNonNegInt(x?.emails_triaged),
    deadlines_caught: toNonNegInt(x?.deadlines_caught),
  };
}

export function sanitizeAssumptions(a: Partial<RoiAssumptions> | null | undefined): RoiAssumptions {
  const src = a ?? {};
  return {
    draftMinutes: clamp(Number(src.draftMinutes ?? DEFAULT_ASSUMPTIONS.draftMinutes), ASSUMPTION_BOUNDS.draftMinutes.min, ASSUMPTION_BOUNDS.draftMinutes.max),
    triageMinutes: clamp(Number(src.triageMinutes ?? DEFAULT_ASSUMPTIONS.triageMinutes), ASSUMPTION_BOUNDS.triageMinutes.min, ASSUMPTION_BOUNDS.triageMinutes.max),
    deadlineMinutes: clamp(Number(src.deadlineMinutes ?? DEFAULT_ASSUMPTIONS.deadlineMinutes), ASSUMPTION_BOUNDS.deadlineMinutes.min, ASSUMPTION_BOUNDS.deadlineMinutes.max),
    hourlyRate: clamp(Number(src.hourlyRate ?? DEFAULT_ASSUMPTIONS.hourlyRate), ASSUMPTION_BOUNDS.hourlyRate.min, ASSUMPTION_BOUNDS.hourlyRate.max),
  };
}

/** v2 -> v3: nur bewusste Abweichungen vom v2-Default uebernehmen (s.o.). */
export function migrateV2Assumptions(v2In: Partial<RoiAssumptions> | null | undefined): RoiAssumptions {
  const v2 = sanitizeAssumptions(v2In);
  return {
    draftMinutes: v2.draftMinutes === V2_DEFAULTS.draftMinutes ? DEFAULT_ASSUMPTIONS.draftMinutes : v2.draftMinutes,
    triageMinutes: v2.triageMinutes === V2_DEFAULTS.triageMinutes ? DEFAULT_ASSUMPTIONS.triageMinutes : v2.triageMinutes,
    deadlineMinutes: v2.deadlineMinutes === V2_DEFAULTS.deadlineMinutes ? DEFAULT_ASSUMPTIONS.deadlineMinutes : v2.deadlineMinutes,
    hourlyRate: v2.hourlyRate === V2_DEFAULTS.hourlyRate ? DEFAULT_ASSUMPTIONS.hourlyRate : v2.hourlyRate,
  };
}

export function loadAssumptions(): RoiAssumptions {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_ASSUMPTIONS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeAssumptions(JSON.parse(raw) as Partial<RoiAssumptions>);
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) return migrateV2Assumptions(JSON.parse(rawV2) as Partial<RoiAssumptions>);
    return { ...DEFAULT_ASSUMPTIONS };
  } catch {
    return { ...DEFAULT_ASSUMPTIONS };
  }
}

export function saveAssumptions(a: RoiAssumptions): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAssumptions(a)));
  } catch {
    /* ignore */
  }
}

/** Kern-Rechner: aus gemessenen Zaehlern eines Fensters → RoiResult.
 *  `scale` skaliert die Zaehler (nur Fallback-Monat = ×WEEK_TO_MONTH); thin/
 *  triageOnly werden IMMER auf den ungeskalierten (gemessenen) Zaehlern beurteilt. */
export function computeRoiFromCounts(
  countsIn: Partial<RoiCounts> | null | undefined,
  assumptionsIn: Partial<RoiAssumptions> | null | undefined,
  opts: { period: RoiPeriod; projected?: boolean; measured?: boolean; scale?: number },
): RoiResult {
  const a = sanitizeAssumptions(assumptionsIn);
  const base = toCounts(countsIn);
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 1;

  const drafts = Math.round(base.drafts_prepared * scale);
  const emails = Math.round(base.emails_triaged * scale);
  const resolved = Math.round(base.resolved * scale);
  const deadlines = Math.round(base.deadlines_caught * scale);

  const thin = base.drafts_prepared === 0 && base.emails_triaged < THIN_MIN_EMAILS && base.deadlines_caught === 0;
  const triageOnly = base.drafts_prepared === 0 && !thin;

  // resolved NICHT addieren (Teilmenge der Entwuerfe → Doppelzaehlung).
  const minutesPoint = drafts * a.draftMinutes + emails * a.triageMinutes + deadlines * a.deadlineMinutes;
  const minutesLow = minutesPoint * BAND_LOW;
  const minutesHigh = minutesPoint * BAND_HIGH;

  const euroPoint = (minutesPoint / 60) * a.hourlyRate;
  const euroLow = (minutesLow / 60) * a.hourlyRate;
  const euroHigh = (minutesHigh / 60) * a.hourlyRate;

  return {
    period: opts.period,
    projected: !!opts.projected,
    measured: !!opts.measured,
    thin,
    triageOnly,
    drafts,
    emails,
    resolved,
    deadlines,
    minutesPoint,
    minutesLow,
    minutesHigh,
    euroPoint,
    euroLow,
    euroHigh,
  };
}

/** FALLBACK-Pfad aus /v1/dashboard/stats (nur Wochen-Zaehler, keine Fristen).
 *  Woche = gemessen; Monat = Hochrechnung (projected). */
export function computeRoi(
  stats: Pick<DashboardStats, "drafts_created_week" | "emails_week" | "resolved_week"> | null | undefined,
  assumptionsIn: Partial<RoiAssumptions> | null | undefined,
  period: RoiPeriod,
): RoiResult {
  const counts: RoiCounts = {
    drafts_prepared: toNonNegInt(stats?.drafts_created_week),
    resolved: toNonNegInt(stats?.resolved_week),
    emails_triaged: toNonNegInt(stats?.emails_week),
    deadlines_caught: 0,
  };
  const projected = period === "month";
  return computeRoiFromCounts(counts, assumptionsIn, {
    period,
    projected,
    measured: false,
    scale: projected ? WEEK_TO_MONTH : 1,
  });
}

/** M5-Hook: geschaetzte ZUSAETZLICHE Zeitersparnis mit der naechsten Autopilot-
 *  Stufe (auto-Send eines Teils der Entwuerfe). Klar als Vorschau markiert. */
export function computeM5Hook(result: RoiResult): { minutes: number } {
  return { minutes: result.drafts * M5_AUTO_SHARE * M5_RELEASE_MINUTES };
}

// ── Formatierung (de-DE) ──────────────────────────────────────────────────────

export function formatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} Min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} Std` : `${h} Std ${rem} Min`;
}

function fmtNum1(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

/** Grosse Bandbreiten-Zahl. Unter 1 Std in Minuten, sonst in Stunden. */
export function formatHoursRange(lowMin: number, highMin: number): string {
  if (highMin < 60) return `${Math.round(lowMin)}–${Math.round(highMin)} Min`;
  return `${fmtNum1(lowMin / 60)}–${fmtNum1(highMin / 60)} Std`;
}

export function formatEuroRange(low: number, high: number): string {
  const fmt = (x: number) => Math.round(x).toLocaleString("de-DE");
  return `${fmt(low)}–${fmt(high)} €`;
}

export function periodLabel(period: RoiPeriod): string {
  return period === "week" ? "diese Woche" : "diesen Monat";
}
