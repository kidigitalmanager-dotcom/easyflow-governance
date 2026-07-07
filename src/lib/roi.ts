// src/lib/roi.ts
// ROI-Schaetzung "Was Jana dir gespart hat" — reine, testbare Logik (V2-Kachel).
//
// Datenquelle: /v1/dashboard/stats (bereits vorhanden, KEIN neuer Endpoint):
//   drafts_created_week  — von Jana vorbereitete Antwort-Entwuerfe (7 Tage)
//   emails_week          — klassifizierte / eingeordnete E-Mails (7 Tage)
//   resolved_week        — freigegebene & gesendete Entwuerfe (7 Tage; Teilmenge
//                          der Entwuerfe → NICHT separat in Minuten gezaehlt,
//                          sonst Doppelzaehlung. Dient nur als Kontext + M5-Hook.)
//
// Ehrlichkeit: konservative Schaetzung mit sichtbaren Annahmen + Bandbreite,
// nie als exakter Fakt. "Monat" hat KEINEN eigenen Zaehler im Endpoint → wird
// aus dem 7-Tage-Schnitt hochgerechnet (klar als Projektion gekennzeichnet).

import type { DashboardStats } from "@/lib/api-client";

export type RoiPeriod = "week" | "month";

export interface RoiAssumptions {
  /** Gesparte Schreib-/Formulierzeit je vorbereitetem Entwurf (Minuten). */
  draftMinutes: number;
  /** Gesparte Sortier-/Priorisierzeit je eingeordneter E-Mail (Minuten). */
  triageMinutes: number;
  /** Stundensatz fuer die optionale Euro-Umrechnung (EUR/Std). */
  hourlyRate: number;
}

export const DEFAULT_ASSUMPTIONS: RoiAssumptions = {
  draftMinutes: 8,
  triageMinutes: 1,
  hourlyRate: 40,
};

// Grenzen fuer die justierbaren Felder (Schutz vor Unsinns-Eingaben).
export const ASSUMPTION_BOUNDS = {
  draftMinutes: { min: 1, max: 30 },
  triageMinutes: { min: 0, max: 10 },
  hourlyRate: { min: 0, max: 500 },
} as const;

// Unsicherheits-Bandbreite um die Punkt-Schaetzung (die tatsaechliche Ersparnis
// je Fall schwankt) — bewusst sichtbar als "ca. X–Y".
export const BAND_LOW = 0.75;
export const BAND_HIGH = 1.25;

// 7-Tage-Zaehler → Monat: Hochrechnung, NICHT gemessen (kein Monats-Zaehler im
// Endpoint). Durchschnittliche Tage pro Monat geteilt durch 7.
export const WEEK_TO_MONTH = 30.437 / 7; // ≈ 4.35

// Schwelle: unter dieser Wochen-Aktivitaet ist die Schaetzung nicht belastbar.
export const THIN_MIN_EMAILS = 3; // < 3 eingeordnete E-Mails UND 0 Entwuerfe → thin

// M5-Upsell-Hook (Platzhalter — wird mit der naechsten Autopilot-Stufe scharf-
// geschaltet). Rein illustrativer, klar gekennzeichneter Vorwaerts-Blick.
export const M5_AUTO_SHARE = 0.4; // Anteil auto-sendbarer Entwuerfe (Annahme)
export const M5_RELEASE_MINUTES = 2; // gesparte Freigabe-/Sichtungszeit je Entwurf

export const STORAGE_KEY = "ue.roi.assumptions.v1";

