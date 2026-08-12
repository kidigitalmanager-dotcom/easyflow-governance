import { describe, it, expect } from "vitest";
import {
  uebernehmeBackend, bibliothekGueltig, einwandBibliothekGueltig,
  aktivesSkript, aktiverEinwandSatz, einwaendeAusAltformat, skripteAusPaket,
  einwandSatzZumSkript, uebernehmeEditor, befundeAmStand, HOTKEYS,
  type Zustand, type PaketVorgabe, type Einwand, type Phase,
} from "./copilot-config";

// -----------------------------------------------------------------------------
// Diese Suite ist die Versicherung gegen Leons zweimal betonte Warnung:
// "Einwaende wurden falsch geladen bzw. verschwanden immer wieder."
// Jeder Block hier bildet einen DOKUMENTIERTEN Ausfall nach, nicht einen
// ausgedachten.
// -----------------------------------------------------------------------------

const PH = (id: string, text = "Guten Tag"): Phase => ({ id, label: id, text });

const PAKET: PaketVorgabe = {
  script_seeds: [
    { id: "ecom_morpho", name: "Morpho", scenario: { vertical: "ecom", type: "cold" }, source: "phases" },
    { id: "ecom_nepq", name: "NEPQ", scenario: { vertical: "ecom", type: "cold" }, phases_key: "nepq_phases" },
    { id: "ecom_warm", name: "Warm", scenario: { vertical: "ecom", type: "warm_transfer" }, phases_key: "warm_phases" },
  ],
  phasen: { nepq_phases: [PH("n1")], warm_phases: [PH("w1")] },
  active_script_id: "ecom_morpho",
  objections: [{ key: "zu_teuer", hotkey: "1", label: "Zu teuer", response: "Verstehe." }],
  variant: "jana",
};

const EIN = (key: string, hotkey = "1"): Einwand =>
  ({ key, hotkey, label: key, response: `Antwort ${key}` });

const LEER: Zustand = { skripte: null, einwaende: null };

const lokalMit = (saetze: number): Zustand => ({
  skripte: { library: [{ id: "s1", name: "S1", phases: [PH("p1")] }], active_id: "s1" },
  einwaende: {
    library: Array.from({ length: saetze }, (_, i) => ({
      id: `set${i + 1}`, name: `Satz ${i + 1}`, script_id: "", objections: [EIN(`e${i + 1}`)],
    })),
    active_id: "set1",
  },
});

describe("bibliothekGueltig: EIN Eintrag reicht", () => {
  it("🔴 schon bei EINEM Eintrag wahr — genau das ist der Klemmpunkt", () => {
    expect(bibliothekGueltig({ library: [{ id: "a", name: "a", phases: [] }], active_id: "a" })).toBe(true);
  });
  it("leere Bibliothek ist NICHT gueltig", () => {
    expect(bibliothekGueltig({ library: [], active_id: "" })).toBe(false);
  });
  it("ein Array ist keine Bibliothek", () => {
    expect(bibliothekGueltig([{ id: "a" }])).toBe(false);
    expect(einwandBibliothekGueltig([EIN("a")])).toBe(false);
  });
  it("null und Unsinn sind nicht gueltig", () => {
    expect(bibliothekGueltig(null)).toBe(false);
    expect(bibliothekGueltig("x")).toBe(false);
    expect(bibliothekGueltig({ library: "nein" })).toBe(false);
  });
});

