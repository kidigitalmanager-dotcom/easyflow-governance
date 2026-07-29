// ---------------------------------------------------------------------------
// Befund 3, 29.07.2026: „die Vorschlaege sind so cremig gelb-grau“.
//
// Das war keine Geschmacksfrage, sondern ein toter Klassenname. Die Console
// laeuft in EINEM dunklen Design: tailwind.config.ts steht auf
// darkMode: ["class"], die dunkle Palette liegt aber in `:root`, und niemand
// setzt jemals die Klasse `dark` auf <html>. Damit ist jede `dark:`-Variante
// wirkungslos — was uebrig bleibt, ist die HELLE Basis-Klasse davor. Genau so
// wurde aus `bg-amber-50/50 dark:bg-amber-950/20` ein cremiger Fleck auf
// dunklem Grund.
//
// Dieser Test ist bewusst statisch: er liest den Quelltext. Ein Render-Test
// haette den Fehler nicht gefunden, weil im Browser ja alles „funktioniert“ —
// nur eben falsch aussieht. Und er ist eine Sperre nach vorn: die naechste
// Person, die aus Gewohnheit `dark:` schreibt, faellt hier auf.
//
// Kommt die Console eines Tages auf zwei Designs, gehoert dieser Test
// geloescht — zusammen mit der Umstellung, nicht davor.
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WURZEL = join(__dirname, "..");

/* Fremd-Bausteine aus shadcn/ui bringen `dark:`-Varianten mit. Sie sind dort
   wirkungslos, aber harmlos und wuerden bei jedem Update wieder auftauchen —
   deshalb ausgenommen. Eigener Code hat die Ausnahme nicht. */
const AUSGENOMMEN = ["components/ui/"];

function dateien(dir: string, out: string[] = []): string[] {
  for (const eintrag of readdirSync(dir)) {
    const pfad = join(dir, eintrag);
    if (statSync(pfad).isDirectory()) {
      dateien(pfad, out);
    } else if (/\.tsx$/.test(eintrag) && !/\.test\.tsx$/.test(eintrag)) {
      out.push(pfad);
    }
  }
  return out;
}

/** Zeilen ohne Kommentare — sonst schlaegt die Erklaerung des Fehlers selbst an. */
function codeZeilen(inhalt: string): { nr: number; text: string }[] {
  const raus: { nr: number; text: string }[] = [];
  let imBlock = false;
  inhalt.split("\n").forEach((zeile, i) => {
    let t = zeile;
    if (imBlock) {
      const ende = t.indexOf("*/");
      if (ende === -1) return;
      t = t.slice(ende + 2);
      imBlock = false;
    }
    const start = t.indexOf("/*");
    if (start !== -1) {
      const ende = t.indexOf("*/", start + 2);
      if (ende === -1) { t = t.slice(0, start); imBlock = true; }
      else t = t.slice(0, start) + t.slice(ende + 2);
    }
    const zeilenKommentar = t.indexOf("//");
    if (zeilenKommentar !== -1) t = t.slice(0, zeilenKommentar);
    if (t.trim()) raus.push({ nr: i + 1, text: t });
  });
  return raus;
}

const QUELLEN = dateien(WURZEL)
  .filter((p) => !AUSGENOMMEN.some((a) => relative(WURZEL, p).startsWith(a)))
  .map((p) => ({ pfad: relative(WURZEL, p), zeilen: codeZeilen(readFileSync(p, "utf8")) }));

describe("Design: ein Theme, keine toten Varianten", () => {
  it("findet ueberhaupt Quelldateien (sonst prueft der Test nichts)", () => {
    expect(QUELLEN.length).toBeGreaterThan(50);
  });

  it("benutzt keine `dark:`-Varianten — sie greifen in dieser Console nie", () => {
    const treffer: string[] = [];
    for (const { pfad, zeilen } of QUELLEN) {
      for (const { nr, text } of zeilen) {
        if (/\bdark:[a-z[]/.test(text)) treffer.push(`${pfad}:${nr}`);
      }
    }
    expect(treffer).toEqual([]);
  });

  it("benutzt keine hellen Flaechen aus der Roh-Palette", () => {
    // 50/100/200 sind Hell-Toene. Auf dem dunklen Grund der Console ergeben
    // sie den cremigen Fleck, den der Kunde gemeldet hat. Fuer Flaechen gibt
    // es die Tokens --amber-surface / --emerald-surface, fuer alles andere
    // halbtransparente Varianten (bg-amber-500/10).
    const treffer: string[] = [];
    for (const { pfad, zeilen } of QUELLEN) {
      for (const { nr, text } of zeilen) {
        const m = text.match(/\bbg-(amber|yellow|orange|green|emerald|blue|red|rose|slate|gray|zinc|stone|neutral)-(50|100|200)\b/);
        if (m) treffer.push(`${pfad}:${nr} (${m[0]})`);
      }
    }
    expect(treffer).toEqual([]);
  });

  it("benutzt keine dunklen Schriftfarben aus der Roh-Palette", () => {
    // Gegenstueck zur Flaeche: text-amber-800 auf dunklem Grund ist praktisch
    // unlesbar. 700/800/900 gehoeren zu hellen Designs.
    const treffer: string[] = [];
    for (const { pfad, zeilen } of QUELLEN) {
      for (const { nr, text } of zeilen) {
        const m = text.match(/\btext-(amber|yellow|orange|green|emerald|blue|red|rose|slate|gray|zinc|stone|neutral)-(700|800|900)\b/);
        if (m) treffer.push(`${pfad}:${nr} (${m[0]})`);
      }
    }
    expect(treffer).toEqual([]);
  });
});
