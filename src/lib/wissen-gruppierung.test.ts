import { describe, it, expect } from "vitest";
import {
  istWebsiteFakt, websiteThema, istUngeprueft, gruppiere,
  angabenZahl, auswahl, sammelMeldung,
  WEBSITE_THEMEN, THEMA_LABEL,
} from "@/lib/wissen-gruppierung";
import type { JanaKnowledgeFact } from "@/lib/api-client";

// Ein Fakt, so wie ihn die memory-engine liefert. Nur die Felder, die zaehlen.
function fakt(p: Partial<JanaKnowledgeFact> & { id: number }): JanaKnowledgeFact {
  return {
    id: p.id,
    category: (p.category ?? "policy") as JanaKnowledgeFact["category"],
    fact_key: p.fact_key ?? "k" + p.id,
    fact_text: p.fact_text ?? "Ein Satz.",
    status: (p.status ?? "proposed") as JanaKnowledgeFact["status"],
    source: (p.source ?? "website") as JanaKnowledgeFact["source"],
    evidence: p.evidence === undefined ? { kind: "website_scan", website_category: "ruecknahme" } : p.evidence,
    confidence: p.confidence ?? 0.95,
    proposed_at: null,
    decided_at: p.decided_at ?? null,
    decided_by: p.decided_by ?? null,
    updated_at: null,
  };
}

describe("Herkunft einer Angabe", () => {
  it("erkennt eine Website-Angabe am Beleg, nicht an der Quelle", () => {
    // Angaben von VOR Migration v1.45 tragen source="learned", stammen aber von
    // der Website. Wer auf source prueft, uebersieht genau die.
    const alt = fakt({ id: 1, source: "learned", evidence: { kind: "website_scan", website_category: "zahlung" } });
    expect(istWebsiteFakt(alt)).toBe(true);
    expect(websiteThema(alt)).toBe("zahlung");
  });

  it("erkennt eine gelernte Angabe nicht als Website-Angabe", () => {
    const gelernt = fakt({ id: 2, source: "learned", evidence: { kind: "correction_cluster", count: 4 } });
    expect(istWebsiteFakt(gelernt)).toBe(false);
    expect(websiteThema(gelernt)).toBeNull();
  });

  it("vertraegt einen fehlenden Beleg", () => {
    expect(istWebsiteFakt(fakt({ id: 3, evidence: null }))).toBe(false);
    expect(websiteThema(fakt({ id: 4, evidence: null }))).toBeNull();
  });

  it("verwirft ein unbekanntes Thema, statt es zu erfinden", () => {
    const f = fakt({ id: 5, evidence: { kind: "website_scan", website_category: "garantie" } });
    expect(websiteThema(f)).toBeNull();
  });

  it("normalisiert Gross-/Kleinschreibung und Leerzeichen", () => {
    const f = fakt({ id: 6, evidence: { kind: "website_scan", website_category: "  RUECKNAHME " } });
    expect(websiteThema(f)).toBe("ruecknahme");
  });
});

describe("Marker: uebernommen, aber noch nicht angesehen", () => {
  it("greift bei bestaetigt ohne Entscheider aus dem Website-Scan", () => {
    expect(istUngeprueft(fakt({ id: 10, status: "confirmed", decided_by: null }))).toBe(true);
  });

  it("greift NICHT, wenn ein Mensch entschieden hat", () => {
    expect(istUngeprueft(fakt({ id: 11, status: "confirmed", decided_by: "leon@useeasy.ai" }))).toBe(false);
  });

  it("greift NICHT bei einer offenen Angabe", () => {
    expect(istUngeprueft(fakt({ id: 12, status: "proposed", decided_by: null }))).toBe(false);
  });

  // Der Wizard schreibt ebenfalls direkt bestaetigt und ohne Entscheider. Wuerde
  // der Marker nur auf status+decided_by sehen, bekaeme der Kunde bei seinen
  // EIGENEN Briefing-Antworten den Hinweis "noch nicht von Ihnen geprueft".
  it("greift NICHT bei einer bestaetigten Briefing-Antwort des Kunden", () => {
    const briefing = fakt({
      id: 13, status: "confirmed", source: "briefing", decided_by: null,
      evidence: { kind: undefined },
    });
    expect(istUngeprueft(briefing)).toBe(false);
  });

  it("greift NICHT bei einer manuell angelegten Angabe", () => {
    const manuell = fakt({ id: 14, status: "confirmed", source: "manual", decided_by: null, evidence: null });
    expect(istUngeprueft(manuell)).toBe(false);
  });
});

