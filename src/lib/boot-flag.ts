/**
 * Redesign 27.07.2026 (§7.2) — Schluessel fuer die Boot-Sequenz.
 *
 * Bewusst ein eigenes Modul ohne Abhaengigkeiten: der AuthProvider setzt das
 * Flag, die BootSequence verbraucht es. Wuerde der AuthProvider direkt aus
 * BootSequence.tsx importieren, entstuende ein Import-Zyklus
 * (AuthContext -> BootSequence -> use-api -> AuthContext).
 */
export const BOOT_FLAG = "ue_boot_pending";

/**
 * Kam dieser Seitenaufruf von einem OAuth-Rücksprung (Google/Microsoft)?
 *
 * Wird EINMAL beim Laden des Moduls ausgewertet — supabase-js räumt Hash und
 * Query beim Initialisieren auf, danach wäre die Information weg. Eine
 * wiederhergestellte Sitzung hat diese Parameter nie, ein frischer OAuth-Login
 * immer. Genau daran unterscheiden wir die beiden Fälle.
 */
const OAUTH_RETURN = (() => {
  if (typeof window === "undefined") return false;
  try {
    return /[#&?](access_token|code)=/.test(window.location.hash + window.location.search);
  } catch {
    return false;
  }
})();

export function isOAuthReturn(): boolean {
  return OAUTH_RETURN;
}

/** Setzt das Flag (Login erfolgreich). Storage-Fehler sind egal. */
export function armBootSequence(): void {
  try {
    sessionStorage.setItem(BOOT_FLAG, "1");
  } catch {
    /* Private Mode / blockierter Storage → dann eben ohne Sequenz. */
  }
}

/** Loescht das Flag (Abmelden). */
export function disarmBootSequence(): void {
  try {
    sessionStorage.removeItem(BOOT_FLAG);
  } catch {
    /* egal */
  }
}

/** Liest das Flag und loescht es sofort — genau ein Durchlauf pro Login. */
export function consumeBootSequence(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(BOOT_FLAG) !== "1") return false;
    sessionStorage.removeItem(BOOT_FLAG);
    return true;
  } catch {
    return false;
  }
}
