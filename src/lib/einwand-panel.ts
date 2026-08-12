// -----------------------------------------------------------------------------
// einwand-panel.ts — das rechte Panel des Telefon-Modus als reiner Zustand.
//
// 🔴 Warum ausgerechnet das hier als reine Funktion steht: Leon hat zweimal
// woertlich betont, *"es gab riesige Probleme, dass Einwaende falsch geladen
// wurden bzw. immer wieder verschwanden. NICHTS von der bisherigen
// Funktionalitaet verlieren."* Genau diese Schicht ist im Master ueber vier
// Versionen (v1.21 bis v1.23) repariert worden, und jede Reparatur bestand
// darin, etwas WEGZUNEHMEN, nicht hinzuzufuegen:
//
//   E3  "die Antwort verschwindet, wenn ich sie brauche"  — vier Timer auf
//       Inhalt. Behoben in v1.22/F1-F3. 🔴 Content-Karten haben seither KEINEN
//       Auto-Hide. Der einzige verbliebene Timer im Cockpit ist der dekorative
//       Button-Puls und der 10-Sekunden-Nudge bei Keyword-Alerts — beides
//       NICHT Inhalt. Wer hier einen Timer auf Inhalt setzt, baut E3 neu.
//   E4  ein Einwand von vor Minuten erschien erneut — das Fenster war zu gross
//       und enthielt die eigene Stimme. Der Dedupe-Riegel hier ist die zweite
//       Haelfte der Gegenmassnahme.
//   E14 Chips, Pin, Dedupe und Bindung zeigten ins Leere, weil der `key` bei
//       JEDEM Speichern neu aus dem Label abgeleitet wurde. Deshalb ist der
//       `key` hier die EINZIGE Identitaet. Labels werden nur angezeigt.
//
// Kein React, kein Timer, keine Uhr: `jetzt` kommt immer von aussen herein.
// Ein Zustand, den man nicht anhalten kann, laesst sich auch nicht pruefen.
// -----------------------------------------------------------------------------
import type { Einwand, EinwandSatz } from "./copilot-config";

/** Aus dem Master v1.30 uebernommen (Z. 3097-3122). Nicht "aufgeraeumt". */
export const OBJ_DEDUPE_MS = 60000;
export const OBJ_CHIPS_MAX = 3;
export const VERLAUF_MAX = 10;

export type PanelZustand = {
  /** Der zuletzt ERKANNTE Einwand — die Erkennungsleiste. Ohne Timer. */
  erkannt: string | null;
  /** Die festgehaltene Antwort. Bleibt, bis Enter oder Haken. */
  gepinnt: string | null;
  /** Chip-Historie, neueste zuerst, hoechstens drei. */
  chips: string[];
  /** Einklappbarer Verlauf, neueste zuerst, hoechstens zehn. */
  verlauf: string[];
  /** Wann ein Schluessel zuletzt durchgelassen wurde — nur fuer den Riegel. */
  gesehen: Record<string, number>;
};

export const LEERES_PANEL: PanelZustand = {
  erkannt: null, gepinnt: null, chips: [], verlauf: [], gesehen: {},
};

const vorne = (liste: string[], key: string, max: number): string[] =>
  [key, ...liste.filter((k) => k !== key)].slice(0, max);

/**
 * Ein Einwand wurde im Transkript ERKANNT.
 *
 * 🔴 Der Riegel prueft drei Dinge, und alle drei standen so im Master
 * (`highlightObjection`, Z. 3181): steht der Schluessel schon als erkannt, ist
 * er gepinnt, oder liegt er noch keine 60 Sekunden zurueck? Dann passiert
 * NICHTS. Ohne diese drei Fragen erschien derselbe Einwand im Gespraech
 * mehrfach (E4) und schob die gerade gebrauchte Antwort aus dem Bild.
 */
export function erkannt(z: PanelZustand, key: string, jetzt: number): PanelZustand {
  if (!key) return z;
  if (z.erkannt === key) return z;
  if (z.gepinnt === key) return z;
  const zuletzt = z.gesehen[key];
  if (typeof zuletzt === "number" && jetzt - zuletzt < OBJ_DEDUPE_MS) return z;

  return {
    ...z,
    erkannt: key,
    chips: vorne(z.chips, key, OBJ_CHIPS_MAX),
    verlauf: vorne(z.verlauf, key, VERLAUF_MAX),
    gesehen: { ...z.gesehen, [key]: jetzt },
  };
}