export interface RoiResult {
  period: RoiPeriod;
  /** month = aus dem Wochen-Schnitt hochgerechnet (nicht gemessen). */
  projected: boolean;
  /** Zu wenig Aktivitaet fuer eine belastbare Zahl. */
  thin: boolean;
  /** 0 Entwuerfe, aber genug E-Mails → nur Triage-Zeit gezaehlt. */
  triageOnly: boolean;
  drafts: number; // (ggf. hochgerechnete) Anzahl vorbereiteter Entwuerfe
  emails: number; // (ggf. hochgerechnete) Anzahl eingeordneter E-Mails
  resolved: number; // (ggf. hochgerechnet) freigegeben & gesendet
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

export function sanitizeAssumptions(a: Partial<RoiAssumptions> | null | undefined): RoiAssumptions {
  const src = a ?? {};
  return {
    draftMinutes: clamp(
      Number(src.draftMinutes ?? DEFAULT_ASSUMPTIONS.draftMinutes),
      ASSUMPTION_BOUNDS.draftMinutes.min,
      ASSUMPTION_BOUNDS.draftMinutes.max,
    ),
    triageMinutes: clamp(
      Number(src.triageMinutes ?? DEFAULT_ASSUMPTIONS.triageMinutes),
      ASSUMPTION_BOUNDS.triageMinutes.min,
      ASSUMPTION_BOUNDS.triageMinutes.max,
    ),
    hourlyRate: clamp(
      Number(src.hourlyRate ?? DEFAULT_ASSUMPTIONS.hourlyRate),
      ASSUMPTION_BOUNDS.hourlyRate.min,
      ASSUMPTION_BOUNDS.hourlyRate.max,
    ),
  };
}

export function loadAssumptions(): RoiAssumptions {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_ASSUMPTIONS };
    return sanitizeAssumptions(JSON.parse(raw) as Partial<RoiAssumptions>);
  } catch {
    return { ...DEFAULT_ASSUMPTIONS };
  }
}

export function saveAssumptions(a: RoiAssumptions): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAssumptions(a)));
    }
  } catch {
    /* ignore */
  }
}

type RoiStats = Pick<DashboardStats, "drafts_created_week" | "emails_week" | "resolved_week">;

export function computeRoi(
  stats: RoiStats | null | undefined,
  assumptionsIn: Partial<RoiAssumptions> | null | undefined,
  period: RoiPeriod,
): RoiResult {
  const a = sanitizeAssumptions(assumptionsIn);
  const draftsWeek = toNonNegInt(stats?.drafts_created_week);
  const emailsWeek = toNonNegInt(stats?.emails_week);
  const resolvedWeek = toNonNegInt(stats?.resolved_week);

  // thin/triageOnly IMMER auf der gemessenen Wochen-Aktivitaet beurteilen.
  const thin = draftsWeek === 0 && emailsWeek < THIN_MIN_EMAILS;
  const triageOnly = draftsWeek === 0 && emailsWeek >= THIN_MIN_EMAILS;

  const projected = period === "month";
  const f = projected ? WEEK_TO_MONTH : 1;

  const drafts = Math.round(draftsWeek * f);
  const emails = Math.round(emailsWeek * f);
  const resolved = Math.round(resolvedWeek * f);

  // Punkt-Schaetzung: Schreibzeit je Entwurf + Triage-Zeit je E-Mail.
  // resolved wird NICHT addiert (Teilmenge der Entwuerfe → Doppelzaehlung).
  const minutesPoint = drafts * a.draftMinutes + emails * a.triageMinutes;
  const minutesLow = minutesPoint * BAND_LOW;
  const minutesHigh = minutesPoint * BAND_HIGH;

  const euroPoint = (minutesPoint / 60) * a.hourlyRate;
  const euroLow = (minutesLow / 60) * a.hourlyRate;
  const euroHigh = (minutesHigh / 60) * a.hourlyRate;

  return {
    period,
    projected,
    thin,
    triageOnly,
    drafts,
    emails,
    resolved,
    minutesPoint,
    minutesLow,
    minutesHigh,
    euroPoint,
    euroLow,
    euroHigh,
  };
}

/** M5-Hook: geschaetzte ZUSAETZLICHE Zeitersparnis mit der naechsten Autopilot-
 *  Stufe (auto-Send eines Teils der Entwuerfe). Klar als Vorschau markiert. */
export function computeM5Hook(result: RoiResult): { minutes: number } {
  const minutes = result.drafts * M5_AUTO_SHARE * M5_RELEASE_MINUTES;
  return { minutes };
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
