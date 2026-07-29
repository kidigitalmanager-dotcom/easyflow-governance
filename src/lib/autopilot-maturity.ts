/**
 * autopilot-maturity.ts — pure Gate-/Stufen-Logik für die Autonomie-Stufen-Ansicht
 * (Einstellungen → Email-Autopilot, Paket B 2026-06).
 *
 * Datenquelle: governance.autopilot_maturity via GET /v1/dashboard/autopilot/policy
 * (maturity[] liegt seit v4.16 im Payload — 0 Backend-Touch).
 * Schwellen spiegeln die Backend-Konstanten (autopilot_engine/nightly):
 * MIN_SAMPLES=100, SHADOW_MISMATCH_RATE_MAX=0.03, EDIT_RATE_MAX=0.10
 * (Leon-Entscheid 29.07.2026, P2.2: 400 passte zu einem 10.000er-Postfach,
 * nicht zu rund 300 Mails im Monat).
 *
 * 🔴 Diese Zahlen stehen an DREI Stellen: hier, in autopilot_engine.js und in
 * nightly.js der Sender-Lambda. Seit api-router v4.185.0 liefert
 * GET /v1/dashboard/autopilot/policy zusaetzlich `maturity_gate` — wer das
 * durchreicht, kann nicht mehr gegen ein anderes Ziel rechnen als das Gate.
 * Die Konstanten hier sind nur noch der Fallback fuer aeltere Backends.
 * promotion_ready wird NÄCHTLICH vom autopilot-sender berechnet — diese Anzeige
 * erfindet keine eigene Freigabe-Logik, sie visualisiert nur den DB-Stand.
 */

export const MIN_SAMPLES = 100;
export const MISMATCH_RATE_MAX = 0.03;
export const EDIT_RATE_MAX = 0.1;

/** Was das Backend als Reifegate meldet (api-router >= v4.185.0). */
export interface MaturityGate {
  min_samples?: number | null;
  mismatch_rate_max?: number | null;
  edit_rate_max?: number | null;
}

/** Backend-Wert wenn brauchbar, sonst die Konstante. Nie NaN, nie 0 als Ziel. */
function gateNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type MaturityMode = "shadow" | "assisted" | "autonomous";
export const MODE_ORDER: MaturityMode[] = ["shadow", "assisted", "autonomous"];

export const MODE_SHORT_LABELS: Record<MaturityMode, string> = {
  shadow: "Schatten",
  assisted: "Assistiert",
  autonomous: "Autonom",
};

/** Defensive Zahl-Koersion: pg-numerics können als String ankommen. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function nextMode(mode: string | null | undefined): MaturityMode | null {
  const i = MODE_ORDER.indexOf(String(mode || "") as MaturityMode);
  if (i < 0) return MODE_ORDER[1]; // unbekannt/leer → konservativ wie shadow behandeln
  return i < MODE_ORDER.length - 1 ? MODE_ORDER[i + 1] : null;
}

export type GateStatus = "pass" | "fail" | "pending";

export interface GateProgress {
  key: "samples" | "mismatch" | "edit";
  label: string;
  status: GateStatus;
  /** Anzeigetext des Ist-Werts, z. B. "23 / 100" oder "3,2 %" oder "noch offen" */
  valueText: string;
  /** Zieltext, z. B. "Ziel: 100 Mails" oder "max. 3 %" */
  targetText: string;
  /** Füllstand 0..100 für den Samples-Balken (Raten-Gates: 100=pass-Anteil rein informativ) */
  pct: number;
}

export interface MaturityRowLike {
  core_key?: string;
  mode?: string;
  sample_count?: number | string | null;
  shadow_mismatch_rate?: number | string | null;
  edit_rate?: number | string | null;
  promotion_ready?: boolean;
  promotion_requested?: boolean;
  promotion_requested_at?: string | null;
}

