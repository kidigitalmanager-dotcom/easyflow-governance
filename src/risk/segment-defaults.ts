import type { CustomerSegment, SegmentDefaultsMap } from "./types";
import raw from "./fixtures/segment-defaults.json";

/**
 * SEGMENT_DEFAULTS steuert Startansicht, Standard-Spalten und Standard-Sortierung
 * je Kundengruppe - und sonst nichts. Der Datenumfang haengt allein am tenant_type.
 * Eine Konstante, kein Fork: Kreditversicherer, Factoring und alternative
 * Kreditgeber teilen sich dieselbe Codebasis.
 */
export const SEGMENT_DEFAULTS: SegmentDefaultsMap = {
  credit_insurer: (raw as any).credit_insurer,
  factoring: (raw as any).factoring,
  alternative_lender: (raw as any).alternative_lender,
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