describe("Buendelung nach Thema", () => {
  it("macht aus vielen Zeilen wenige Karten", () => {
    const f = [
      fakt({ id: 1, evidence: { kind: "website_scan", website_category: "ruecknahme" } }),
      fakt({ id: 2, evidence: { kind: "website_scan", website_category: "ruecknahme" } }),
      fakt({ id: 3, evidence: { kind: "website_scan", website_category: "ruecknahme" } }),
      fakt({ id: 4, evidence: { kind: "website_scan", website_category: "zahlung" } }),
    ];
    const g = gruppiere(f);
    expect(g).toHaveLength(2);
    expect(g[0].label).toBe("Widerruf und Rücksendung");
    expect(g[0].facts.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(g[1].label).toBe("Zahlung");
  });

  it("stellt die bindenden Themen nach vorn", () => {
    const f = [
      fakt({ id: 1, evidence: { kind: "website_scan", website_category: "standort" } }),
      fakt({ id: 2, evidence: { kind: "website_scan", website_category: "ruecknahme" } }),
      fakt({ id: 3, evidence: { kind: "website_scan", website_category: "lieferung" } }),
    ];
    expect(gruppiere(f).map((x) => x.key)).toEqual(["web:ruecknahme", "web:lieferung", "web:standort"]);
  });

  it("sortiert innerhalb einer Gruppe stabil nach id", () => {
    const f = [
      fakt({ id: 9, evidence: { kind: "website_scan", website_category: "zahlung" } }),
      fakt({ id: 2, evidence: { kind: "website_scan", website_category: "zahlung" } }),
      fakt({ id: 5, evidence: { kind: "website_scan", website_category: "zahlung" } }),
    ];
    expect(gruppiere(f)[0].facts.map((x) => x.id)).toEqual([2, 5, 9]);
  });

  it("gibt Angaben ohne Website-Herkunft eine eigene Gruppe mit grober Kategorie", () => {
    const f = [
      fakt({ id: 1, category: "sla", evidence: { kind: "correction_cluster" } }),
      fakt({ id: 2, evidence: { kind: "website_scan", website_category: "zahlung" } }),
    ];
    const g = gruppiere(f);
    expect(g.map((x) => x.label)).toEqual(["Zahlung", "Reaktionszeiten"]);
    expect(g[0].ausWebsite).toBe(true);
    expect(g[1].ausWebsite).toBe(false);
  });

  it("wirft nichts weg: die Summe der Gruppen ist die Zahl der Angaben", () => {
    const themen = ["ruecknahme", "lieferung", "zahlung", "rechtliches", "produkt", "standort"];
    const f = themen.map((c, i) => fakt({ id: i + 1, evidence: { kind: "website_scan", website_category: c } }));
    const g = gruppiere(f);
    expect(g.reduce((n, x) => n + x.facts.length, 0)).toBe(f.length);
  });

  it("vertraegt leer, null und undefined", () => {
    expect(gruppiere([])).toEqual([]);
    expect(gruppiere(null)).toEqual([]);
    expect(gruppiere(undefined)).toEqual([]);
  });

  it("stolpert nicht ueber eine kaputte Zeile", () => {
    const f = [null as unknown as JanaKnowledgeFact, fakt({ id: 1 })];
    expect(gruppiere(f)).toHaveLength(1);
  });

  it("jedes der acht Themen hat einen Namen in Kundensprache", () => {
    for (const th of WEBSITE_THEMEN) {
      expect(THEMA_LABEL[th]).toBeTruthy();
      expect(THEMA_LABEL[th]).not.toBe(th);
    }
  });
});

describe("Auswahl fuer den Sammelklick", () => {
  const drei = [fakt({ id: 1 }), fakt({ id: 2 }), fakt({ id: 3 })];

  it("nimmt ohne Abwahl alles", () => {
    expect(auswahl(drei, new Set())).toEqual([1, 2, 3]);
  });

  it("laesst Abgewaehltes weg", () => {
    expect(auswahl(drei, new Set([2]))).toEqual([1, 3]);
  });

  // Der gefaehrliche Kurzschluss: "keine Auswahl heisst alles". Wer alles
  // abwaehlt, will nichts bestaetigen - nicht alles.
  it("schickt nichts ab, wenn alles abgewaehlt ist", () => {
    expect(auswahl(drei, new Set([1, 2, 3]))).toEqual([]);
  });

  it("vertraegt leer", () => {
    expect(auswahl([], new Set())).toEqual([]);
    expect(auswahl(null, new Set([1]))).toEqual([]);
  });
});

describe("Meldungen", () => {
  it("zaehlt in Einzahl und Mehrzahl richtig", () => {
    expect(angabenZahl(1)).toBe("1 Angabe");
    expect(angabenZahl(4)).toBe("4 Angaben");
    expect(angabenZahl(0)).toBe("0 Angaben");
  });

  it("meldet den vollen Erfolg", () => {
    expect(sammelMeldung(4, 0)).toBe("4 Angaben übernommen.");
    expect(sammelMeldung(1, 0)).toBe("1 Angabe übernommen.");
  });

  // Ein Teilerfolg darf nicht als Erfolg gemeldet werden, sonst sucht der Kunde
  // die uebrigen nie wieder.
  it("meldet einen Teilerfolg als Teilerfolg", () => {
    expect(sammelMeldung(6, 2)).toContain("6 von 8");
    expect(sammelMeldung(6, 2)).toContain("noch offen");
  });

  it("meldet den vollen Fehlschlag als Fehlschlag", () => {
    expect(sammelMeldung(0, 3)).toContain("Keine der 3");
    expect(sammelMeldung(0, 3)).not.toContain("übernommen.");
    expect(sammelMeldung(0, 1)).toContain("nicht übernommen");
  });

  it("meldet ehrlich, wenn nichts ausgewaehlt war", () => {
    expect(sammelMeldung(0, 0)).toBe("Nichts ausgewählt.");
  });
});
