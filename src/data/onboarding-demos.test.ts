import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMOS, DEMO_ORDER, getDemo, TOUR_STEPS } from "./onboarding-content";
import { ADDONS } from "@/lib/consoleCatalog";

/**
 * Katalog-Test der gefuehrten Durchlaeufe.
 *
 * Anlass (06.08.2026, Leon): im Onboarding fehlten Buchhaltung,
 * Compliance-Radar, Voice und die Beratung durch Jana selbst komplett. Der
 * Katalog kannte nur E-Mail-Themen. Dieser Test haelt zwei Dinge fest, die
 * still kaputtgehen koennen:
 *   1. `requiresKey` muss ein echter lookup_key aus consoleCatalog sein. Ein
 *      Tippfehler wuerde die Hinweiszeile lautlos verschwinden lassen, und der
 *      Kunde stuende vor einem Durchlauf, den er nicht nutzen kann, ohne zu
 *      erfahren warum.
 *   2. Jede `route` muss eine Route sein, die es gibt. Ein Durchlauf, der auf
 *      eine 404 navigiert, ist schlimmer als kein Durchlauf.
 */

// Die Routen aus src/App.tsx, ohne Platzhalter und Admin-Bereich.
const ECHTE_ROUTEN = new Set([
  "/", "/review", "/audit", "/buchhaltung", "/forderungen", "/rechnungen",
  "/verbindlichkeiten", "/angebote", "/mitarbeiter", "/zeiterfassung",
  "/signale", "/fruehwarnung", "/chancen", "/playbooks", "/datenquellen",
  "/voice", "/einstellungen", "/onboarding", "/connect", "/investoren", "/willkommen",
]);

describe("Onboarding-Durchlaeufe: Katalog", () => {
  it("es gibt zehn Durchlaeufe, jeder mit eindeutigem Slug", () => {
    expect(DEMOS.length).toBe(10);
    const slugs = DEMOS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(DEMO_ORDER).toEqual(slugs);
  });

  it("die vier am 06.08. ergaenzten Durchlaeufe sind da", () => {
    for (const slug of ["jana-fragen", "buchhaltung-belege", "compliance-radar", "voice-jana"]) {
      expect(getDemo(slug), `Durchlauf ${slug} fehlt`).toBeDefined();
    }
  });

  it("jeder Durchlauf hat Titel, Zusammenfassung, Dauer, Symbol und mindestens zwei Schritte", () => {
    for (const d of DEMOS) {
      expect(d.title.length, d.slug).toBeGreaterThan(10);
      expect(d.summary.length, d.slug).toBeGreaterThan(20);
      expect(d.durationMin, d.slug).toBeGreaterThan(0);
      expect(d.durationMin, d.slug).toBeLessThanOrEqual(10);
      expect(d.icon, d.slug).toBeTruthy();
      expect(d.steps.length, d.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("Schritt-Schluessel sind innerhalb eines Durchlaufs eindeutig", () => {
    for (const d of DEMOS) {
      const keys = d.steps.map((s) => s.key);
      expect(new Set(keys).size, d.slug).toBe(keys.length);
    }
  });

  it("jeder Durchlauf startet mit einem Schritt, der eine Route ansteuert", () => {
    // Sonst beginnt die Erklaerung auf der Seite, auf der man gerade zufaellig steht.
    for (const d of DEMOS) {
      expect(d.steps[0].route, `${d.slug}: erster Schritt ohne route`).toBeTruthy();
    }
  });

  it("🔴 jede route existiert wirklich (sonst navigiert ein Durchlauf in eine 404)", () => {
    for (const d of DEMOS) {
      for (const s of d.steps) {
        if (!s.route) continue;
        const pfad = s.route.split("?")[0];
        expect(ECHTE_ROUTEN.has(pfad), `${d.slug}/${s.key}: Route ${pfad} gibt es nicht`).toBe(true);
      }
    }
  });
});

/**
 * Alle `data-tour="..."`-Anker, die im Quellbaum tatsaechlich existieren.
 *
 * 🔴 Warum am Dateisystem und nicht an einer gepflegten Liste: eine gepflegte
 * Liste ist wieder eine zweite Wahrheit, die genau dann nicht mitgezogen wird,
 * wenn ein Anker umbenannt oder entfernt wird. Der Baum ist die Wahrheit.
 */
function ankerImQuellbaum(): Set<string> {
  const gefunden = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!name.endsWith(".tsx")) continue;
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/data-tour="([a-z0-9-]+)"/gi)) gefunden.add(m[1]);
    }
  };
  walk(join(process.cwd(), "src"));
  return gefunden;
}

