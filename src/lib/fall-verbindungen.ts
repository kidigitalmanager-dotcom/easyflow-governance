// -----------------------------------------------------------------------------
// fall-verbindungen.ts — Schnitt G: die Saetze, die am Fall stehen.
//
// Warum das eine eigene Datei ist: der wichtigste Satz dieses Bausteins ist
// nicht "hier sind die Verknuepfungen", sondern "hier ist KEINE, und zwar aus
// diesem Grund". Genau dort luegt eine Oberflaeche am leichtesten — sie zeigt
// "nichts gefunden", obwohl sie gar nicht suchen konnte. Deshalb liegt die
// Entscheidung, welcher Satz erscheint, hier als reine Funktion und wird
// geprueft, statt im JSX zu verschwinden.
// -----------------------------------------------------------------------------

export type ErnteUebersprungen = { grund: string; warum: string; leads?: number };
export type Ernte = { stand: string; neu?: number; geprueft?: number; uebersprungen?: ErnteUebersprungen[] } | null | undefined;

export type ErnteAussage = {
  /** ok = neutrale Feststellung, warnung = es haette klappen koennen. */
  ton: "ok" | "warnung";
  text: string;
} | null;

/**
 * Warum keine Klammer entstand.
 *
 * Reihenfolge ist Absicht: zuerst die Lagen, in denen gar nicht gesucht werden
 * KONNTE (Migration, Stammdaten, kein Anker), dann die, in denen bewusst nicht
 * verknuepft wurde (mehrdeutig), dann die unklaren. Ein "nichts gefunden" ohne
 * Begruendung gibt es nur, wenn wirklich gesucht wurde und nichts da war.
 */
export function erklaereErnte(ernte: Ernte): ErnteAussage {
  if (!ernte) return null;

  if (ernte.stand === "migration_fehlt") {
    return {
      ton: "warnung",
      text: "Die Verknüpfung ist noch nicht freigeschaltet. Es wurde deshalb gar nicht erst gesucht.",
    };
  }
  if (ernte.stand === "lesefehler") {
    return {
      ton: "warnung",
      text: "Die Suche nach zusammengehörenden Vorgängen ist fehlgeschlagen. Das heisst nicht, dass es keine gibt.",
    };
  }
  if (ernte.stand === "stammdaten_fehlen") {
    return {
      ton: "warnung",
      text: "Ohne Stammdaten gibt es keinen Anhaltspunkt zum Verknüpfen — der Lead-Dienst war gerade nicht erreichbar.",
    };
  }
  if (ernte.stand === "kein_anker") {
    return {
      ton: "ok",
      text: "An diesem Lead stehen weder E-Mail-Adresse noch CRM-Kontakt, an denen sich etwas verknüpfen liesse.",
    };
  }

  const uebersprungen = ernte.uebersprungen ?? [];

  const mehrdeutig = uebersprungen.find((u) => u.warum === "mehrdeutig");
  if (mehrdeutig) {
    const anzahl = typeof mehrdeutig.leads === "number" ? String(mehrdeutig.leads) : "mehreren";
    return {
      ton: "warnung",
      text: `Bewusst nicht verknüpft: dieses Merkmal steht an ${anzahl} Leads. Eine falsche Zuordnung wäre schlimmer als keine.`,
    };
  }

  const unpruefbar = uebersprungen.find((u) => u.warum === "mehrdeutigkeit_nicht_pruefbar");
  if (unpruefbar) {
    return {
      ton: "warnung",
      text: "Es liess sich gerade nicht prüfen, ob das Merkmal eindeutig zu diesem Kunden gehört — deshalb wurde nichts verknüpft.",
    };
  }

  const automat = uebersprungen.find((u) => u.warum === "automaten_absender");
  if (automat) {
    return {
      ton: "ok",
      text: "Die hinterlegte Adresse ist eine Automaten-Adresse. Daran wird bewusst nichts verknüpft.",
    };
  }

  // "kein_traeger_im_bestand" allein ist KEIN erklaerungsbeduerftiger Fall:
  // die Rufnummer traegt heute nicht ueber die Kanalgrenze, das ist normal und
  // waere als Warnung nur Rauschen.
  return null;
}

/**
 * Der letzte Stand eines Tickets, in einem Satz.
 *
 * 🔴 DREI Zustaende, nicht zwei: "es lief" und "wir wissen es nicht" bedeuten
 * das Gegenteil voneinander. Die Ticket-Ablage kennt nur, was beim SCHREIBEN
 * protokolliert wurde — ein Ticket ohne Protokollzeile ist nicht "in Ordnung",
 * sondern unbeobachtet.
 */
export function ticketStandText(
  notiz: { letzter_stand: string; letzte_aktion: string | null; letzte_aktion_am: string | null },
  zeitText: (iso: string | null) => string,
  aktionText: Record<string, string>,
): { ton: "ok" | "warnung"; text: string } {
  if (notiz.letzter_stand === "unbekannt") {
    return { ton: "ok", text: "Angelegt; seither ist keine Aktion protokolliert." };
  }
  if (notiz.letzter_stand === "ok") {
    const was = aktionText[notiz.letzte_aktion ?? ""] ?? notiz.letzte_aktion ?? "Aktion";
    const wann = notiz.letzte_aktion_am ? ` am ${zeitText(notiz.letzte_aktion_am)}` : "";
    return { ton: "ok", text: `Zuletzt: ${was}${wann}` };
  }
  return { ton: "warnung", text: `Letzte Aktion nicht durchgelaufen: ${notiz.letzter_stand}` };
}

/** Woran die Klammer haengt, in Worten statt in Feldnamen. */
export const GRUND_TEXT: Record<string, string> = {
  hubspot_contact_id: "Gleicher CRM-Kontakt",
  email: "Gleiche E-Mail-Adresse",
  telefon: "Gleiche Rufnummer",
  manuell: "Von Hand verknüpft",
};

/** Ticket-Operationen in Worten. */
export const AKTION_TEXT: Record<string, string> = {
  createTicket: "angelegt",
  addInternalNote: "interne Notiz",
  addPublicReply: "Antwort an den Kunden",
  closeTicket: "geschlossen",
  updateTicket: "geändert",
};
