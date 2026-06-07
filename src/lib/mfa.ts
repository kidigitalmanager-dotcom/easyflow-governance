/**
 * mfa.ts — pure Helfer für die Supabase-TOTP-MFA (v2026-06: Paket A).
 *
 * REGRESSIONS-GARANTIE: needsMfaChallenge(aal1, aal1) === false →
 * User OHNE eingerichteten Faktor verhalten sich zu 100 % wie vor dem Feature
 * (sofortiger Redirect, kein Code-Screen). Nur wer einen verifizierten Faktor
 * hat (nextLevel aal2, currentLevel noch aal1), bekommt die Code-Abfrage.
 */

export type AalLevel = "aal1" | "aal2" | null | undefined;

/** true NUR wenn die Session auf aal2 hochgestuft werden muss (Faktor vorhanden, Code fehlt noch). */
export function needsMfaChallenge(currentLevel: AalLevel, nextLevel: AalLevel): boolean {
  return nextLevel === "aal2" && currentLevel !== "aal2";
}

export interface TotpFactorLike {
  id: string;
  status?: string;
  factor_type?: string;
  friendly_name?: string | null;
  created_at?: string;
}

/** Erster VERIFIZIERTER TOTP-Faktor — unverifizierte (abgebrochene) Enrollments blockieren nie. */
export function pickVerifiedTotpFactor<T extends TotpFactorLike>(
  factors: T[] | null | undefined
): T | null {
  if (!Array.isArray(factors)) return null;
  return factors.find((f) => f.status === "verified") ?? null;
}

/** Unverifizierte Faktoren (hängengebliebene Enrollments) — Kandidaten fürs Aufräumen vor einem neuen Enroll. */
export function listUnverifiedFactors<T extends TotpFactorLike>(
  factors: T[] | null | undefined
): T[] {
  if (!Array.isArray(factors)) return [];
  return factors.filter((f) => f.status !== "verified");
}
