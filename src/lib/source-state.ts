/**
 * Zustand einer Datenquelle in der Quellen-Liste (Signale → Datenquellen).
 *
 * Warum es das gibt (Leon, 27.07.2026): die Liste zeigte bisher NUR, ob eine
 * Quelle schon 0–100-Werte geliefert hat (`provenance.sources_used` der
 * Kennzahlen im Capital-Projekt). Ob sie überhaupt VERBUNDEN ist, stand allein
 * in der jeweiligen Connect-Karte. Ergebnis: HubSpot war unter „Integrationen"
 * verbunden und stand unter „Datenquellen" trotzdem auf grau — zwei
 * verschiedene Wahrheiten an einem Ort, ohne dass man den Unterschied sieht.
 *
 * Gemessen am 27.07.2026: über ALLE Konten der letzten zehn Tage tauchen in
 * `sources_used` nur `comms_inbox` und `gdelt_bigquery` auf. Kein einziges Mal
 * stripe/shopify/hubspot_crm/finapi/maesn/meta_ads/ticketing. Die Verbindungen
 * bestehen — sie haben nur noch nichts geliefert (Stripe braucht ≥3 Monate
 * Abo-Historie, Shopify bekommt 403 ohne Protected-Customer-Data-Freigabe, der
 * Rollup läuft einmal täglich um 02:30 UTC).
 *
 * Deshalb jetzt drei getrennte Zustände statt zwei. Erfunden wird nichts:
 * `connected` kommt aus dem jeweiligen Status-Endpunkt der Quelle, `delivering` aus
 * den Kennzahlen. Ist beides unbekannt, sagen wir das (`unknown`).
 */

export type SourceState = "active" | "connected" | "idle" | "manual" | "unknown";

export interface SourceStateInput {
  /** Quelle wird per Hand gefüttert (Datei-Upload) — kennt keinen Verbindungszustand. */
  manual?: boolean;
  /** Connector meldet eine bestehende Verbindung. `undefined` = noch nicht geladen. */
  connected?: boolean;
  /** Quelle liefert bereits Kennzahlen (aus `provenance.sources_used`). */
  delivering?: boolean;
  /** Kennzahlen sind geladen. Solange `false`, ist `delivering` nicht aussagekräftig. */
  metricsKnown?: boolean;
}

/**
 * Reihenfolge ist bewusst: liefert schlägt verbunden schlägt „noch nichts".
 * Eine Quelle, die Werte liefert, IST verbunden — auch wenn ihr Status-Endpunkt
 * gerade nicht antwortet. Andersherum gilt das nicht.
 */
export function deriveSourceState(i: SourceStateInput): SourceState {
  if (i.manual) return "manual";
  if (i.metricsKnown && i.delivering) return "active";
  if (i.connected === true) return "connected";
  if (i.connected === false || i.metricsKnown) return "idle";
  return "unknown";
}

const LABELS: Record<SourceState, { short: string; title: string }> = {
  active: {
    short: "liefert Signale",
    title: "Verbunden und liefert bereits Kennzahlen.",
  },
  connected: {
    short: "verbunden",
    title:
      "Verbunden, aber noch keine Kennzahlen. Die Auswertung läuft einmal täglich; " +
      "manche Quellen brauchen zusätzlich genug Historie.",
  },
  idle: {
    short: "nicht verbunden",
    title: "Noch nicht verbunden — hier klicken zum Verbinden.",
  },
  manual: {
    short: "manuell",
    title: "Wird per Datei-Upload gefüttert, kennt keinen Verbindungszustand.",
  },
  unknown: {
    short: "–",
    title: "Zustand wird geladen.",
  },
};

export function sourceStateLabel(s: SourceState): string {
  return LABELS[s].short;
}

export function sourceStateTitle(s: SourceState): string {
  return LABELS[s].title;
}

/** Zählt für die „x/y verbunden"-Anzeige. `manual` zählt nicht mit. */
export function countsAsConnected(s: SourceState): boolean {
  return s === "active" || s === "connected";
}

/**
 * Aus einem Connector-Status-String („connected", „reauth_required", …) den
 * Verbindungszustand ableiten. `reauth_required` und `permission_required`
 * gelten als verbunden — die Verbindung steht, es fehlt eine Freigabe.
 * Das ist ehrlicher als grau, denn „nicht verbunden" wäre schlicht falsch.
 */
const CONNECTED_STATES = new Set([
  "connected",
  "reauth_required",
  "permission_required",
  "active",
]);

export function isConnectedStatus(status: string | null | undefined): boolean | undefined {
  if (status == null) return undefined;
  const s = String(status).trim().toLowerCase();
  if (!s) return undefined;
  return CONNECTED_STATES.has(s);
}
