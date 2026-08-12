import { describe, it, expect } from "vitest";
import {
  AUS, geraetStartet, geraetBereit, waehlen, verbunden, auflegen, beendet,
  gescheitert, fehlerQuittiert, kannWaehlen, kannAuflegen, imGespraech,
  nummerNormalisieren, nummerLesbar, dauerSekunden, dauerLesbar, phaseText,
  type AnrufZustand,
} from "./anruf-zustand";

const T0 = 1786564800000; // eingefroren, 12.08.2026 20:00:00 UTC

/** Bis "bereit" durchspielen — der Ausgangspunkt fast aller Faelle. */
const bereit = (): AnrufZustand => geraetBereit(geraetStartet(AUS));

const gewaehlt = (nr = "040 89740100"): AnrufZustand => {
  const r = waehlen(bereit(), nr);
  if ("grund" in r) throw new Error("sollte waehlen koennen: " + r.grund);
  return r.zustand;
};

describe("nummerNormalisieren — lieber ablehnen als raten", () => {
  it("nimmt E.164 unveraendert", () => {
    expect(nummerNormalisieren("+494089740100")).toBe("+494089740100");
  });

  it("macht aus der nationalen Schreibweise +49", () => {
    expect(nummerNormalisieren("040 89740100")).toBe("+494089740100");
    expect(nummerNormalisieren("0176/12345678")).toBe("+4917612345678");
    expect(nummerNormalisieren("(040) 8974-0100")).toBe("+494089740100");
  });

  it("🔴 00 ist die internationale Vorwahl, nicht die deutsche Null", () => {
    // Der bequeme Fehler: die fuehrende 0 abschneiden und +49 davorsetzen.
    // Aus 0043… wuerde dann +4943… — ein Anruf nach Deutschland statt Oesterreich.
    expect(nummerNormalisieren("0043 1 2345678")).toBe("+4312345678");
    expect(nummerNormalisieren("00494089740100")).toBe("+494089740100");
    expect(nummerNormalisieren("0043 1 2345678")).not.toContain("+4943");
  });

  it("🔴 was nicht eindeutig ist, wird abgelehnt", () => {
    for (const roh of ["", "   ", "12345", "abc", "+", "+0123456789", "0", "00", "089", null, undefined]) {
      expect(nummerNormalisieren(roh)).toBeNull();
    }
  });

  it("Leerzeichen, Punkte, Schraegstriche und Bindestriche stoeren nicht", () => {
    expect(nummerNormalisieren(" +49 40 . 8974-0100 ")).toBe("+494089740100");
  });

  it("🔴 die eingeklammerte Null faellt weg, sie wird nicht mitgewaehlt", () => {
    // "+49 (0)40 8974 0100" heisst: von aussen OHNE die 0. Wer nur die
    // Klammern entfernt, baut +49040… — Twilio nimmt das an und es erreicht
    // niemanden. Genau diese Schreibweise steht auf jeder zweiten Visitenkarte.
    expect(nummerNormalisieren("+49 (0)40 8974 0100")).toBe("+494089740100");
    expect(nummerNormalisieren("+49(0)17612345678")).toBe("+4917612345678");
    expect(nummerNormalisieren(" +49 ( 0 ) 40 8974-0100 ")).toBe("+494089740100");
    // Und die Gegenprobe: eine echte 0 mitten in der Nummer bleibt stehen.
    expect(nummerNormalisieren("+49 40 8974 0100")).toBe("+494089740100");
    expect(nummerNormalisieren("040 8974 0100")).toBe("+494089740100");
  });

  it("nummerLesbar behauptet keine Gliederung, die es nicht kennt", () => {
    expect(nummerLesbar(null)).toBe("–");
    expect(nummerLesbar("+494089740100")).toContain("+49");
  });
});

