import { describe, it, expect } from "vitest";
import { standAusRepConfig, bereit } from "./telefon-stand";
import type { BackendAntwort } from "./copilot-config";

const phase = (id: string, text = `Text ${id}`) => ({ id, label: id, text });
const einwand = (key: string, hotkey: string) =>
  ({ key, hotkey, label: key, response: `Antwort ${key}` });

const VOLL: BackendAntwort = {
  ok: true, found: true,
  scripts: {
    library: [
      { id: "hv_kaltakquise_v3", name: "HV Kaltakquise v3", phases: [phase("a"), phase("b")] },
      { id: "ecom_morpho", name: "Ecom Morpho", phases: [phase("c")] },
    ],
    active_id: "hv_kaltakquise_v3",
  },
  objections: {
    library: [
      { id: "satz_hv", name: "HV Einwaende", script_id: "hv_kaltakquise_v3", objections: [einwand("keine_zeit", "1"), einwand("zu_teuer", "2")] },
    ],
    active_id: "satz_hv",
  },
};

describe("standAusRepConfig — lesen, nicht schreiben", () => {
  it("nimmt das aktive Skript und den aktiven Einwand-Satz", () => {
    const s = standAusRepConfig(VOLL);
    expect(s.skript?.id).toBe("hv_kaltakquise_v3");
    expect(s.skript?.phases).toHaveLength(2);
    expect(s.satz?.objections.map((o) => o.key)).toEqual(["keine_zeit", "zu_teuer"]);
    expect(s.befunde).toEqual([]);
    expect(bereit(s)).toBe(true);
  });

  it("🔴 ein selbst angelegtes Skript kommt genauso durch wie ein zugewiesenes", () => {
    // Genau dafuer gibt es die Route: /overview kennt nur Namen und Zahlen,
    // der TEXT eines selbst angelegten Skripts steht nur in rep-config.
    const s = standAusRepConfig(VOLL);
    expect(s.skript?.phases[0].text).toBe("Text a");
  });

  it("🔴 die Konsole schreibt NICHTS zurueck, auch wenn das Cockpit es taete", () => {
    // Alt-Format: das Cockpit wuerde migrieren UND zurueckschreiben. Ohne die
    // Paket-Vorgabe hiesse das Skript danach "Skript 1" — ein stiller
    // Datenverlust, ausgeloest von einem Klick in der Konsole.
    const alt: BackendAntwort = { ok: true, found: true, script: [phase("x"), phase("y")], scripts: null, objections: null };
    const s = standAusRepConfig(alt);
    expect(s.grund).toBe("backend_altformat_migriert");
    expect(s.nichtGeschrieben).toEqual([{ ziel: "backend", was: "scripts" }]);
    // Angezeigt wird trotzdem etwas — der Vertriebler steht nicht vor nichts.
    expect(s.skript?.phases).toHaveLength(2);
  });

  it("🔴 ohne Zeile im Backend wird ebenfalls nichts hochgespielt", () => {
    // Der Gap-Close-Zweig (E1) haengt an einem LOKALEN Stand. Die Konsole hat
    // keinen, also kann sie sich auch nichts einbilden.
    const nichts: BackendAntwort = { ok: true, found: false, script: null, scripts: null, objections: null };
    const s = standAusRepConfig(nichts);
    expect(s.nichtGeschrieben).toEqual([]);
    expect(s.grund).toBe("nichts_zu_tun");
    expect(s.skript).toBeNull();
  });

  it("🔴 ein gescheiterter Abruf wird BENANNT, nicht verschluckt (E5, E11)", () => {
    const s = standAusRepConfig(null);
    expect(s.grund).toBe("abruf_gescheitert");
    expect(s.meldung).toBeTruthy();
    expect(s.nichtGeschrieben).toEqual([]);
    expect(bereit(s)).toBe(false);
  });
});