describe("Onboarding-Durchlaeufe: Hervorhebung", () => {
  /**
   * Der Fund vom 06.08.2026: die vier neuen Durchlaeufe hatten KEIN `target`.
   * Der Runner hebt dann nichts hervor und dimmt nur die ganze Seite, waehrend
   * die alten Durchlaeufe die besprochene Stelle einrahmen. Der Unterschied ist
   * sofort sichtbar, aber kein Test hat ihn gemeldet. Jetzt schon.
   */
  it("🔴 jeder Schritt der vier neuen Durchlaeufe hebt etwas hervor (ausser dem Schluss-Schritt)", () => {
    for (const slug of ["jana-fragen", "buchhaltung-belege", "compliance-radar", "voice-jana"]) {
      const d = getDemo(slug)!;
      const ohne = d.steps.filter((s) => !s.target).map((s) => s.key);
      // Konvention im Bestand: der letzte Schritt darf eine reine Aussage sein
      // (wie "xl-safe" oder "ap-safe"), alles davor zeigt auf eine Stelle.
      expect(ohne.length, `${slug}: Schritte ohne target: ${ohne.join(", ")}`).toBeLessThanOrEqual(1);
      if (ohne.length === 1) {
        expect(ohne[0], `${slug}: nur der LETZTE Schritt darf ohne target sein`).toBe(d.steps[d.steps.length - 1].key);
      }
    }
  });

  it("🔴 jedes target existiert als data-tour-Anker im Quellbaum", () => {
    const anker = ankerImQuellbaum();
    expect(anker.size, "keine Anker gefunden, der Scan laeuft im falschen Verzeichnis").toBeGreaterThan(10);
    for (const d of DEMOS) {
      for (const s of d.steps) {
        if (!s.target) continue;
        expect(anker.has(s.target), `${d.slug}/${s.key}: data-tour="${s.target}" gibt es nirgends im Quellbaum`).toBe(true);
      }
    }
  });

  it("auch die alte Signale-Tour zeigt nur auf Anker, die es gibt", () => {
    const anker = ankerImQuellbaum();
    for (const s of TOUR_STEPS) {
      if (!s.target) continue;
      expect(anker.has(s.target), `Tour-Schritt ${s.key}: data-tour="${s.target}" fehlt`).toBe(true);
    }
  });
});

describe("Onboarding-Durchlaeufe: Kopplung an den Produktkatalog", () => {
  it("🔴 jeder requiresKey ist ein echter lookup_key aus consoleCatalog", () => {
    const bekannt = new Set(ADDONS.map((a) => a.key));
    for (const d of DEMOS) {
      if (!d.requiresKey) continue;
      expect(bekannt.has(d.requiresKey), `${d.slug}: unbekannter lookup_key ${d.requiresKey}`).toBe(true);
    }
  });

  it("genau die drei kostenpflichtigen Durchlaeufe tragen einen requiresKey", () => {
    const mit = DEMOS.filter((d) => d.requiresKey).map((d) => d.slug).sort();
    expect(mit).toEqual(["buchhaltung-belege", "compliance-radar", "voice-jana"]);
  });

  it("die Beratung durch Jana traegt KEINEN requiresKey (in jedem Paket enthalten)", () => {
    // Der Kapital-Layer ist laut Leon-Entscheid vom 03.08. im Grundpreis dabei.
    // Ein Schloss daran waere sachlich falsch.
    expect(getDemo("jana-fragen")!.requiresKey).toBeUndefined();
    expect(getDemo("signale-verstehen")!.requiresKey).toBeUndefined();
  });

  it("die gekoppelten Produkte haben auch einen Entdecken-Eintrag (gleiche Geschichte an beiden Orten)", () => {
    for (const d of DEMOS) {
      if (!d.requiresKey) continue;
      const it = ADDONS.find((a) => a.key === d.requiresKey)!;
      expect(it.area, `${d.slug}: ${it.label} hat keinen Bereich in der Seitenleiste`).toBeTruthy();
      expect(it.benefit, `${d.slug}: ${it.label} ohne Nutzen-Text`).toBeTruthy();
    }
  });
});

describe("Onboarding-Durchlaeufe: kundensichtbare Texte", () => {
  const texte = () => DEMOS.flatMap((d) => [
    d.title, d.summary,
    ...d.steps.flatMap((s) => [s.title, s.body, s.source ?? "", s.janaStarter ?? ""]),
  ]).filter(Boolean);

  it("keine Em-Dashes und keine En-Dashes", () => {
    for (const t of texte()) {
      expect(t.includes("—"), `Em-Dash in „${t.slice(0, 70)}“`).toBe(false);
      expect(t.includes("–"), `En-Dash in „${t.slice(0, 70)}“`).toBe(false);
    }
  });

  it("echte Umlaute, keine ue/ae/oe-Umschrift in den neuen Durchlaeufen", () => {
    // Nur die vier neuen pruefen: der Bestand traegt „Aenderung“ und Aehnliches
    // aus aelteren Schnitten, das ist ein eigener Aufraeum-Schnitt.
    const UMSCHRIFT = /(uebe|ueber|aender|aehnl|oeffn|muess|koenn|fuer|waehl|waehr|groess|hoeh|naech|spaet|zusaetz|benoetig|moegl|laeuf|traeg|faell|verfueg|zurueck|gespraech|entwuerf|fruehwarn)/i;
    const neu = ["jana-fragen", "buchhaltung-belege", "compliance-radar", "voice-jana"];
    for (const slug of neu) {
      const d = getDemo(slug)!;
      const alle = [d.title, d.summary, ...d.steps.flatMap((s) => [s.title, s.body, s.source ?? "", s.janaStarter ?? ""])];
      for (const t of alle.filter(Boolean)) {
        const treffer = t.match(UMSCHRIFT);
        expect(treffer, `${slug}: ASCII-Umschrift „${treffer?.[0]}“ in „${t.slice(0, 70)}“`).toBeNull();
      }
    }
  });

  it("deutsche Anfuehrungszeichen, keine ASCII-Quotes", () => {
    for (const t of texte()) {
      expect(t.includes('"'), `ASCII-Quote in „${t.slice(0, 70)}“`).toBe(false);
    }
  });

  it("jeder Schritt nennt seinen Beleg oder verzichtet bewusst darauf", () => {
    // Mindestens der erste Schritt jedes Durchlaufs muss einen Beleg tragen,
    // sonst ist die Anti-Blackbox-Regel nur eine Behauptung.
    for (const d of DEMOS) {
      expect(d.steps[0].source, `${d.slug}: erster Schritt ohne Beleg`).toBeTruthy();
    }
  });
});
