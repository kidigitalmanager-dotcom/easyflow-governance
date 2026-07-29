// ---------------------------------------------------------------------------
// Jana-Wissen: Buendelung der offenen Angaben nach Thema (Paket 2, Weg A)
//
// Vorher stand jede gefundene Angabe als eigene Zeile da. Bei 25 Angaben waren
// das 25 Entscheidungen, und Leons Beschwerde dazu war berechtigt: "das nervt
// viele Leute". Gemessen an 1603 Fakten von 80 Kunden verteilen sich diese 25
// Angaben auf im Median nur 5 Themen. Aus 25 Zeilen werden also 5 Karten.
//
// Dazu kommt seit dem 29.07. die Klassen-Trennung nach Rechtsfolge im Backend:
// Angaben ohne Rechtsfolge (Produkte, Erreichbarkeit, Standort, Ansprechpartner)
// gelten sofort und stehen hier gar nicht mehr. Uebrig bleiben die vier Themen,
// bei denen ein Fehler den Kunden bindet - und die sind es wert, angesehen zu
// werden.
//
// Diese Datei ist bewusst frei von React: sie laesst sich ohne DOM pruefen.
// ---------------------------------------------------------------------------
import type { JanaKnowledgeFact } from "@/lib/api-client";

// Die acht Themen, die der Website-Scan vergibt (website_facts.js).
// Reihenfolge = Anzeige-Reihenfolge. Bewusst zuerst das, was den Kunden bindet.
export const WEBSITE_THEMEN = [
  "ruecknahme",
  "lieferung",
  "zahlung",
  "rechtliches",
  "produkt",
  "erreichbarkeit",
  "ansprechpartner",
  "standort",
] as const;

export type WebsiteThema = (typeof WEBSITE_THEMEN)[number];

// Kundensprache, nicht Datenbanksprache.
export const THEMA_LABEL: Record<string, string> = {
  ruecknahme: "Widerruf und Rücksendung",
  lieferung: "Lieferung und Versand",
  zahlung: "Zahlung",
  rechtliches: "Rechtliches",
  produkt: "Produkte und Leistungen",
  erreichbarkeit: "Erreichbarkeit und Zeiten",
  ansprechpartner: "Ansprechpartner",
  standort: "Standort",
};

// Fuer Angaben, die NICHT von der Website stammen (gelernt, Briefing, manuell):
// da gibt es kein Website-Thema, dann traegt die grobe Kategorie den Namen.
export const KATEGORIE_LABEL: Record<string, string> = {
  product: "Produkt",
  process: "Prozess",
  sla: "Reaktionszeiten",
  policy: "Regeln",
  team: "Team",
  style: "Stil und Ton",
};

/**
 * Stammt die Angabe aus dem Website-Scan?
 *
 * Geprueft wird evidence.kind und NICHT fact.source: Angaben, die vor Migration
 * v1.45 geschrieben wurden, tragen noch source="learned", obwohl sie von der
 * Website stammen. Die Wahrheit steht immer im Beleg. (Dieselbe Entscheidung
 * wie in JanaKnowledgeTab.isWebsiteFact - hier noch einmal, damit dieses Modul
 * fuer sich pruefbar bleibt.)
 */
export function istWebsiteFakt(fact: JanaKnowledgeFact): boolean {
  return fact?.evidence?.kind === "website_scan";
}

/** Das Website-Thema einer Angabe, oder null wenn sie nicht von dort kommt. */
export function websiteThema(fact: JanaKnowledgeFact): string | null {
  if (!istWebsiteFakt(fact)) return null;
  const c = fact.evidence?.website_category;
  if (typeof c !== "string") return null;
  const norm = c.trim().toLowerCase();
  return (WEBSITE_THEMEN as readonly string[]).includes(norm) ? norm : null;
}

/**
 * Von der Website uebernommen, aber vom Kunden noch nicht angesehen.
 *
 * Der Marker braucht KEINE eigene Spalte: das Backend setzt beim automatischen
 * Bestaetigen bewusst kein decided_by, weil niemand entschieden hat. Bestaetigt
 * ohne Entscheider und aus dem Website-Scan heisst also genau das hier.
 */
