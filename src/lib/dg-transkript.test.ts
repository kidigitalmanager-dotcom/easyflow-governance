import { describe, it, expect } from "vitest";
import {
  deute, fensterFort, fensterText, verlaufFort, sprecherName,
  KONFIDENZ_SCHWELLE, FENSTER, VERLAUF_DECKEL, type Zeile,
} from "./dg-transkript";

/** Eine Deepgram-Nachricht, wie sie ueber die Leitung kommt. */
const dg = (o: {
  text?: string; final?: boolean; kanal?: number; konf?: number; typ?: string;
}) => ({
  type: o.typ ?? "Results",
  is_final: o.final ?? false,
  channel_index: o.kanal === undefined ? undefined : [o.kanal, 2],
  channel: { alternatives: [{ transcript: o.text ?? "", confidence: o.konf }] },
});

const zeile = (text: string, sprecher: Zeile["sprecher"]): Zeile => ({ text, sprecher, unsicher: false });

describe("deute — was ueberhaupt eine Zeile ist", () => {
  it("nur Results zaehlt", () => {
    expect(deute(dg({ text: "Hallo", typ: "Metadata" }), true).art).toBe("nichts");
    expect(deute(dg({ text: "Hallo", typ: "UtteranceEnd" }), true).art).toBe("nichts");
    expect(deute(dg({ text: "Hallo" }), true).art).toBe("zwischenstand");
  });

  it("🔴 Unfug fuehrt zu 'nichts', nicht zu einem Absturz mitten im Gespraech", () => {
    for (const roh of [null, undefined, {}, "text", 42, [], { type: "Results" }]) {
      expect(deute(roh, true).art).toBe("nichts");
    }
    expect(deute({ type: "Results", channel: { alternatives: [] } }, true).art).toBe("nichts");
  });

  it("leere und rein weisse Transkripte sind nichts", () => {
    expect(deute(dg({ text: "" }), true).art).toBe("nichts");
    expect(deute(dg({ text: "   " }), true).art).toBe("nichts");
  });

  it("Text wird getrimmt", () => {
    const r = deute(dg({ text: "  Guten Tag  " }), true);
    if (r.art === "nichts") throw new Error("sollte eine Zeile sein");
    expect(r.zeile.text).toBe("Guten Tag");
  });

  it("final und Zwischenstand werden unterschieden", () => {
    expect(deute(dg({ text: "a", final: true }), true).art).toBe("final");
    expect(deute(dg({ text: "a", final: false }), true).art).toBe("zwischenstand");
  });
});

describe("Wer gesprochen hat", () => {
  it("🔴 Kanal 1 ist der Kunde, Kanal 0 der Vertriebler", () => {
    // Vertauscht heisst: die Einwand-Erkennung hoert auf die eigene Stimme.
    // Genau das war E4, und es ist von aussen nicht zu sehen — der Text
    // stimmt ja, nur die Zuordnung nicht.
    const kunde = deute(dg({ text: "Zu teuer", kanal: 1 }), true);
    const rep = deute(dg({ text: "Guten Tag", kanal: 0 }), true);
    if (kunde.art === "nichts" || rep.art === "nichts") throw new Error("beide sollten Zeilen sein");
    expect(kunde.zeile.sprecher).toBe("kunde");
    expect(rep.zeile.sprecher).toBe("rep");
  });

  it("🔴 ohne Stereo wird nicht geraten — der Sprecher bleibt offen", () => {
    // Bei Mono liefert Deepgram immer channel_index 0. Wer daraus "rep"
    // macht, behauptet etwas, das er nicht weiss.
    const r = deute(dg({ text: "Zu teuer", kanal: 0 }), false);
    if (r.art === "nichts") throw new Error("sollte eine Zeile sein");
    expect(r.zeile.sprecher).toBeNull();
    expect(sprecherName(r.zeile.sprecher)).toBe("");
  });

  it("fehlender channel_index gilt als Kanal 0", () => {
    const r = deute(dg({ text: "a" }), true);
    if (r.art === "nichts") throw new Error("sollte eine Zeile sein");
    expect(r.zeile.sprecher).toBe("rep");
  });
});

describe("Konfidenz — ausgrauen ja, verschweigen nein", () => {
  it("unter der Schwelle gilt als unsicher", () => {
    const r = deute(dg({ text: "murmel", konf: 0.4 }), true);
    if (r.art === "nichts") throw new Error("sollte eine Zeile sein");
    expect(r.zeile.unsicher).toBe(true);
    expect(r.zeile.text).toBe("murmel"); // 🔴 trotzdem da
  });

  it("an der Schwelle noch sicher", () => {
    const an = deute(dg({ text: "a", konf: KONFIDENZ_SCHWELLE }), true);
    const drunter = deute(dg({ text: "a", konf: KONFIDENZ_SCHWELLE - 0.01 }), true);
    if (an.art === "nichts" || drunter.art === "nichts") throw new Error("Zeilen erwartet");
    expect(an.zeile.unsicher).toBe(false);
    expect(drunter.zeile.unsicher).toBe(true);
  });

  it("🔴 ohne Konfidenzangabe wird nichts unterstellt", () => {
    const r = deute(dg({ text: "a" }), true);
    if (r.art === "nichts") throw new Error("sollte eine Zeile sein");
    expect(r.zeile.unsicher).toBe(false);
  });
});