describe("befunde — der Fall Kerim reist mit", () => {
  it("🔴 eine leere Phase im aktiven Skript wird gemeldet", () => {
    const mitLuecke: BackendAntwort = {
      ...VOLL,
      scripts: {
        library: [{ id: "s", name: "Mit Luecke", phases: [phase("a"), { id: "b", label: "b", text: "   " }] }],
        active_id: "s",
      },
    };
    const s = standAusRepConfig(mitLuecke);
    expect(s.befunde.join(" ")).toContain("ohne Text");
  });

  it("🔴 ein leerer Einwand-Satz meldet, dass die Erkennung ausbleibt", () => {
    const ohneEinwaende: BackendAntwort = {
      ...VOLL,
      objections: { library: [{ id: "leer", name: "Leer", script_id: "hv_kaltakquise_v3", objections: [] }], active_id: "leer" },
    };
    const s = standAusRepConfig(ohneEinwaende);
    expect(s.befunde.join(" ")).toContain("Erkennung");
    expect(bereit(s)).toBe(false);
  });

  it("doppelt belegte Tasten werden gemeldet", () => {
    const doppelt: BackendAntwort = {
      ...VOLL,
      objections: {
        library: [{ id: "d", name: "D", script_id: "hv_kaltakquise_v3", objections: [einwand("a", "1"), einwand("b", "1")] }],
        active_id: "d",
      },
    };
    expect(standAusRepConfig(doppelt).befunde.join(" ")).toContain("Doppelt belegte Tasten");
  });

  it("gar kein Skript meldet sich, statt leer dazustehen", () => {
    const s = standAusRepConfig({ ok: true, found: true, scripts: null, objections: null });
    expect(s.befunde).toContain("Kein Skript geladen.");
    expect(bereit(s)).toBe(false);
  });
});

describe("bereit — wann kann man wirklich telefonieren", () => {
  it("Skript und mindestens ein Einwand", () => {
    expect(bereit(standAusRepConfig(VOLL))).toBe(true);
  });

  it("Skript ohne Einwaende reicht nicht", () => {
    const s = standAusRepConfig({ ...VOLL, objections: null, found: true });
    expect(s.skript).toBeTruthy();
    expect(bereit(s)).toBe(false);
  });
});

// ── Skript-Wahl fuer das laufende Gespraech (13.08., Leon-Befund 3) ──────────

import { skripteZurAuswahl, skriptFuerGespraech } from "./telefon-stand";

const standMit = (library: Array<{ id: string; name: string }>, activeId: string | null) =>
  standAusRepConfig({
    ok: true, found: true,
    scripts: { library: library.map((s) => ({ ...s, phases: [{ id: "p1", label: "Start", text: "Hallo" }] })), active_id: activeId },
    objections: { library: [], active_id: null },
  } as never);

describe("Skript-Wahl fuer dieses Gespraech", () => {
  const drei = [{ id: "a", name: "HV Kaltakquise" }, { id: "b", name: "HV Kaltakquise v3" }, { id: "c", name: "Ecommerce" }];

  it("ohne Wahl gilt das zugewiesene", () => {
    const st = standMit(drei, "b");
    const w = skriptFuerGespraech(st, null);
    expect(w.skript?.id).toBe("b");
    expect(w.abweichend).toBe(false);
  });

  it("eine Wahl setzt sich durch und wird als abweichend gemeldet", () => {
    const st = standMit(drei, "b");
    const w = skriptFuerGespraech(st, "c");
    expect(w.skript?.id).toBe("c");
    expect(w.abweichend).toBe(true);
    expect(w.zugewiesen?.id).toBe("b"); // 🔴 der Rueckweg bleibt sichtbar
  });

  it("das zugewiesene ausdruecklich waehlen ist keine Abweichung", () => {
    expect(skriptFuerGespraech(standMit(drei, "b"), "b").abweichend).toBe(false);
  });

  it("🔴 eine Wahl, die es nicht mehr gibt, faellt auf das ZUGEWIESENE zurueck, nie auf das erste", () => {
    // Der bequeme Fehler waere library[0]. Dann waechst dem Vertriebler ein
    // fremdes Skript zu, sobald jemand oben eines einfuegt — und er merkt es
    // erst im Gespraech.
    const st = standMit(drei, "b");
    const w = skriptFuerGespraech(st, "geloescht");
    expect(w.skript?.id).toBe("b");
    expect(w.skript?.id).not.toBe("a");
    expect(w.abweichend).toBe(false);
  });

  it("leere und weisse Wahl zaehlen als keine Wahl", () => {
    for (const leer of ["", "   ", null]) {
      expect(skriptFuerGespraech(standMit(drei, "b"), leer).skript?.id).toBe("b");
    }
  });

  it("skripteZurAuswahl liefert die ganze Bibliothek, auch das zugewiesene", () => {
    expect(skripteZurAuswahl(standMit(drei, "b")).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("ohne Bibliothek ist die Auswahl leer statt undefined", () => {
    expect(skripteZurAuswahl(standAusRepConfig(null))).toEqual([]);
    expect(skriptFuerGespraech(standAusRepConfig(null), "a").skript).toBeNull();
  });
});