describe("Lebenslauf eines Gespraechs", () => {
  it("aus -> startet -> bereit", () => {
    expect(AUS.phase).toBe("aus");
    expect(kannWaehlen(AUS)).toBe(false);
    expect(geraetStartet(AUS).phase).toBe("startet");
    expect(kannWaehlen(geraetStartet(AUS))).toBe(false);
    expect(bereit().phase).toBe("bereit");
    expect(kannWaehlen(bereit())).toBe(true);
  });

  it("waehlen setzt die Nummer, aber noch keine Dauer", () => {
    const z = gewaehlt();
    expect(z.phase).toBe("waehlt");
    expect(z.nummer).toBe("+494089740100");
    expect(z.verbundenSeit).toBeNull();
    expect(dauerSekunden(z, T0)).toBeNull();
  });

  it("🔴 die Dauer zaehlt ab VERBUNDEN, nicht ab dem Waehlen", () => {
    // Der bequeme Fehler waere, beim Waehlen zu starten. Dann steht in der
    // Notiz eine Gespraechsdauer, die das Klingeln mitzaehlt.
    let z = gewaehlt();
    z = verbunden(z, T0 + 8000);
    expect(z.verbundenSeit).toBe(T0 + 8000);
    expect(dauerSekunden(z, T0 + 68000)).toBe(60);
  });

  it("🔴 kein zweites Gespraech waehrend eines laufenden", () => {
    const z = verbunden(gewaehlt(), T0);
    const r = waehlen(z, "0176 12345678");
    expect("grund" in r).toBe(true);
    if ("grund" in r) expect(r.grund).toContain("bereits");
  });

  it("auch waehrend des Waehlens kein zweiter Versuch", () => {
    const r = waehlen(gewaehlt(), "0176 12345678");
    expect("grund" in r).toBe(true);
  });

  it("🔴 ohne bereites Geraet wird gar nicht erst gewaehlt", () => {
    const r = waehlen(AUS, "040 89740100");
    expect("grund" in r).toBe(true);
    if ("grund" in r) expect(r.grund).toContain("nicht bereit");
  });

  it("🔴 eine unklare Nummer fuehrt zu einer Erklaerung, nicht zu einem Versuch", () => {
    const r = waehlen(bereit(), "12345");
    expect("grund" in r).toBe(true);
    if ("grund" in r) expect(r.grund).toContain("Vorwahl");
  });
});

describe("Auflegen", () => {
  it("🔴 geht aus JEDEM Zustand, in dem eine Leitung offen sein koennte", () => {
    expect(auflegen(gewaehlt()).phase).toBe("legt_auf");
    expect(auflegen(verbunden(gewaehlt(), T0)).phase).toBe("legt_auf");
    expect(auflegen(gescheitert(verbunden(gewaehlt(), T0), "weg")).phase).toBe("legt_auf");
  });

  it("tut nichts, wo gar keine Leitung offen ist", () => {
    expect(auflegen(AUS)).toBe(AUS);
    expect(auflegen(bereit()).phase).toBe("bereit");
  });

  it("kannAuflegen gilt beim Waehlen und im Gespraech", () => {
    expect(kannAuflegen(bereit())).toBe(false);
    expect(kannAuflegen(gewaehlt())).toBe(true);
    expect(kannAuflegen(verbunden(gewaehlt(), T0))).toBe(true);
  });

  it("🔴 wer selbst aufgelegt hat, steht auch dann im Ergebnis, wenn Twilio 'gegenseite' meldet", () => {
    // Twilio schickt beim eigenen Auflegen dasselbe disconnect-Ereignis.
    // Ohne den Blick auf den eigenen Zustand stuende in jeder Notiz
    // "Gegenseite hat aufgelegt".
    let z = verbunden(gewaehlt(), T0);
    z = auflegen(z);
    z = beendet(z, "gegenseite");
    expect(z.ende).toBe("aufgelegt");
  });

  it("legt die Gegenseite auf, steht das auch so drin", () => {
    const z = beendet(verbunden(gewaehlt(), T0), "gegenseite");
    expect(z.ende).toBe("gegenseite");
  });

  it("nach dem Ende ist das Telefon wieder bereit und die Nummer weg", () => {
    const z = beendet(auflegen(verbunden(gewaehlt(), T0)), "aufgelegt");
    expect(z.phase).toBe("bereit");
    expect(z.nummer).toBeNull();
    expect(z.verbundenSeit).toBeNull();
    expect(kannWaehlen(z)).toBe(true);
  });
});

