import { describe, it, expect } from "vitest";
import {
  LEERES_PANEL, erkannt, geklickt, bestaetigt, satzGewechselt, gespraechBeendet,
  karte, tastenBelegung, tasteAus, OBJ_DEDUPE_MS, OBJ_CHIPS_MAX, VERLAUF_MAX,
} from "./einwand-panel";
import type { EinwandSatz } from "./copilot-config";

// Eingefrorene Zeit: 12.08.2026, 20:00:00 UTC. Nichts hier liest die Uhr.
const T0 = 1786564800000;

const e = (key: string, hotkey: string, label = key) =>
  ({ key, hotkey, label, response: `Antwort zu ${key}` });

const SATZ: EinwandSatz = {
  id: "s1", name: "Standard", script_id: "sk1",
  objections: [
    e("kein_interesse", "1", "Kein Interesse"),
    e("keine_zeit", "2", "Keine Zeit"),
    e("kommen_klar", "3", "Wir kommen klar"),
    e("zu_teuer", "4", "Zu teuer"),
  ],
};

describe("erkannt — der Riegel gegen die Wiederkehr (E4)", () => {
  it("zeigt einen neuen Einwand an und legt ihn vorn in Chips und Verlauf", () => {
    const z = erkannt(LEERES_PANEL, "kein_interesse", T0);
    expect(z.erkannt).toBe("kein_interesse");
    expect(z.chips).toEqual(["kein_interesse"]);
    expect(z.verlauf).toEqual(["kein_interesse"]);
  });

  it("🔴 derselbe Einwand kommt innerhalb von 60 Sekunden NICHT wieder", () => {
    const a = erkannt(LEERES_PANEL, "kein_interesse", T0);
    const b = erkannt(a, "keine_zeit", T0 + 1000);
    // 59 Sekunden nach dem ersten Mal: der Riegel haelt.
    const c = erkannt(b, "kein_interesse", T0 + OBJ_DEDUPE_MS - 1);
    expect(c).toBe(b);
    expect(c.erkannt).toBe("keine_zeit");
  });

  it("nach 60 Sekunden darf er wieder", () => {
    const a = erkannt(LEERES_PANEL, "kein_interesse", T0);
    const b = erkannt(a, "keine_zeit", T0 + 1000);
    const c = erkannt(b, "kein_interesse", T0 + OBJ_DEDUPE_MS);
    expect(c.erkannt).toBe("kein_interesse");
    expect(c.chips).toEqual(["kein_interesse", "keine_zeit"]);
  });

  it("🔴 ein GEPINNTER Einwand wird nicht neu erkannt — die Antwort bleibt stehen", () => {
    const a = geklickt(LEERES_PANEL, "zu_teuer", T0);
    // Weit nach dem Dedupe-Fenster: der Pin haelt trotzdem.
    const b = erkannt(a, "zu_teuer", T0 + 10 * OBJ_DEDUPE_MS);
    expect(b).toBe(a);
    expect(b.gepinnt).toBe("zu_teuer");
  });

  it("der bereits erkannte Einwand wird nicht doppelt eingetragen", () => {
    const a = erkannt(LEERES_PANEL, "kein_interesse", T0);
    const b = erkannt(a, "kein_interesse", T0 + 5);
    expect(b).toBe(a);
    expect(b.chips).toHaveLength(1);
  });

  it("ein leerer Schluessel tut nichts", () => {
    expect(erkannt(LEERES_PANEL, "", T0)).toBe(LEERES_PANEL);
  });
});

describe("Chips und Verlauf — die Grenzen aus dem Master", () => {
  it("🔴 hoechstens drei Chips, neueste zuerst", () => {
    let z = LEERES_PANEL;
    ["kein_interesse", "keine_zeit", "kommen_klar", "zu_teuer"].forEach((k, i) => {
      z = erkannt(z, k, T0 + i * 1000);
    });
    expect(OBJ_CHIPS_MAX).toBe(3);
    expect(z.chips).toEqual(["zu_teuer", "kommen_klar", "keine_zeit"]);
    expect(z.chips).not.toContain("kein_interesse");
  });

  it("🔴 der Verlauf haelt zehn, also mehr als die Chips", () => {
    expect(VERLAUF_MAX).toBe(10);
    let z = LEERES_PANEL;
    for (let i = 0; i < 12; i++) z = erkannt(z, `k${i}`, T0 + i * 1000);
    expect(z.verlauf).toHaveLength(10);
    expect(z.verlauf[0]).toBe("k11");
    expect(z.verlauf).not.toContain("k0");
  });

  it("ein wiederkehrender Einwand rueckt nach vorn statt sich zu verdoppeln", () => {
    let z = erkannt(LEERES_PANEL, "a", T0);
    z = erkannt(z, "b", T0 + 1000);
    z = erkannt(z, "a", T0 + OBJ_DEDUPE_MS + 1000);
    expect(z.chips).toEqual(["a", "b"]);
    expect(z.verlauf).toEqual(["a", "b"]);
  });
});