describe("Praezedenz der SKRIPTE", () => {
  it("Backend-Bibliothek gewinnt hart gegen den lokalen Stand", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, scripts: { library: [{ id: "b1", name: "Backend", phases: [PH("x")] }], active_id: "b1" } },
      lokal: lokalMit(1), paket: PAKET,
    });
    expect(r.zustand.skripte?.active_id).toBe("b1");
    expect(r.grund).toBe("backend_gewinnt");
    expect(r.schreiben).toContainEqual({ ziel: "lokal", was: "scripts" });
    // Backend gewinnt heisst NICHT zurueckschreiben.
    expect(r.schreiben).not.toContainEqual({ ziel: "backend", was: "scripts" });
  });

  it("fehlende active_id faellt auf den ersten Eintrag, nicht auf nichts", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, scripts: { library: [{ id: "b1", name: "B", phases: [PH("x")] }] } as never },
      lokal: LEER, paket: PAKET,
    });
    expect(r.zustand.skripte?.active_id).toBe("b1");
  });

  it("Alt-Array wird migriert UND zurueckgeschrieben", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, script: [PH("alt1"), PH("alt2")] },
      lokal: LEER, paket: PAKET,
    });
    expect(r.grund).toBe("backend_altformat_migriert");
    expect(r.schreiben).toContainEqual({ ziel: "backend", was: "scripts" });
    // Das Alt-Skript landet unter dem Seed mit source:'phases'.
    const morpho = r.zustand.skripte?.library.find((s) => s.id === "ecom_morpho");
    expect(morpho?.phases.map((p) => p.id)).toEqual(["alt1", "alt2"]);
  });

  it("🔴 E1 Gap-Close: kennt das Backend nichts, wandert der lokale Stand hoch", () => {
    const r = uebernehmeBackend({ antwort: { found: false }, lokal: lokalMit(1), paket: PAKET });
    expect(r.grund).toBe("lokal_hochgesynct");
    expect(r.schreiben).toContainEqual({ ziel: "backend", was: "scripts" });
    // Der lokale Stand darf dabei NICHT ueberschrieben werden.
    expect(r.zustand.skripte?.library[0].id).toBe("s1");
  });

  it("🔴 bei found:false wandern auch die Einwaende mit hoch, bei found:true NICHT", () => {
    const ohneZeile = uebernehmeBackend({ antwort: { found: false }, lokal: lokalMit(1), paket: PAKET });
    expect(ohneZeile.schreiben).toContainEqual({ ziel: "backend", was: "objections" });

    // Existiert eine Zeile, duerfen vorhandene Backend-Einwaende nie von hier
    // aus ueberschrieben werden.
    const mitZeile = uebernehmeBackend({ antwort: { found: true }, lokal: lokalMit(1), paket: PAKET });
    expect(mitZeile.schreiben).not.toContainEqual({ ziel: "backend", was: "objections" });
  });
});

describe("Praezedenz der EINWAENDE", () => {
  it("nur bei found:true wird ueberhaupt etwas uebernommen", () => {
    const r = uebernehmeBackend({
      antwort: { found: false, objections: [EIN("fremd")] },
      lokal: lokalMit(1), paket: PAKET,
    });
    // Der lokale Satz bleibt unangetastet.
    expect(r.zustand.einwaende?.library[0].objections[0].key).toBe("e1");
  });

  it("objections:null loescht nichts", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, objections: null }, lokal: lokalMit(2), paket: PAKET,
    });
    expect(r.zustand.einwaende?.library).toHaveLength(2);
  });

  it("gueltige Backend-Bibliothek gewinnt", () => {
    const r = uebernehmeBackend({
      antwort: {
        found: true,
        objections: { library: [{ id: "bk", name: "Backend", script_id: "", objections: [EIN("neu")] }], active_id: "bk" },
      },
      lokal: lokalMit(1), paket: PAKET,
    });
    expect(r.zustand.einwaende?.active_id).toBe("bk");
    expect(r.schreiben).toContainEqual({ ziel: "lokal", was: "objections" });
  });

  it("🔴 E7: ein Alt-Array macht eine lokale Mehr-Satz-Bibliothek NICHT platt", () => {
    const lokal = lokalMit(3);
    const r = uebernehmeBackend({
      antwort: { found: true, objections: [EIN("alt")] }, lokal, paket: PAKET,
    });
    // Alle drei Saetze ueberleben ...
    expect(r.zustand.einwaende?.library).toHaveLength(3);
    // ... und das Backend zieht nach statt umgekehrt.
    expect(r.schreiben).toContainEqual({ ziel: "backend", was: "objections" });
    expect(r.schreiben).not.toContainEqual({ ziel: "lokal", was: "objections" });
  });

  it("Alt-Array bei genau EINEM lokalen Satz wird migriert", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, objections: [EIN("alt")] }, lokal: lokalMit(1), paket: PAKET,
    });
    expect(r.zustand.einwaende?.active_id).toBe("standard");
    expect(r.zustand.einwaende?.library[0].objections[0].key).toBe("alt");
    expect(r.schreiben).toContainEqual({ ziel: "backend", was: "objections" });
  });

  it("ein LEERES Alt-Array loescht nichts (mehrere Saetze)", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, objections: [] }, lokal: lokalMit(2), paket: PAKET,
    });
    expect(r.zustand.einwaende?.library).toHaveLength(2);
  });

  it("🔴 ein LEERES Alt-Array loescht auch bei EINEM lokalen Satz nichts", () => {
    // Die Luecke, die die Mutations-Gegenprobe gefunden hat: mit zwei Saetzen
    // schuetzte der E7-Zweig, mit EINEM lief es in die Migration und der Satz
    // waere zu einem leeren "Standard" geworden. Genau die Lage, in der
    // Einwaende "einfach verschwinden".
    const r = uebernehmeBackend({
      antwort: { found: true, objections: [] }, lokal: lokalMit(1), paket: PAKET,
    });
    expect(r.zustand.einwaende?.library[0].objections).toHaveLength(1);
    expect(r.zustand.einwaende?.library[0].objections[0].key).toBe("e1");
  });

  it("🔴 und auch dann nicht, wenn lokal noch gar nichts geladen ist", () => {
    const r = uebernehmeBackend({
      antwort: { found: true, objections: [] }, lokal: { skripte: null, einwaende: null }, paket: PAKET,
    });
    expect(r.zustand.einwaende).toBeNull();
  });
});

