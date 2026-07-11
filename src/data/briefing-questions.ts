// ---------------------------------------------------------------------------
// B3.1 Briefing-Wizard: gefuehrter Fragenkatalog (branchen-bewusst).
//
// 12 gezielte Fragen entlang der Wissens-Kategorien. Der Tenant-Domain (aus
// useMe: user.domain) waehlt die Formulierung: real_estate (Hausverwaltung),
// ecom (E-Commerce) oder ein generischer Satz fuer alle uebrigen Branchen.
// Jede Antwort geht als 1-2 Saetze an die Server-Destillation (Haiku), die
// daraus einen bestaetigten Jana-Fakt macht. Kurz halten, jede Frage skippbar.
// ---------------------------------------------------------------------------

import type { JanaKnowledgeCategory } from "@/lib/api-client";

export interface BriefingQuestion {
  id: string;
  category: JanaKnowledgeCategory;
  question: string;
  placeholder: string;
  hint?: string;
}

// Basis-Katalog (generisch, gilt fuer alle Branchen ohne eigene Variante).
const BASE: BriefingQuestion[] = [
  {
    id: "product_main",
    category: "product",
    question: "Was bietet ihr an?",
    placeholder: "Beschreibe euer Hauptprodukt oder eure Hauptleistung in ein, zwei Sätzen.",
  },
  {
    id: "product_audience",
    category: "product",
    question: "Wer sind eure typischen Kunden?",
    placeholder: "z.B. Privatkunden, kleine Betriebe, Großhändler …",
  },
  {
    id: "process_top_reason",
    category: "process",
    question: "Warum schreiben euch Kunden am häufigsten, und wie geht ihr damit um?",
    placeholder: "Das häufigste Anliegen und wie ihr es normalerweise bearbeitet.",
  },
  {
    id: "process_standard",
    category: "process",
    question: "Welcher Vorgang wiederholt sich bei euch am meisten und läuft immer gleich ab?",
    placeholder: "Beschreibe den typischen Ablauf Schritt für Schritt.",
  },
  {
    id: "process_special",
    category: "process",
    question: "Gibt es einen Sonderfall, der besonders behandelt werden muss?",
    placeholder: "z.B. Beschwerden, Sonderwünsche, Ausnahmen von der Regel.",
  },
  {
    id: "sla_normal",
    category: "sla",
    question: "Wie schnell antwortet ihr normalerweise auf Kundenanfragen?",
    placeholder: "z.B. innerhalb von 24 Stunden, am selben Werktag …",
  },
  {
    id: "sla_urgent",
    category: "sla",
    question: "Welche Anliegen sind besonders dringend und müssen sofort bearbeitet werden?",
    placeholder: "Was darf auf keinen Fall liegen bleiben?",
  },
  {
    id: "policy_rule",
    category: "policy",
    question: "Nennt eine wichtige Regel, an die sich Jana immer halten soll.",
    placeholder: "z.B. eine Grenze, eine Zusage, eine Kulanz-Regel.",
  },
  {
    id: "policy_escalation",
    category: "policy",
    question: "Wann soll Jana NICHT selbst antworten, sondern einen Menschen entscheiden lassen?",
    placeholder: "z.B. bei rechtlichen Themen, Beschwerden, großen Beträgen.",
  },
  {
    id: "team_responsibilities",
    category: "team",
    question: "Wer ist für welche Themen zuständig?",
    placeholder: "z.B. Buchhaltung: Frau Meyer, Technik: Herr Krause …",
  },
  {
    id: "team_forwarding",
    category: "team",
    question: "Gibt es Anfragen, die immer an eine bestimmte Person oder Adresse weitergeleitet werden?",
    placeholder: "z.B. Rechnungen an die Buchhaltung, Presse an die Geschäftsführung.",
  },
  {
    id: "style_tone",
    category: "style",
    question: "Wie sprecht ihr eure Kunden an, per Du oder per Sie, und in welchem Ton?",
    placeholder: "z.B. Sie, förmlich und sachlich · oder Du, locker und freundlich.",
  },
];

// Branchen-Varianten: ersetzen einzelne Fragen (per id) durch treffendere.
const OVERRIDES: Record<string, Partial<Record<string, Partial<BriefingQuestion>>>> = {
  real_estate: {
    product_main: {
      question: "Was verwaltet ihr?",
      placeholder: "z.B. Miethäuser, Eigentumswohnungen, Gewerbeobjekte, WEG.",
    },
    product_audience: {
      question: "Für wen verwaltet ihr, Eigentümer, WEG oder Mieter?",
      placeholder: "Und wie viele Einheiten ungefähr?",
    },
    process_top_reason: {
      question: "Womit kommen Mieter am häufigsten auf euch zu, und wie geht ihr damit um?",
      placeholder: "z.B. Mängel, Nebenkosten, Schlüssel, Termine.",
    },
    process_standard: {
      question: "Was passiert bei einer Mängelmeldung? Beschreibe den Ablauf.",
      placeholder: "z.B. Meldung aufnehmen, Handwerker beauftragen, Mieter informieren.",
    },
    sla_urgent: {
      question: "Wie schnell reagiert ihr bei Notfällen wie Wasserschaden oder Heizungsausfall?",
      placeholder: "Und wer wird dann sofort eingeschaltet?",
    },
    policy_rule: {
      question: "Wer darf Handwerker beauftragen und bis zu welcher Summe ohne Rücksprache?",
      placeholder: "z.B. Hausmeister bis 300 Euro, darüber nur mit Freigabe.",
    },
  },
  ecom: {
    product_main: {
      question: "Was verkauft ihr, und über welche Kanäle?",
      placeholder: "z.B. eigener Shop, Amazon, eBay; welches Sortiment.",
    },
    process_top_reason: {
      question: "Womit kommen Kunden am häufigsten auf euch zu, und wie geht ihr damit um?",
      placeholder: "z.B. Bestellstatus, Versand, Rückgabe, Produktfragen.",
    },
    process_special: {
      question: "Was passiert bei einer Lieferverzögerung oder einem beschädigten Paket?",
      placeholder: "Beschreibe, wie ihr das gegenüber dem Kunden löst.",
    },
    policy_rule: {
      question: "Wie handhabt ihr Retouren und Kulanz, und ab welchem Betrag braucht es eure Freigabe?",
      placeholder: "z.B. Rücksendung 14 Tage, Kulanz bis 50 Euro ohne Rückfrage.",
    },
  },
};

/**
 * Liefert den branchen-passenden Fragenkatalog. Unbekannte Domains -> Basis.
 * real_estate = Hausverwaltung, ecom = E-Commerce.
 */
export function getBriefingQuestions(domain?: string | null): BriefingQuestion[] {
  const ov = domain ? OVERRIDES[domain] : undefined;
  if (!ov) return BASE;
  return BASE.map((q) => (ov[q.id] ? { ...q, ...ov[q.id] } : q));
}

export function domainLabel(domain?: string | null): string {
  if (domain === "real_estate") return "Hausverwaltung";
  if (domain === "ecom") return "E-Commerce";
  return "";
}
