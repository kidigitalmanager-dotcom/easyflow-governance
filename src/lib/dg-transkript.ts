// -----------------------------------------------------------------------------
// dg-transkript.ts — was aus einer Deepgram-Nachricht wird.
//
// Diese Schicht entscheidet drei Dinge, und jedes davon war schon einmal die
// Ursache eines Ausfalls:
//
//   1. WER hat gesprochen. Bei Stereo kommt das aus `channel_index`:
//      0 = Vertriebler, 1 = Kunde. Ohne `multichannel=true` bleibt der Index
//      immer 0 und alles klingt nach dem Vertriebler.
//   2. Welche Aeusserungen in das Klassifikations-FENSTER wandern. 🔴 E4: das
//      Fenster war `txFull.slice(-700)` und enthielt die eigene Stimme, worauf
//      ein Einwand von vor Minuten erneut erschien. Es sind die letzten ZWEI
//      finalen KUNDEN-Aeusserungen, sonst nichts.
//   3. Ob eine Zeile als unsicher gilt (Konfidenz unter 0.55). Angezeigt wird
//      sie trotzdem — ausgrauen ja, verschweigen nein.
// -----------------------------------------------------------------------------

export type Sprecher = "kunde" | "rep" | null;

export type Zeile = {
  text: string;
  sprecher: Sprecher;
  /** true = Deepgram ist sich unsicher. Wird ausgegraut, nicht verschluckt. */
  unsicher: boolean;
};

export type DgErgebnis =
  | { art: "nichts" }
  | { art: "zwischenstand"; zeile: Zeile }
  | { art: "final"; zeile: Zeile };

/** Ab hier gilt eine Erkennung als wacklig (v1.16f). */
export const KONFIDENZ_SCHWELLE = 0.55;
/** 🔴 Das Klassifikations-Fenster: die letzten ZWEI Kunden-Aeusserungen. */
export const FENSTER = 2;

type DgNachricht = {
  type?: string;
  is_final?: boolean;
  channel_index?: number[];
  channel?: { alternatives?: Array<{ transcript?: string; confidence?: number }> };
};

/**
 * Eine Deepgram-Nachricht deuten.
 *
 * `stereo` sagt, ob `channel_index` ueberhaupt etwas bedeutet. Bei Mono bleibt
 * der Sprecher `null` — geraten wird nicht.
 */
export function deute(roh: unknown, stereo: boolean): DgErgebnis {
  const d = roh as DgNachricht | null;
  if (!d || d.type !== "Results") return { art: "nichts" };
  const alt = d.channel?.alternatives?.[0];
  const text = String(alt?.transcript ?? "").trim();
  if (!text) return { art: "nichts" };

  const idx = Array.isArray(d.channel_index) ? (d.channel_index[0] || 0) : 0;
  const sprecher: Sprecher = stereo ? (idx === 1 ? "kunde" : "rep") : null;
  const konf = alt?.confidence;
  const zeile: Zeile = {
    text,
    sprecher,
    unsicher: typeof konf === "number" && konf < KONFIDENZ_SCHWELLE,
  };
  return d.is_final ? { art: "final", zeile } : { art: "zwischenstand", zeile };
}

/**
 * Das Fenster fuer die Einwand-Erkennung fortschreiben.
 *
 * 🔴 Nur KUNDEN-Aeusserungen, und nur finale. Bei Mono zaehlt alles, weil man
 * dort nicht unterscheiden kann — das ist schlechter, aber ehrlich, und der
 * Master macht es genauso.
 */
export function fensterFort(bisher: string[], zeile: Zeile, stereo: boolean): string[] {
  if (stereo && zeile.sprecher !== "kunde") return bisher;
  return [...bisher, zeile.text].slice(-FENSTER);
}

/**
 * Was der Klassifikator zu sehen bekommt. Leer = es gibt nichts zu erkennen.
 *
 * Verbunden mit Zeilenumbruch, wie im Master (`custFinals.slice(-2).join('\\n')`).
 * Zwei Aeusserungen in einer Zeile lesen sich fuer das Modell wie ein Satz.
 *
 * 🔴 Der Master hat hier noch einen Rueckfall auf `txFull.slice(-400)`, wenn
 * das Fenster leer ist. Der ist bewusst NICHT mitgezogen: leer heisst, der
 * Kunde hat noch nichts Finales gesagt — der Rueckfall enthielte dann
 * ausschliesslich die eigene Stimme. Genau das war E4. Es geht dabei nichts
 * verloren: bei Mono fuellt sich das Fenster ohnehin mit jeder Aeusserung,
 * bei Stereo greift der Rueckfall nur in den Sekunden vor dem ersten
 * Kundensatz — dort gibt es nichts zu erkennen ausser uns selbst.
 */
export function fensterText(fenster: string[]): string {
  return fenster.join("\n").trim();
}

/**
 * Der sichtbare Verlauf. Deckel bei 100 Zeilen wie im Master — ein Gespraech
 * soll den Browser nicht vollaufen lassen.
 */
export const VERLAUF_DECKEL = 100;

export function verlaufFort(bisher: Zeile[], zeile: Zeile): Zeile[] {
  return [...bisher, zeile].slice(-VERLAUF_DECKEL);
}

/** Beschriftung fuer die Anzeige. `repName` ist der ECHTE Name, nicht "Rep". */
export function sprecherName(s: Sprecher, repName?: string | null): string {
  if (s === "kunde") return "Kunde";
  if (s === "rep") return repName?.trim() || "Ich";
  return "";
}
