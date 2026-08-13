import { describe, it, expect } from "vitest";
import {
  darfSpeichern, phaseGesetzt, einwandGesetzt, ersetzeSkript, ersetzeSatz,
  aenderungen, aenderungenSatz, befundeSatz, befundeSkript,
} from "./skript-editor";
import type { TelefonStand } from "./telefon-stand";
import type { EinwandSatz, Skript, Zustand } from "./copilot-config";

const skript = (o: Partial<Skript> = {}): Skript => ({
  id: "s1", name: "HV Kaltakquise v3",
  phases: [
    { id: "p1", label: "Zentrale", text: "Guten Tag", goal: "Gatekeeper" },
    { id: "p2", label: "Brücke", text: "Darf ich fragen" },
  ],
  meta: { herkunft: "pdf" },
  scenario: { vertical: "hv" },
  ...o,
});

const satz = (o: Partial<EinwandSatz> = {}): EinwandSatz => ({
  id: "e1", name: "Standard",
  objections: [
    { key: "kein_interesse", hotkey: "1", label: "Kein Interesse", response: "Verstehe." },
    { key: "keine_zeit", hotkey: "2", label: "Keine Zeit", response: "Zwanzig Sekunden." },
  ],
  ...o,
});

const zustand = (): Zustand => ({
  skripte: { library: [skript(), skript({ id: "s2", name: "Ecommerce" })], active_id: "s1" },
  einwaende: { library: [satz(), satz({ id: "e2", name: "Ecom" })], active_id: "e1" },
});

const stand = (o: Partial<TelefonStand> = {}): TelefonStand => ({
  zustand: zustand(), skript: skript(), satz: satz(),
  befunde: [], meldung: null, grund: "backend", nichtGeschrieben: [], ...o,
} as TelefonStand);

describe("darfSpeichern — 🔴 die Sperre vor dem Zurueckschreiben", () => {
  it("bei sauberem Stand ist der Weg frei", () => {
    expect(darfSpeichern(stand())).toEqual({ ja: true });
  });

  it("🔴 musste die Konsole beim LESEN umformen, wird NICHT geschrieben", () => {
    // Genau so entstand im Juli "Skript 1": ohne Paket-Vorgabe baut
    // skripteAusPaket ein Ersatz-Skript, und das Zurueckschreiben macht den
    // Ersatz zum Bestand. Der Vertriebler verliert seinen Skript-Namen, ohne
    // dass jemand etwas davon merkt.
    const f = darfSpeichern(stand({ nichtGeschrieben: [{ ziel: "backend", was: "skripte" }] as never }));
    expect(f.ja).toBe(false);
    if (!f.ja) {
      expect(f.grund).toContain("alte Format");
      expect(f.grund).toContain("Voice & Co-Pilot");
    }
  });

  it("🔴 ein gescheiterter Abruf sperrt ebenfalls", () => {
    // Was man nicht gelesen hat, schreibt man nicht zurueck — sonst
    // ueberschreibt ein Netzfehler den Bestand mit einer leeren Ansicht.
    const f = darfSpeichern(stand({ meldung: "Abruf gescheitert" }));
    expect(f.ja).toBe(false);
    if (!f.ja) expect(f.grund).toContain("neu laden");
  });

  it("ohne jede Hinterlegung gibt es nichts zu speichern", () => {
    const f = darfSpeichern(stand({ zustand: { skripte: null, einwaende: null } }));
    expect(f.ja).toBe(false);
  });
});

describe("Aendern, ohne Unbekanntes wegzuwerfen", () => {
  it("🔴 goal, meta und scenario ueberleben eine Textaenderung", () => {
    // Wer hier ein neues Objekt baut statt zu spreaden, wirft Felder weg, die
    // er nicht kennt — und merkt es erst, wenn im Cockpit das Phasenziel fehlt.
    const n = phaseGesetzt(skript(), "p1", { text: "Neuer Text" });
    expect(n.phases[0].text).toBe("Neuer Text");
    expect(n.phases[0].goal).toBe("Gatekeeper");
    expect(n.meta).toEqual({ herkunft: "pdf" });
    expect(n.scenario).toEqual({ vertical: "hv" });
  });

  it("nur die gemeinte Phase aendert sich", () => {
    const n = phaseGesetzt(skript(), "p1", { text: "X" });
    expect(n.phases[1]).toEqual(skript().phases[1]);
  });

  it("🔴 die Phasen-id laesst sich nicht ueberschreiben", () => {
    const n = phaseGesetzt(skript(), "p1", { id: "gekapert", text: "X" } as never);
    expect(n.phases[0].id).toBe("p1");
  });

  it("eine unbekannte Phasen-id aendert nichts, statt etwas anzuhaengen", () => {
    expect(phaseGesetzt(skript(), "gibtsnicht", { text: "X" })).toEqual(skript());
  });

  it("🔴 der Einwand-key ist unantastbar (E14)", () => {
    // Ein aus dem Label abgeleiteter Schluessel wanderte, sobald jemand das
    // Label anpasste — und die gepinnte Antwort verschwand mitten im Gespraech.
    const n = einwandGesetzt(satz(), "kein_interesse", { label: "Ganz anders", key: "neu" } as never);
    expect(n.objections[0].key).toBe("kein_interesse");
    expect(n.objections[0].label).toBe("Ganz anders");
  });

  it("das uebergebene Objekt bleibt unangetastet", () => {
    const s = skript();
    phaseGesetzt(s, "p1", { text: "X" });
    expect(s.phases[0].text).toBe("Guten Tag");
  });
});

