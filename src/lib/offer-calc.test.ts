// Cross-Check: der Client-Spiegel (offer-calc.ts) MUSS dieselben Zahlen liefern
// wie die Server-Engine (offer_generator.js). Gleiche bekannte Werte wie test_engine.js.
//
// 2026-07-27: Diese Datei war ein eigenstaendiges Skript mit eigenen PASS/FAIL-
// Zaehlern (Aufruf ueber `node --experimental-strip-types`). Vitest hat sie zwar
// eingesammelt, aber keine Suite darin gefunden und die Testlaeufe rot gemacht.
// Ergebnis: dreissig Pruefungen der GELD-Mathematik liefen faktisch nie mit.
// Jetzt als vitest-Suite, inhaltlich unveraendert.
import { describe, it, expect } from "vitest";
import { computeOffer, computePosition, money2, fmtEUR } from "./offer-calc";

describe("money2 (float-sichere Rundung)", () => {
  it("rundet kaufmaennisch", () => {
    expect(money2(1.005)).toBe(1.01);
    expect(money2(2.675)).toBe(2.68);
    expect(money2(0.005)).toBe(0.01);
    expect(money2(3.192)).toBe(3.19);
  });
});

describe("computeOffer", () => {
  it("rechnet 19 Prozent auf einer Position", () => {
    const r = computeOffer([{ menge: 2, einzelpreis_netto: 45, mwst_satz: 19 }]);
    expect(r.totals.netto).toBe(90);
    expect(r.totals.mwst_19).toBe(17.1);
    expect(r.totals.brutto).toBe(107.1);
    expect(r.incomplete).toBe(false);
  });

  it("trennt gemischte Saetze 7 und 19", () => {
    const r = computeOffer([
      { menge: 1, einzelpreis_netto: 100, mwst_satz: 19 },
      { menge: 1, einzelpreis_netto: 50, mwst_satz: 7 },
    ]);
    expect(r.totals.mwst_19).toBe(19);
    expect(r.totals.mwst_7).toBe(3.5);
    expect(r.totals.brutto).toBe(172.5);
  });

  it("setzt bei Paragraph 13b die Steuer auf 0 und weist darauf hin", () => {
    const r = computeOffer([{ menge: 1, einzelpreis_netto: 100, mwst_satz: 19 }], { reverse_charge: true });
    expect(r.totals.mwst_gesamt).toBe(0);
    expect(r.totals.brutto).toBe(100);
    expect(r.totals.hinweise.some((h) => /§13b/.test(h))).toBe(true);
  });

  it("setzt bei Paragraph 19 die Steuer auf 0 und weist darauf hin", () => {
    const r = computeOffer([{ menge: 1, einzelpreis_netto: 100, mwst_satz: 19 }], { kleinunternehmer: true });
    expect(r.totals.mwst_gesamt).toBe(0);
    expect(r.totals.hinweise.some((h) => /§19/.test(h))).toBe(true);
  });

  it("erfindet ohne Einzelpreis keine Summe", () => {
    const r = computeOffer([
      { menge: 2, einzelpreis_netto: 45, mwst_satz: 19 },
      { menge: 1, einzelpreis_netto: null, mwst_satz: 19 },
    ]);
    expect(r.incomplete).toBe(true);
    expect(r.totals.netto).toBe(90); // nur die bepreiste Position
    expect(r.positions[1].netto).toBeNull();
    expect(r.positions[1].needs_price).toBe(true);
  });

  it("haelt die Satz-Summe autoritativ (Rundungsdrift)", () => {
    const r = computeOffer([
      { menge: 1, einzelpreis_netto: 8.4, mwst_satz: 19 },
      { menge: 1, einzelpreis_netto: 8.4, mwst_satz: 19 },
    ]);
    expect(r.totals.mwst_19).toBe(3.19);
    expect(r.totals.brutto).toBe(19.99);
  });

  it("rechnet den Gesamt-Rabatt in Prozent", () => {
    const r = computeOffer(
      [
        { menge: 1, einzelpreis_netto: 60, mwst_satz: 19 },
        { menge: 1, einzelpreis_netto: 40, mwst_satz: 19 },
      ],
      { rabatt_gesamt_prozent: 10 },
    );
    expect(r.totals.netto_nach_rabatt).toBe(90);
    expect(r.totals.brutto).toBe(107.1);
  });

  it("weist Skonto nur informativ aus, ohne den Bruttobetrag zu aendern", () => {
    const r = computeOffer([{ menge: 2, einzelpreis_netto: 45, mwst_satz: 19 }], {
      skonto_prozent: 2,
      skonto_tage: 14,
    });
    expect(r.totals.brutto).toBe(107.1);
    expect(r.totals.skonto_betrag).toBe(2.14);
  });
});

describe("computePosition", () => {
  it("versteht deutsche Zahlen mit Komma", () => {
    const p = computePosition({ menge: "2,5", einzelpreis_netto: "45,50", mwst_satz: 19 });
    expect(p.netto).toBe(113.75);
  });

  it("meldet einen unzulaessigen Steuersatz", () => {
    const p = computePosition({ menge: 1, einzelpreis_netto: 10, mwst_satz: 10 });
    expect(p.errors ?? []).toContain("invalid_mwst_satz");
  });
});

describe("fmtEUR", () => {
  it("formatiert Betraege und fehlende Werte", () => {
    expect(fmtEUR(107.1)).toBe("107,10 EUR");
    expect(fmtEUR(null)).toBe("—");
  });
});