describe("Fehler werden benannt, nicht verschluckt (E5)", () => {
  it("ein Fehler traegt seinen Text", () => {
    const z = gescheitert(gewaehlt(), "Mikrofon nicht freigegeben.");
    expect(z.phase).toBe("fehler");
    expect(z.fehler).toBe("Mikrofon nicht freigegeben.");
    expect(phaseText(z)).toBe("Mikrofon nicht freigegeben.");
  });

  it("🔴 auch ein Fehler ohne Text bleibt sichtbar", () => {
    expect(gescheitert(bereit(), "").fehler).toBe("Unbekannter Fehler.");
  });

  it("quittieren macht das Telefon wieder bedienbar", () => {
    const z = fehlerQuittiert(gescheitert(gewaehlt(), "weg"));
    expect(z.phase).toBe("bereit");
    expect(z.fehler).toBeNull();
    expect(kannWaehlen(z)).toBe(true);
  });

  it("quittieren tut nichts, wo kein Fehler steht", () => {
    const b = bereit();
    expect(fehlerQuittiert(b)).toBe(b);
  });
});

describe("Spaete Ereignisse duerfen nichts umwerfen", () => {
  it("🔴 ein spaetes 'Geraet bereit' wirft kein laufendes Gespraech zurueck", () => {
    // Das Twilio-Geraet meldet sich auch mitten im Gespraech neu an.
    const z = verbunden(gewaehlt(), T0);
    expect(geraetBereit(z)).toBe(z);
    expect(geraetBereit(gewaehlt()).phase).toBe("waehlt");
    expect(geraetBereit(auflegen(z)).phase).toBe("legt_auf");
  });

  it("'verbunden' ohne vorheriges Waehlen wird ignoriert", () => {
    const b = bereit();
    expect(verbunden(b, T0)).toBe(b);
  });

  it("ein 'beendet' im Ruhezustand tut nichts", () => {
    const b = bereit();
    expect(beendet(b, "gegenseite")).toBe(b);
    expect(beendet(AUS, "aufgelegt")).toBe(AUS);
  });
});

describe("imGespraech — der Riegel vor dem Audio-Graph", () => {
  it("🔴 nur im verbundenen Zustand, nirgends sonst", () => {
    expect(imGespraech(AUS)).toBe(false);
    expect(imGespraech(bereit())).toBe(false);
    expect(imGespraech(gewaehlt())).toBe(false);
    expect(imGespraech(verbunden(gewaehlt(), T0))).toBe(true);
    expect(imGespraech(auflegen(verbunden(gewaehlt(), T0)))).toBe(false);
  });
});

describe("Anzeige", () => {
  it("dauerLesbar zeigt Minuten und Sekunden", () => {
    expect(dauerLesbar(null)).toBe("–");
    expect(dauerLesbar(0)).toBe("0:00");
    expect(dauerLesbar(9)).toBe("0:09");
    expect(dauerLesbar(75)).toBe("1:15");
    expect(dauerLesbar(3600)).toBe("60:00");
  });

  it("negative Zeitspannen entstehen nicht, auch wenn die Uhr springt", () => {
    const z = verbunden(gewaehlt(), T0);
    expect(dauerSekunden(z, T0 - 5000)).toBe(0);
  });

  it("jede Phase hat einen Text", () => {
    expect(phaseText(AUS)).toBeTruthy();
    expect(phaseText(bereit())).toBe("bereit");
    expect(phaseText(gewaehlt())).toBe("wählt");
    expect(phaseText(verbunden(gewaehlt(), T0))).toBe("im Gespräch");
  });
});