describe("Die Bibliothek zusammensetzen", () => {
  it("ersetzt genau einen Eintrag und laesst den Rest stehen", () => {
    const neu = ersetzeSkript(zustand(), skript({ name: "Umbenannt" }));
    expect(neu?.library).toHaveLength(2);
    expect(neu?.library[0].name).toBe("Umbenannt");
    expect(neu?.library[1].name).toBe("Ecommerce");
  });

  it("🔴 active_id bleibt, wie es war — Bearbeiten ist kein Zuweisen", () => {
    expect(ersetzeSkript(zustand(), skript({ id: "s2", name: "X" }))?.active_id).toBe("s1");
  });

  it("🔴 eine unbekannte id wird NICHT angehaengt, sondern abgelehnt", () => {
    // Ein Skript, das durch einen Tippfehler ploetzlich zweimal existiert,
    // ist schlimmer als eine Fehlermeldung.
    expect(ersetzeSkript(zustand(), skript({ id: "tippfehler" }))).toBeNull();
    expect(ersetzeSatz(zustand(), satz({ id: "tippfehler" }))).toBeNull();
  });

  it("ohne Bibliothek gibt es nichts zu ersetzen", () => {
    expect(ersetzeSkript({ skripte: null, einwaende: null }, skript())).toBeNull();
    expect(ersetzeSatz({ skripte: null, einwaende: null }, satz())).toBeNull();
  });

  it("Einwand-Saetze genauso", () => {
    const neu = ersetzeSatz(zustand(), satz({ name: "Neu" }));
    expect(neu?.library[0].name).toBe("Neu");
    expect(neu?.library[1].name).toBe("Ecom");
    expect(neu?.active_id).toBe("e1");
  });
});

describe("aenderungen — was vor dem Speichern dasteht", () => {
  it("keine Aenderung, keine Aufzaehlung", () => {
    expect(aenderungen(skript(), skript())).toEqual([]);
  });

  it("nennt Name, Beschriftung, Sprechtext und Ziel einzeln", () => {
    const n = phaseGesetzt(skript({ name: "Neu" }), "p1", { text: "Anders", goal: "Anderes Ziel" });
    const a = aenderungen(skript(), n);
    expect(a.join(" ")).toContain("HV Kaltakquise v3");
    expect(a.some((x) => x.includes("Sprechtext"))).toBe(true);
    expect(a.some((x) => x.includes("Ziel"))).toBe(true);
  });

  it("🔴 eine wegfallende Phase wird ausdruecklich genannt", () => {
    const weniger = skript({ phases: [skript().phases[0]] });
    expect(aenderungen(skript(), weniger).some((x) => x.includes("fällt weg"))).toBe(true);
  });

  it("bei Einwaenden ebenso, samt Tastenwechsel", () => {
    const n = einwandGesetzt(satz(), "keine_zeit", { hotkey: "9" });
    expect(aenderungenSatz(satz(), n).some((x) => x.includes("Taste"))).toBe(true);
    const ohne = { ...satz(), objections: [satz().objections[0]] };
    expect(aenderungenSatz(satz(), ohne).some((x) => x.includes("fällt weg"))).toBe(true);
  });
});

describe("Befunde — was gar nicht erst gespeichert werden sollte", () => {
  it("🔴 zwei Einwaende auf derselben Taste", () => {
    // Einer ist im Gespraech nicht erreichbar, und man merkt es genau dann
    // nicht, wenn man ihn braucht.
    const doppelt = einwandGesetzt(satz(), "keine_zeit", { hotkey: "1" });
    const b = befundeSatz(doppelt);
    expect(b.some((x) => x.includes("doppelt belegt"))).toBe(true);
    expect(b.some((x) => x.includes("nicht erreichbar"))).toBe(true);
  });

  it("freie Tasten stoeren nicht", () => {
    expect(befundeSatz(satz())).toEqual([]);
    const ohneTaste = einwandGesetzt(satz(), "keine_zeit", { hotkey: "" });
    expect(befundeSatz(ohneTaste)).toEqual([]);
  });

  it("🔴 ein Einwand ohne Antwort zeigt im Gespraech eine leere Karte", () => {
    const leer = einwandGesetzt(satz(), "kein_interesse", { response: "  " });
    expect(befundeSatz(leer).some((x) => x.includes("leere Karte"))).toBe(true);
  });

  it("🔴 eine Phase ohne Sprechtext ist der Fall Kerim", () => {
    const leer = phaseGesetzt(skript(), "p2", { text: "" });
    const b = befundeSkript(leer);
    expect(b.some((x) => x.includes("keinen Sprechtext"))).toBe(true);
    expect(befundeSkript(skript())).toEqual([]);
  });

  it("ein Skript ohne Namen wird benannt", () => {
    expect(befundeSkript(skript({ name: "  " })).some((x) => x.includes("keinen Namen"))).toBe(true);
  });
});