describe("🔴 E11: der gescheiterte Abruf wird BENANNT, nicht verschluckt", () => {
  it("null-Antwort laesst den lokalen Stand stehen", () => {
    const lokal = lokalMit(2);
    const r = uebernehmeBackend({ antwort: null, lokal, paket: PAKET });
    expect(r.zustand).toBe(lokal);
    expect(r.grund).toBe("abruf_gescheitert");
  });

  it("und schreibt NICHTS zurueck — ein 403 darf nichts ueberschreiben", () => {
    const r = uebernehmeBackend({ antwort: null, lokal: lokalMit(2), paket: PAKET });
    expect(r.schreiben).toEqual([]);
  });

  it("die Meldung sagt dem Vertriebler, was er sieht", () => {
    const r = uebernehmeBackend({ antwort: null, lokal: LEER, paket: PAKET });
    expect(r.meldung).toContain("nicht abrufbar");
    expect(r.meldung).toContain("zuletzt bekannte Stand");
  });
});

describe("Paket-Vorgabe", () => {
  it("cold-only liefert das Warm-Transfer-Skript NICHT aus", () => {
    const lib = skripteAusPaket({ ...PAKET, variant: "cold-only" }, [PH("a")]);
    expect(lib.library.map((s) => s.id)).not.toContain("ecom_warm");
    expect(lib.library.map((s) => s.id)).toContain("ecom_nepq");
  });
  it("jana liefert alle drei", () => {
    const lib = skripteAusPaket(PAKET, [PH("a")]);
    expect(lib.library).toHaveLength(3);
    expect(lib.active_id).toBe("ecom_morpho");
  });
  it("ohne Seeds entsteht trotzdem ein Skript statt gar keines", () => {
    const lib = skripteAusPaket({ script_seeds: [] }, [PH("a")]);
    expect(lib.library).toHaveLength(1);
    expect(lib.library[0].id).toBe("skript_1");
  });
  it("ein unbekanntes active_script_id faellt auf den ersten zurueck", () => {
    const lib = skripteAusPaket({ ...PAKET, active_script_id: "gibts_nicht" }, [PH("a")]);
    expect(lib.active_id).toBe("ecom_morpho");
  });
  it("Phasen werden KOPIERT, nicht verlinkt", () => {
    const quelle = [PH("a")];
    const lib = skripteAusPaket(PAKET, quelle);
    lib.library[0].phases[0].text = "geaendert";
    expect(quelle[0].text).toBe("Guten Tag");
  });
});

describe("Bindung: der Einwand-Satz folgt dem Skript", () => {
  const einwaende = {
    library: [
      { id: "std", name: "Standard", script_id: "", objections: [EIN("a")] },
      { id: "nepq", name: "NEPQ-Einwaende", script_id: "ecom_nepq", objections: [EIN("b")] },
    ],
    active_id: "std",
  };
  it("wechselt zum gebundenen Satz", () => {
    const r = einwandSatzZumSkript(einwaende, { id: "ecom_nepq", name: "NEPQ", phases: [] });
    expect(r.gewechselt).toBe(true);
    expect(r.neueAktivId).toBe("nepq");
    expect(r.name).toBe("NEPQ-Einwaende");
  });
  it("🔴 ohne gebundenen Satz bleibt der aktive stehen — KEIN stiller Rueckfall", () => {
    const r = einwandSatzZumSkript(einwaende, { id: "ecom_morpho", name: "M", phases: [] });
    expect(r.gewechselt).toBe(false);
    expect(r.neueAktivId).toBeNull();
  });
  it("ist der gebundene schon aktiv, passiert nichts", () => {
    const r = einwandSatzZumSkript({ ...einwaende, active_id: "nepq" }, { id: "ecom_nepq", name: "N", phases: [] });
    expect(r.gewechselt).toBe(false);
  });
  it("ein leerer script_id bindet NICHT", () => {
    const r = einwandSatzZumSkript(einwaende, { id: "", name: "", phases: [] });
    expect(r.gewechselt).toBe(false);
  });
});