describe("fensterFort — 🔴 das Klassifikations-Fenster (E4)", () => {
  it("nimmt nur den Kunden auf", () => {
    // Das Fenster war einmal txFull.slice(-700) und enthielt die eigene
    // Stimme. Folge: ein Einwand von vor Minuten erschien erneut, weil der
    // Vertriebler ihn selbst wiederholt hatte.
    let f: string[] = [];
    f = fensterFort(f, zeile("Guten Tag, mein Name ist Leon", "rep"), true);
    expect(f).toEqual([]);
    f = fensterFort(f, zeile("Zu teuer", "kunde"), true);
    expect(f).toEqual(["Zu teuer"]);
  });

  it("🔴 genau die letzten ZWEI Aeusserungen, nicht mehr", () => {
    let f: string[] = [];
    for (const t of ["eins", "zwei", "drei", "vier"]) f = fensterFort(f, zeile(t, "kunde"), true);
    expect(f).toEqual(["drei", "vier"]);
    expect(f).toHaveLength(FENSTER);
  });

  it("bei Mono zaehlt alles — schlechter, aber ehrlich", () => {
    let f: string[] = [];
    f = fensterFort(f, zeile("a", null), false);
    f = fensterFort(f, zeile("b", null), false);
    expect(f).toEqual(["a", "b"]);
  });

  it("🔴 bei Mono wird eine rep-Zeile nicht heimlich gefiltert", () => {
    // Bei Mono ist "rep" nie gesetzt; waere die Bedingung ohne den
    // stereo-Vorbehalt geschrieben, bliebe das Fenster fuer immer leer und
    // es wuerde nie ein Einwand erkannt.
    expect(fensterFort([], zeile("a", "rep"), false)).toEqual(["a"]);
  });

  it("fensterText fuegt zusammen und ist leer, wenn nichts da ist", () => {
    expect(fensterText([])).toBe("");
    expect(fensterText(["Zu teuer", "Kein Bedarf"])).toBe("Zu teuer\nKein Bedarf");
    expect(fensterText(["  "])).toBe("");
  });

  it("das Fenster bleibt unveraendert, wenn nichts hineingehoert", () => {
    const vorher = ["a", "b"];
    const nachher = fensterFort(vorher, zeile("mein Text", "rep"), true);
    expect(nachher).toBe(vorher);
  });
});

describe("verlaufFort — der sichtbare Verlauf", () => {
  it("haengt hinten an", () => {
    const v = verlaufFort(verlaufFort([], zeile("a", "rep")), zeile("b", "kunde"));
    expect(v.map((z) => z.text)).toEqual(["a", "b"]);
  });

  it("🔴 deckelt bei 100, damit ein langes Gespraech den Browser nicht vollaeuft", () => {
    let v: Zeile[] = [];
    for (let i = 0; i < 150; i++) v = verlaufFort(v, zeile(`z${i}`, "kunde"));
    expect(v).toHaveLength(VERLAUF_DECKEL);
    expect(v[0].text).toBe("z50");
    expect(v[v.length - 1].text).toBe("z149");
  });

  it("aendert das uebergebene Feld nicht", () => {
    const vorher: Zeile[] = [zeile("a", "rep")];
    verlaufFort(vorher, zeile("b", "kunde"));
    expect(vorher).toHaveLength(1);
  });
});

describe("sprecherName — der echte Name, nicht 'Rep'", () => {
  it("der Kunde heisst Kunde", () => {
    expect(sprecherName("kunde")).toBe("Kunde");
    expect(sprecherName("kunde", "Leon")).toBe("Kunde");
  });

  it("🔴 der Vertriebler heisst wie er heisst", () => {
    expect(sprecherName("rep", "Leon Kaiser")).toBe("Leon Kaiser");
  });

  it("ohne Namen steht da 'Ich', nicht 'undefined'", () => {
    expect(sprecherName("rep")).toBe("Ich");
    expect(sprecherName("rep", null)).toBe("Ich");
    expect(sprecherName("rep", "   ")).toBe("Ich");
  });

  it("ein unbekannter Sprecher bekommt keine Beschriftung", () => {
    expect(sprecherName(null)).toBe("");
    expect(sprecherName(null, "Leon")).toBe("");
  });
});

describe("Ein Gespraech am Stueck", () => {
  it("🔴 der Vertriebler nennt einen Einwand, das Fenster bleibt sauber", () => {
    // Der Klassiker: "Viele sagen erst mal, das sei zu teuer." Steht das im
    // Fenster, feuert die Erkennung auf den eigenen Satz.
    const strom = [
      dg({ text: "Guten Tag, Leon von UseEasy", kanal: 0, final: true }),
      dg({ text: "Viele sagen erst mal, das sei zu teuer", kanal: 0, final: true }),
      dg({ text: "Hm", kanal: 1, final: false }),
      dg({ text: "Wir haben gerade kein Budget", kanal: 1, final: true }),
    ];
    let fenster: string[] = [];
    let verlauf: Zeile[] = [];
    for (const n of strom) {
      const r = deute(n, true);
      if (r.art === "nichts") continue;
      if (r.art !== "final") continue; // Zwischenstaende gehen nicht ins Fenster
      fenster = fensterFort(fenster, r.zeile, true);
      verlauf = verlaufFort(verlauf, r.zeile);
    }
    expect(fensterText(fenster)).toBe("Wir haben gerade kein Budget");
    // 🔴 kein Rueckfall auf ein breites Fenster: vor dem ersten Kundensatz
    // bleibt der Klassifikator still, statt die eigene Stimme zu deuten.
    expect(fensterText([])).toBe("");
    expect(fensterText(fenster)).not.toContain("zu teuer");
    expect(verlauf).toHaveLength(3);
    expect(verlauf.filter((z) => z.sprecher === "kunde")).toHaveLength(1);
  });
});
