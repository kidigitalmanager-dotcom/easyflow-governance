import type { CustomerSegment, SegmentDefaultsMap } from "./types";
import raw from "./fixtures/segment-defaults.json";

/**
 * SEGMENT_DEFAULTS steuert Startansicht, Standard-Spalten und Standard-Sortierung
 * je Kundengruppe - und sonst nichts. Der Datenumfang haengt allein am tenant_type.
 * Eine Konstante, kein Fork: Kreditversicherer, Factoring und alternative
 * Kreditgeber teilen sich dieselbe Codebasis.
 */
/**
 * Die vier Verhaltenssignale sind der Grund, warum ein Versicherer dieses
 * Produkt kauft. Sie gehoeren deshalb in die Standardspalten - und zwar je
 * Kundengruppe unterschiedlich, weil sie unterschiedliche Fragen beantworten.
 * Reihenfolge und Voreinstellung, nie der Datenumfang.
 */
const BEHAVIOUR_COLUMNS: Record<CustomerSegment, string[]> = {
  // Entscheidet ueber Kreditlimits: zahlt er, und wie schnell eskaliert es.
  credit_insurer: ["beh_promise_break", "beh_escalation_speed"],
  // Kauft einzelne Forderungen: besteht die Forderung, zahlt der Debitor.
  factoring: ["beh_early_dispute", "beh_promise_break"],
  // Ueberwacht Covenants: Liquiditaet zuerst, Verhalten als Ergaenzung.
  alternative_lender: ["beh_creditor_silence"],
};

function withBehaviour(seg: CustomerSegment, d: SegmentDefaultsMap[CustomerSegment]) {
  const extra = BEHAVIOUR_COLUMNS[seg].filter((k) => !d.columns.includes(k));
  // Hinter den Score, vor die Ehrlichkeits-Spalten.
  const at = Math.max(d.columns.indexOf("band") + 1, 1);
  return { ...d, columns: [...d.columns.slice(0, at), ...extra, ...d.columns.slice(at)] };
}

export const SEGMENT_DEFAULTS: SegmentDefaultsMap = {
  credit_insurer: withBehaviour("credit_insurer", (raw as any).credit_insurer),
  factoring: withBehaviour("factoring", (raw as any).factoring),
  alternative_lender: withBehaviour("alternative_lender", (raw as any).alternative_lender),
};

export const SEGMENT_ORDER: CustomerSegment[] = ["credit_insurer", "factoring", "alternative_lender"];

export function segmentDefaults(seg: CustomerSegment): SegmentDefaultsMap[CustomerSegment] {
  return SEGMENT_DEFAULTS[seg] ?? SEGMENT_DEFAULTS.credit_insurer;
}

/** Spalten, die in keiner Ansicht ausblendbar sind. Haftungsschutz, kein Purismus. */
export const LOCKED_COLUMNS = ["name", "health_score", "confidence", "coverage", "freshness"] as const;
export function isLockedColumn(key: string): boolean {
  return (LOCKED_COLUMNS as readonly string[]).includes(key);
}