function fmtPct(rate: number): string {
  return (rate * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %";
}

export function computeGates(
  row: MaturityRowLike | null | undefined,
  gate?: MaturityGate | null
): GateProgress[] {
  const samples = toNum(row?.sample_count) ?? 0;
  const mismatch = toNum(row?.shadow_mismatch_rate);
  const edit = toNum(row?.edit_rate);

  const minSamples = gateNum(gate?.min_samples, MIN_SAMPLES);
  const mismatchMax = gateNum(gate?.mismatch_rate_max, MISMATCH_RATE_MAX);
  const editMax = gateNum(gate?.edit_rate_max, EDIT_RATE_MAX);

  const samplesPct = Math.max(0, Math.min(100, Math.round((samples / minSamples) * 100)));

  const rateGate = (
    key: "mismatch" | "edit",
    label: string,
    value: number | null,
    max: number
  ): GateProgress => ({
    key,
    label,
    status: value === null ? "pending" : value <= max ? "pass" : "fail",
    valueText: value === null ? "noch offen" : fmtPct(value),
    targetText: "max. " + fmtPct(max),
    pct: value === null ? 0 : value <= max ? 100 : 0,
  });

  return [
    {
      key: "samples",
      label: "Beobachtete Mails",
      status: samples >= minSamples ? "pass" : "pending",
      valueText: `${samples} / ${minSamples}`,
      targetText: `Ziel: ${minSamples} Mails`,
      pct: samplesPct,
    },
    rateGate("mismatch", "Abweichung (Schatten vs. Mensch)", mismatch, mismatchMax),
    rateGate("edit", "Bearbeitungs-Quote", edit, editMax),
  ];
}

export interface MaturityStatusInfo {
  kind: "no_data" | "max" | "requested" | "ready" | "collecting" | "quality" | "eval_pending";
  label: string;
  detail?: string;
}

/**
 * v4.186.0: nimmt das Ziel jetzt aus dem Server-Gate statt aus den Konstanten.
 * Ohne uebergebenes Gate bleibt das Verhalten exakt wie vorher — aeltere
 * Backends liefern `maturity_gate` nicht.
 */
export function maturityStatus(
  row: MaturityRowLike | null | undefined,
  gate?: MaturityGate | null
): MaturityStatusInfo {
  if (!row) {
    return {
      kind: "no_data",
      label: "Noch keine Daten",
      detail: "UseEasy sammelt ab der ersten eingehenden Mail im Schatten-Modus.",
    };
  }
  if (row.mode === "autonomous") {
    return { kind: "max", label: "Höchste Stufe erreicht" };
  }
  if (row.promotion_requested) {
    const at = row.promotion_requested_at
      ? new Date(row.promotion_requested_at).toLocaleDateString("de-DE")
      : null;
    return {
      kind: "requested",
      label: "Promotion angefragt",
      detail: at ? `Angefragt am ${at}, wird von UseEasy geprüft.` : "Wird von UseEasy geprüft.",
    };
  }
  if (row.promotion_ready) {
    return {
      kind: "ready",
      label: "Bereit zur nächsten Stufe",
      detail: "Alle drei Kriterien erfüllt.",
    };
  }
  const minSamples = gateNum(gate?.min_samples, MIN_SAMPLES);
  const samples = toNum(row.sample_count) ?? 0;
  if (samples < minSamples) {
    const pct = Math.max(0, Math.min(100, Math.round((samples / minSamples) * 100)));
    return {
      kind: "collecting",
      label: `Noch ${minSamples - samples} Mails bis zur Bewertung`,
      detail: `${samples} von ${minSamples} gesammelt (${pct} %).`,
    };
  }
  // Samples voll, aber (noch) nicht promotion_ready → entweder Quality-Gate verfehlt
  // oder der nächtliche Bewertungslauf war noch nicht dran.
  const fails: string[] = [];
  const mismatch = toNum(row.shadow_mismatch_rate);
  const edit = toNum(row.edit_rate);
  if (mismatch !== null && mismatch > gateNum(gate?.mismatch_rate_max, MISMATCH_RATE_MAX)) fails.push("Abweichung zu hoch");
  if (edit !== null && edit > gateNum(gate?.edit_rate_max, EDIT_RATE_MAX)) fails.push("Bearbeitungs-Quote zu hoch");
  if (fails.length > 0) {
    return { kind: "quality", label: "Quality-Gate verfehlt", detail: fails.join(" · ") };
  }
  return {
    kind: "eval_pending",
    label: "Bewertung ausstehend",
    detail: "Die nächtliche Auswertung aktualisiert den Status.",
  };
}