describe("Pin — bleibt, bis der Mensch ihn wegnimmt (E3)", () => {
  it("🔴 ein Klick pinnt, und KEINE noch so grosse Zeitspanne loest ihn", () => {
    const a = geklickt(LEERES_PANEL, "keine_zeit", T0);
    expect(a.gepinnt).toBe("keine_zeit");
    // Es gibt keine Funktion, die Zeit vergehen laesst. Genau das ist der Punkt:
    // ein Auto-Hide muesste hier stehen, und er steht nicht.
    expect(Object.keys({ erkannt, geklickt, bestaetigt, satzGewechselt, gespraechBeendet }))
      .not.toContain("zeitVergangen");
  });

  it("Enter oder Haken nimmt den Pin weg, sonst bleibt alles stehen", () => {
    const a = geklickt(LEERES_PANEL, "keine_zeit", T0);
    const b = bestaetigt(a);
    expect(b.gepinnt).toBeNull();
    expect(b.erkannt).toBe("keine_zeit");
    expect(b.chips).toEqual(["keine_zeit"]);
  });

  it("Bestaetigen ohne Pin aendert nichts", () => {
    expect(bestaetigt(LEERES_PANEL)).toBe(LEERES_PANEL);
  });

  it("🔴 der Griff von Hand geht durch den Dedupe-Riegel", () => {
    const a = erkannt(LEERES_PANEL, "zu_teuer", T0);
    const b = bestaetigt(a);
    // Sofort danach nochmal von Hand: das MUSS gehen.
    const c = geklickt(b, "zu_teuer", T0 + 100);
    expect(c.gepinnt).toBe("zu_teuer");
  });
});

describe("Satz-Wechsel — Pin ueberlebt, Chips ohne Treffer nicht", () => {
  const ANDERER: EinwandSatz = {
    id: "s2", name: "HV", script_id: "sk2",
    objections: [e("keine_zeit", "1"), e("neuer_einwand", "2")],
  };

  it("🔴 der Pin ueberlebt den Wechsel, auch wenn der Schluessel im neuen Satz fehlt", () => {
    let z = geklickt(LEERES_PANEL, "kein_interesse", T0);
    z = satzGewechselt(z, ANDERER);
    // "kein_interesse" gibt es im neuen Satz nicht — der Pin bleibt trotzdem.
    expect(z.gepinnt).toBe("kein_interesse");
  });

  it("🔴 Chips ohne passenden Schluessel verschwinden", () => {
    let z = erkannt(LEERES_PANEL, "kein_interesse", T0);
    z = erkannt(z, "keine_zeit", T0 + 1000);
    z = erkannt(z, "kommen_klar", T0 + 2000);
    z = satzGewechselt(z, ANDERER);
    expect(z.chips).toEqual(["keine_zeit"]);
    expect(z.verlauf).toEqual(["keine_zeit"]);
  });

  it("die Erkennungsleiste raeumt sich, wenn der erkannte Einwand nicht mehr existiert", () => {
    let z = erkannt(LEERES_PANEL, "kommen_klar", T0);
    z = satzGewechselt(z, ANDERER);
    expect(z.erkannt).toBeNull();
  });

  it("ein Wechsel auf gar keinen Satz laesst nur den Pin stehen", () => {
    let z = geklickt(LEERES_PANEL, "zu_teuer", T0);
    z = erkannt(z, "keine_zeit", T0 + 1000);
    z = satzGewechselt(z, null);
    expect(z.gepinnt).toBe("zu_teuer");
    expect(z.chips).toEqual([]);
  });

  it("🔴 der Dedupe-Riegel ueberlebt den Wechsel — sonst spuelt jeder Wechsel alles neu herein", () => {
    let z = erkannt(LEERES_PANEL, "keine_zeit", T0);
    z = erkannt(z, "kommen_klar", T0 + 1000);      // die Leiste zeigt jetzt etwas anderes
    z = satzGewechselt(z, ANDERER);                 // "kommen_klar" faellt weg -> Leiste leer
    expect(z.erkannt).toBeNull();

    // "keine_zeit" gibt es im neuen Satz, es liegt aber erst 2 Sekunden zurueck.
    // Der Riegel muss den Wechsel ueberlebt haben, sonst erscheint nach jedem
    // Skript-Wechsel wieder alles, was gerade schon dran war.
    const zuFrueh = erkannt(z, "keine_zeit", T0 + 2000);
    expect(zuFrueh.erkannt).toBeNull();

    // Und nach 60 Sekunden darf es wieder — der Riegel haelt, er blockiert nicht ewig.
    const spaeter = erkannt(z, "keine_zeit", T0 + OBJ_DEDUPE_MS + 1);
    expect(spaeter.erkannt).toBe("keine_zeit");
  });

  it("ein neues Gespraech raeumt auch den Riegel", () => {
    const z = gespraechBeendet();
    expect(z).toEqual(LEERES_PANEL);
    expect(erkannt(z, "keine_zeit", T0 + 10).erkannt).toBe("keine_zeit");
  });
});