describe("🔴 E14: Schluessel-Stabilitaet", () => {
  it("ein umbenanntes Label aendert den Schluessel NICHT", () => {
    const vorher = uebernehmeEditor([{ label: "Zu teuer", hotkey: "1", response: "..." }]);
    expect(vorher[0].key).toBe("zu_teuer");
    const nachher = uebernehmeEditor([{ key: vorher[0].key, label: "Preis ist zu hoch", hotkey: "1", response: "..." }]);
    expect(nachher[0].key).toBe("zu_teuer");
    expect(nachher[0].label).toBe("Preis ist zu hoch");
  });

  it("Umlaute fallen nicht mehr weg", () => {
    const r = uebernehmeEditor([{ label: "Zu große Umstellung", hotkey: "2", response: "x" }]);
    expect(r[0].key).toBe("zu_grosse_umstellung");
  });

  it("gleiche Labels kollidieren nicht, sondern werden durchnummeriert", () => {
    const r = uebernehmeEditor([
      { label: "Zu teuer?", hotkey: "1", response: "a" },
      { label: "Zu teuer!", hotkey: "2", response: "b" },
    ]);
    expect(new Set(r.map((x) => x.key)).size).toBe(2);
  });

  it("leere Zeilen fallen raus", () => {
    const r = uebernehmeEditor([{ label: "", response: "" }, { label: "Da", response: "x" }]);
    expect(r).toHaveLength(1);
  });

  it("die Taste wird auf EIN Grossbuchstabe-Zeichen normalisiert", () => {
    const r = uebernehmeEditor([{ label: "A", hotkey: "q", response: "x" }]);
    expect(r[0].hotkey).toBe("Q");
  });

  it("es gibt genau 20 Tastenplaetze", () => {
    expect(HOTKEYS).toHaveLength(20);
    expect(new Set(HOTKEYS).size).toBe(20);
  });
});

describe("Befunde: ein leerer Zustand meldet sich", () => {
  it("🔴 der Kerim-Fall: eine Phase ohne Text wird benannt", () => {
    const b = befundeAmStand({
      skripte: { library: [{ id: "s", name: "E-Commerce Huens", phases: [PH("a"), { id: "b", label: "b", text: "  " }] }], active_id: "s" },
      einwaende: { library: [{ id: "x", name: "X", script_id: "", objections: [EIN("a")] }], active_id: "x" },
    });
    expect(b.join(" ")).toContain("E-Commerce Huens");
    expect(b.join(" ")).toContain("ohne Text");
  });

  it("ein leerer Einwand-Satz sagt, dass die Erkennung damit aus ist", () => {
    const b = befundeAmStand({
      skripte: { library: [{ id: "s", name: "S", phases: [PH("a")] }], active_id: "s" },
      einwaende: { library: [{ id: "x", name: "Leer", script_id: "", objections: [] }], active_id: "x" },
    });
    expect(b.join(" ")).toContain("Erkennung bleibt damit aus");
  });

  it("doppelt belegte Tasten fallen auf", () => {
    const b = befundeAmStand({
      skripte: { library: [{ id: "s", name: "S", phases: [PH("a")] }], active_id: "s" },
      einwaende: {
        library: [{ id: "x", name: "X", script_id: "", objections: [EIN("a", "1"), EIN("b", "1")] }],
        active_id: "x",
      },
    });
    expect(b.join(" ")).toContain("Doppelt belegte Tasten: 1");
  });

  it("ein sauberer Stand meldet nichts", () => {
    expect(befundeAmStand({
      skripte: { library: [{ id: "s", name: "S", phases: [PH("a")] }], active_id: "s" },
      einwaende: { library: [{ id: "x", name: "X", script_id: "", objections: [EIN("a", "1")] }], active_id: "x" },
    })).toEqual([]);
  });

  it("gar nichts geladen wird ehrlich gemeldet", () => {
    const b = befundeAmStand({ skripte: null, einwaende: null });
    expect(b).toHaveLength(2);
  });
});

describe("Hilfsfunktionen", () => {
  it("aktivesSkript faellt auf den ersten zurueck", () => {
    expect(aktivesSkript({ library: [{ id: "a", name: "A", phases: [] }], active_id: "gibts_nicht" })?.id).toBe("a");
    expect(aktivesSkript(null)).toBeNull();
  });
  it("aktiverEinwandSatz ebenso", () => {
    expect(aktiverEinwandSatz({ library: [{ id: "a", name: "A", script_id: "", objections: [] }], active_id: "x" })?.id).toBe("a");
    expect(aktiverEinwandSatz(null)).toBeNull();
  });
  it("einwaendeAusAltformat kopiert statt zu verlinken", () => {
    const quelle = [EIN("a")];
    const lib = einwaendeAusAltformat(quelle);
    lib.library[0].objections[0].response = "geaendert";
    expect(quelle[0].response).toBe("Antwort a");
  });
});