/**
 * Der Vertriebler hat selbst gedrueckt — Taste oder Klick.
 *
 * 🔴 Ein Griff von Hand geht IMMER durch. Der Dedupe-Riegel gilt nur fuer die
 * Erkennung: wer die Antwort noch einmal sehen will, hat einen Grund, und ein
 * Riegel, der den Menschen aussperrt, ist ein Fehler.
 */
export function geklickt(z: PanelZustand, key: string, jetzt: number): PanelZustand {
  if (!key) return z;
  return {
    ...z,
    erkannt: key,
    gepinnt: key,
    chips: vorne(z.chips, key, OBJ_CHIPS_MAX),
    verlauf: vorne(z.verlauf, key, VERLAUF_MAX),
    gesehen: { ...z.gesehen, [key]: jetzt },
  };
}

/** Enter oder Haken: erledigt. Der Pin geht weg, sonst bleibt alles stehen. */
export function bestaetigt(z: PanelZustand): PanelZustand {
  if (!z.gepinnt) return z;
  return { ...z, gepinnt: null };
}

/**
 * Der Einwand-Satz hat gewechselt, weil das Skript gewechselt hat.
 *
 * 🔴 Die Regel aus dem v1.22-Umbau, woertlich: "Pin ueberlebt den Set-Wechsel,
 * Chips ohne passenden Key nicht." Der Pin ist das, was der Vertriebler gerade
 * VOR SICH hat — den darf ein Wechsel im Hintergrund nicht wegreissen. Die
 * Chips dagegen sind Verweise auf Antworten; zeigt ein Verweis nach dem
 * Wechsel ins Leere, muss er verschwinden statt beim Klick nichts zu tun.
 */
export function satzGewechselt(z: PanelZustand, neuerSatz: EinwandSatz | null): PanelZustand {
  const gueltig = new Set((neuerSatz?.objections ?? []).map((o) => o.key));
  return {
    ...z,
    erkannt: z.erkannt && gueltig.has(z.erkannt) ? z.erkannt : null,
    gepinnt: z.gepinnt,
    chips: z.chips.filter((k) => gueltig.has(k)),
    verlauf: z.verlauf.filter((k) => gueltig.has(k)),
    gesehen: z.gesehen,
  };
}

/** Neues Gespraech: alles auf Anfang, auch der Riegel. */
export function gespraechBeendet(): PanelZustand {
  return LEERES_PANEL;
}

// ── Nachschlagen ─────────────────────────────────────────────────────────────

/**
 * Ein Schluessel wird zur anzeigbaren Karte.
 *
 * Gibt `null` zurueck, wenn der Schluessel im aktuellen Satz nicht vorkommt.
 * 🔴 Bewusst kein Rueckfall auf "irgendeinen" Einwand: eine falsche Antwort im
 * Gespraech ist schlimmer als keine.
 */
export function karte(satz: EinwandSatz | null, key: string | null): Einwand | null {
  if (!satz || !key) return null;
  return satz.objections.find((o) => o.key === key) ?? null;
}

/**
 * Welche Taste gehoert zu welchem Einwand.
 *
 * 🔴 Doppelt belegte Tasten werden NICHT stillschweigend entwirrt: der erste
 * Eintrag gewinnt, der zweite bleibt ohne Taste und `befundeAmStand` meldet
 * die Kollision. Automatisches Umlegen wuerde die Belegung unter den Fingern
 * des Vertrieblers veraendern.
 */
export function tastenBelegung(satz: EinwandSatz | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of satz?.objections ?? []) {
    const t = (o.hotkey || "").toUpperCase();
    if (!t || m.has(t)) continue;
    m.set(t, o.key);
  }
  return m;
}

/**
 * Welche Taste hat der Mensch gedrueckt?
 *
 * 🔴 Enter statt Leertaste bestaetigt — so steht es im Master und so sitzt es
 * in den Fingern. Die Leertaste bleibt frei, weil sie im Browser scrollt.
 * Tasten mit Zusatzmodifikator gehoeren dem Betriebssystem, nicht uns, und ein
 * Tippfeld faengt jede Taste selbst ab.
 */
export function tasteAus(e: {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}): { art: "bestaetigen" } | { art: "einwand"; taste: string } | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = (e.target?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return null;
  if (e.key === "Enter") return { art: "bestaetigen" };
  const t = (e.key || "").toUpperCase();
  if (t.length !== 1) return null;
  if (!/[0-9A-Z]/.test(t)) return null;
  return { art: "einwand", taste: t };
}