describe("karte — nachschlagen ohne zu raten", () => {
  it("findet den Einwand zum Schluessel", () => {
    expect(karte(SATZ, "zu_teuer")?.label).toBe("Zu teuer");
  });

  it("🔴 ein unbekannter Schluessel liefert nichts — KEINEN Ersatz", () => {
    expect(karte(SATZ, "gibtsnicht")).toBeNull();
    expect(karte(null, "zu_teuer")).toBeNull();
    expect(karte(SATZ, null)).toBeNull();
  });
});

describe("tastenBelegung", () => {
  it("ordnet jede Taste ihrem Einwand zu", () => {
    const m = tastenBelegung(SATZ);
    expect(m.get("1")).toBe("kein_interesse");
    expect(m.get("4")).toBe("zu_teuer");
    expect(m.size).toBe(4);
  });

  it("🔴 bei doppelter Belegung gewinnt der ERSTE, der zweite bleibt ohne Taste", () => {
    const kollision: EinwandSatz = {
      id: "k", name: "K", script_id: "sk1", objections: [e("a", "1"), e("b", "1"), e("c", "2")],
    };
    const m = tastenBelegung(kollision);
    expect(m.get("1")).toBe("a");
    expect(m.size).toBe(2);
    // Nichts wird still umgelegt: "b" hat keine Taste, und befundeAmStand
    // meldet die Kollision an anderer Stelle.
    expect([...m.values()]).not.toContain("b");
  });

  it("Einwaende ohne Taste belegen nichts", () => {
    const ohne: EinwandSatz = { id: "o", name: "O", script_id: "sk1", objections: [e("a", ""), e("b", "2")] };
    expect(tastenBelegung(ohne).size).toBe(1);
  });

  it("Kleinbuchstaben im Datensatz landen auf der Grossbuchstaben-Taste", () => {
    const klein: EinwandSatz = { id: "kl", name: "KL", script_id: "sk1", objections: [e("a", "q")] };
    expect(tastenBelegung(klein).get("Q")).toBe("a");
  });

  it("kein Satz ist eine leere Belegung, kein Absturz", () => {
    expect(tastenBelegung(null).size).toBe(0);
  });
});

describe("tasteAus — Enter statt Leertaste", () => {
  it("🔴 Enter bestaetigt", () => {
    expect(tasteAus({ key: "Enter" })).toEqual({ art: "bestaetigen" });
  });

  it("🔴 die Leertaste tut NICHTS — im Browser scrollt sie", () => {
    expect(tasteAus({ key: " " })).toBeNull();
    expect(tasteAus({ key: "Spacebar" })).toBeNull();
  });

  it("Ziffern und Buchstaben waehlen einen Einwand", () => {
    expect(tasteAus({ key: "1" })).toEqual({ art: "einwand", taste: "1" });
    expect(tasteAus({ key: "q" })).toEqual({ art: "einwand", taste: "Q" });
    expect(tasteAus({ key: "0" })).toEqual({ art: "einwand", taste: "0" });
  });

  it("🔴 in einem Tippfeld faengt niemand die Taste ab", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(tasteAus({ key: "1", target: { tagName } })).toBeNull();
      expect(tasteAus({ key: "Enter", target: { tagName } })).toBeNull();
    }
    expect(tasteAus({ key: "1", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  });

  it("Tastenkuerzel des Systems gehoeren dem System", () => {
    expect(tasteAus({ key: "1", metaKey: true })).toBeNull();
    expect(tasteAus({ key: "1", ctrlKey: true })).toBeNull();
    expect(tasteAus({ key: "r", altKey: true })).toBeNull();
  });

  it("Sondertasten laufen ins Leere", () => {
    for (const key of ["Escape", "Tab", "ArrowUp", "F5", "Shift", "ä", "-"]) {
      expect(tasteAus({ key })).toBeNull();
    }
  });

  it("ein Klick in einem DIV ist kein Tippfeld", () => {
    expect(tasteAus({ key: "2", target: { tagName: "DIV" } })).toEqual({ art: "einwand", taste: "2" });
  });
});