export function istUngeprueft(fact: JanaKnowledgeFact): boolean {
  return fact?.status === "confirmed" && !fact?.decided_by && istWebsiteFakt(fact);
}

export interface WissensGruppe {
  key: string;
  label: string;
  /** true, wenn die Gruppe aus einem Website-Thema kommt (sonst grobe Kategorie). */
  ausWebsite: boolean;
  facts: JanaKnowledgeFact[];
}

function gruppenSchluessel(fact: JanaKnowledgeFact): { key: string; label: string; ausWebsite: boolean } {
  const thema = websiteThema(fact);
  if (thema) return { key: "web:" + thema, label: THEMA_LABEL[thema] || thema, ausWebsite: true };
  const cat = String(fact?.category || "");
  return { key: "cat:" + cat, label: KATEGORIE_LABEL[cat] || cat || "Sonstiges", ausWebsite: false };
}

// Website-Themen zuerst (in der oben festgelegten Reihenfolge), danach die
// groben Kategorien. Stabil, damit die Karten beim Neuladen nicht springen.
function ordnung(key: string): number {
  if (key.startsWith("web:")) {
    const i = (WEBSITE_THEMEN as readonly string[]).indexOf(key.slice(4));
    return i < 0 ? 900 : i;
  }
  return 1000;
}

/**
 * Angaben nach Thema buendeln.
 *
 * Leere Gruppen entstehen nie: gebuendelt wird, was da ist. Die Reihenfolge
 * innerhalb einer Gruppe folgt der id, damit sie sich nicht bei jedem Laden
 * aendert.
 */
export function gruppiere(facts: JanaKnowledgeFact[] | null | undefined): WissensGruppe[] {
  const map = new Map<string, WissensGruppe>();
  for (const f of facts || []) {
    if (!f) continue;
    const { key, label, ausWebsite } = gruppenSchluessel(f);
    let g = map.get(key);
    if (!g) { g = { key, label, ausWebsite, facts: [] }; map.set(key, g); }
    g.facts.push(f);
  }
  const out = Array.from(map.values());
  for (const g of out) g.facts.sort((a, b) => (a.id || 0) - (b.id || 0));
  out.sort((a, b) => {
    const d = ordnung(a.key) - ordnung(b.key);
    return d !== 0 ? d : a.label.localeCompare(b.label, "de");
  });
  return out;
}

/** "4 Angaben" / "1 Angabe" — Einzahl ist kein Detail, sondern Sorgfalt. */
export function angabenZahl(n: number): string {
  return n === 1 ? "1 Angabe" : n + " Angaben";
}

/**
 * Welche Angaben schickt der Sammelklick wirklich ab?
 *
 * Alles ist vorausgewaehlt; abgewaehlte Ids fallen raus. Bewusst KEIN
 * Kurzschluss auf "leere Abwahl heisst alles": wer alles abwaehlt, schickt
 * nichts ab, und der Knopf gehoert dann abgeschaltet.
 */
export function auswahl(facts: JanaKnowledgeFact[] | null | undefined, abgewaehlt: ReadonlySet<number>): number[] {
  return (facts || []).filter((f) => f && !abgewaehlt.has(f.id)).map((f) => f.id);
}

/**
 * Ergebnis eines Sammelklicks in einen Satz, den der Kunde versteht.
 *
 * Ein Teilerfolg wird als Teilerfolg gemeldet und nicht als Erfolg: wer 8
 * Angaben bestaetigt und 6 durchbekommt, muss das sehen, sonst sucht er die
 * uebrigen zwei nie wieder.
 */
export function sammelMeldung(ok: number, fehler: number): string {
  if (fehler === 0 && ok === 0) return "Nichts ausgewählt.";
  if (fehler === 0) return ok === 1 ? "1 Angabe übernommen." : ok + " Angaben übernommen.";
  if (ok === 0) return fehler === 1
    ? "Die Angabe konnte nicht übernommen werden. Bitte erneut versuchen."
    : "Keine der " + fehler + " Angaben konnte übernommen werden. Bitte erneut versuchen.";
  return ok + " von " + (ok + fehler) + " Angaben übernommen. Der Rest steht noch offen.";
}
