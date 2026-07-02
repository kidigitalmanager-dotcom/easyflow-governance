// ─────────────────────────────────────────────────────────────────────────────
// Alert-Qualitäts-Schicht (reine Anzeige-Logik, KEIN Engine-/DB-Touch)
// ─────────────────────────────────────────────────────────────────────────────
// Doppelt kalibrierter Befund aus zwei unabhängigen historischen Backtests
// (Chat D 2026-07-02: 53 Fälle · Seriositäts-Lauf 2026-07-03: 44 Fälle):
// Roh-Alerts der Start-Spezifikation feuern auf echtem Proxy-Rauschen auch bei
// gesunden Firmen (88-95 % False-Positives). Der wirksamste Hebel ist KEINE
// Engine-Änderung, sondern eine Konsumenten-Regel: ein Alarm gilt erst als
// „bestätigt", wenn er KRITISCH ist UND über mindestens zwei aufeinander-
// folgende Monatsläufe bestehen bleibt (Debounce; FP-Reduktion im Backtest
// 86→9 % bzw. auf 7,7 %). Alles andere ist „Beobachtung".
//
// Persistenz-Messung auf Live-Daten (beide Wege, robust gegen nachlaufende
// Serien und Demo-Seeds mit historischen Perioden):
//   a) Monats-Roll: der Alert-Bezugsmonat (period) liegt ≥1 Monat nach dem
//      Monat der Erst-Erkennung → der Alarm hat mindestens einen neuen
//      Daten-Monat überlebt.
//   b) Halte-Dauer: seit ≥28 Tagen offen und weiter re-evaluiert → der Alarm
//      hat mehrere wöchentliche Collector-Updates + tägliche Engine-Läufe
//      überlebt (Interims-Äquivalent, solange die Live-Historie jung ist).
export type AlertTier = "confirmed" | "watch";

export type AlertQualityInput = {
  severity: string;
  status: string;
  period: string;              // 'YYYY-MM-DD' (Monatsbezug der Bewertung)
  first_detected_at: string;   // timestamptz
  last_evaluated_at?: string | null;
};

export type AlertQuality = {
  tier: AlertTier;
  monthRolls: number;          // Monatswechsel zwischen Erst-Erkennung und Bezugsmonat
  daysHeld: number;            // Tage seit Erst-Erkennung
  heldLabelDe: string;         // „hält seit …"
};

export function ymIndex(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
}

export function monthRolls(periodIso: string, firstDetectedIso: string): number {
  if (!periodIso || !firstDetectedIso) return 0;
  return ymIndex(periodIso) - ymIndex(firstDetectedIso);
}

export function daysHeld(firstDetectedIso: string, now: Date = new Date()): number {
  const t = Date.parse(firstDetectedIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

export const CONFIRM_MIN_MONTH_ROLLS = 1;   // = „2 aufeinanderfolgende Monatsläufe" (Erst-Fire + 1)
export const CONFIRM_MIN_DAYS_HELD = 28;    // Interims-Äquivalent auf junger Live-Historie

export function classifyAlert(a: AlertQualityInput, now: Date = new Date()): AlertQuality {
  const rolls = monthRolls(a.period, a.first_detected_at);
  const days = daysHeld(a.first_detected_at, now);
  const persisted = rolls >= CONFIRM_MIN_MONTH_ROLLS || days >= CONFIRM_MIN_DAYS_HELD;
  const confirmed = a.status === "open" && a.severity === "critical" && persisted;
  const heldLabelDe =
    rolls >= 1
      ? `hält seit ${rolls + 1} Monatsläufen`
      : days >= 1
        ? `hält seit ${days} Tag${days === 1 ? "" : "en"}`
        : "neu";
  return { tier: confirmed ? "confirmed" : "watch", monthRolls: rolls, daysHeld: days, heldLabelDe };
}

export function splitAlerts<T extends AlertQualityInput>(
  alerts: T[],
  now: Date = new Date(),
): { confirmed: T[]; watch: T[]; qualityById: Map<T, AlertQuality> } {
  const confirmed: T[] = [];
  const watch: T[] = [];
  const qualityById = new Map<T, AlertQuality>();
  for (const a of alerts) {
    const q = classifyAlert(a, now);
    qualityById.set(a, q);
    (q.tier === "confirmed" ? confirmed : watch).push(a);
  }
  return { confirmed, watch, qualityById };
}
