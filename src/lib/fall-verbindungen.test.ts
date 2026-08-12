import { describe, it, expect } from "vitest";
import { erklaereErnte, ticketStandText, GRUND_TEXT, AKTION_TEXT } from "./fall-verbindungen";

// Eingefrorene Zeitfunktion: der Text darf nicht davon abhaengen, wann der
// Test laeuft.
const zeit = (iso: string | null) => (iso ? "12.08.2026, 11:00" : "—");

describe("erklaereErnte: warum keine Klammer entstand", () => {
  it("sagt nichts, wenn es nichts zu sagen gibt", () => {
    expect(erklaereErnte(null)).toBeNull();
    expect(erklaereErnte(undefined)).toBeNull();
  });

  it("nennt die fehlende Migration und behauptet NICHT, es gaebe nichts", () => {
    const a = erklaereErnte({ stand: "migration_fehlt" });
    expect(a?.ton).toBe("warnung");
    expect(a?.text).toContain("nicht freigeschaltet");
    expect(a?.text).toContain("gar nicht erst gesucht");
  });

  it("unterscheidet Lesefehler von leer", () => {
    const a = erklaereErnte({ stand: "lesefehler" });
    expect(a?.ton).toBe("warnung");
    expect(a?.text).toContain("Das heisst nicht, dass es keine gibt");
  });

  it("erklaert fehlende Stammdaten als Erreichbarkeitsproblem", () => {
    const a = erklaereErnte({ stand: "stammdaten_fehlen" });
    expect(a?.ton).toBe("warnung");
    expect(a?.text).toContain("Lead-Dienst");
  });

  it("ein Lead ohne Anker ist ein normaler Zustand, keine Warnung", () => {
    const a = erklaereErnte({ stand: "kein_anker" });
    expect(a?.ton).toBe("ok");
  });

  it("mehrdeutig: nennt die Zahl und begruendet die Zurueckhaltung", () => {
    const a = erklaereErnte({
      stand: "ok", neu: 0,
      uebersprungen: [{ grund: "email", warum: "mehrdeutig", leads: 3 }],
    });
    expect(a?.ton).toBe("warnung");
    expect(a?.text).toContain("3 Leads");
    expect(a?.text).toContain("schlimmer als keine");
  });

  it("mehrdeutig ohne Zahl bleibt lesbar", () => {
    const a = erklaereErnte({
      stand: "ok", uebersprungen: [{ grund: "email", warum: "mehrdeutig" }],
    });
    expect(a?.text).toContain("mehreren Leads");
    expect(a?.text).not.toContain("undefined");
  });

  it("unpruefbar ist eine Warnung, nicht ein stilles Nichts", () => {
    const a = erklaereErnte({
      stand: "ok", uebersprungen: [{ grund: "email", warum: "mehrdeutigkeit_nicht_pruefbar" }],
    });
    expect(a?.ton).toBe("warnung");
    expect(a?.text).toContain("nicht prüfen");
  });

  it("Automaten-Adresse ist bewusstes Verhalten, also kein Alarm", () => {
    const a = erklaereErnte({
      stand: "ok", uebersprungen: [{ grund: "email", warum: "automaten_absender" }],
    });
    expect(a?.ton).toBe("ok");
    expect(a?.text).toContain("Automaten-Adresse");
  });

  it("die fehlende Rufnummern-Bruecke erzeugt KEIN Rauschen", () => {
    // telefon traegt heute nicht ueber die Kanalgrenze. Das ist der Normalfall
    // und darf nicht bei jedem Fall als Warnung erscheinen.
    const a = erklaereErnte({
      stand: "ok", neu: 2, geprueft: 3,
      uebersprungen: [{ grund: "telefon", warum: "kein_traeger_im_bestand" }],
    });
    expect(a).toBeNull();
  });

  it("mehrdeutig schlaegt unpruefbar, wenn beides zutrifft", () => {
    // Reihenfolge ist Absicht: "bewusst nicht verknuepft" ist die staerkere
    // und fuer den Vertriebler nuetzlichere Aussage.
    const a = erklaereErnte({
      stand: "ok",
      uebersprungen: [
        { grund: "telefon", warum: "mehrdeutigkeit_nicht_pruefbar" },
        { grund: "email", warum: "mehrdeutig", leads: 2 },
      ],
    });
    expect(a?.text).toContain("2 Leads");
  });
});

describe("ticketStandText: drei Zustaende, nicht zwei", () => {
  it("ohne Protokollzeile heisst unbeobachtet, nicht in Ordnung", () => {
    const s = ticketStandText(
      { letzter_stand: "unbekannt", letzte_aktion: null, letzte_aktion_am: null },
      zeit, AKTION_TEXT,
    );
    expect(s.text).toContain("keine Aktion protokolliert");
    expect(s.text).not.toContain("in Ordnung");
  });

  it("uebersetzt die Operation ins Deutsche", () => {
    const s = ticketStandText(
      { letzter_stand: "ok", letzte_aktion: "addInternalNote", letzte_aktion_am: "2026-08-12T09:00:00Z" },
      zeit, AKTION_TEXT,
    );
    expect(s.ton).toBe("ok");
    expect(s.text).toContain("interne Notiz");
    expect(s.text).toContain("12.08.2026");
  });

  it("eine unbekannte Operation wird durchgereicht statt verschluckt", () => {
    const s = ticketStandText(
      { letzter_stand: "ok", letzte_aktion: "mergeTicket", letzte_aktion_am: null },
      zeit, AKTION_TEXT,
    );
    expect(s.text).toContain("mergeTicket");
  });

  it("ein Ablehnungsgrund wird benannt und als Warnung gezeigt", () => {
    const s = ticketStandText(
      { letzter_stand: "rate_limited", letzte_aktion: "createTicket", letzte_aktion_am: null },
      zeit, AKTION_TEXT,
    );
    expect(s.ton).toBe("warnung");
    expect(s.text).toContain("rate_limited");
  });
});

describe("Beschriftungen", () => {
  it("jeder Anker-Grund des Backends hat einen deutschen Text", () => {
    // Diese Liste ist der CHECK-Constraint der Migration. Kommt dort einer
    // dazu, faellt es hier auf und nicht erst dem Vertriebler.
    for (const g of ["hubspot_contact_id", "email", "telefon", "manuell"]) {
      expect(GRUND_TEXT[g]).toBeTruthy();
    }
  });

  it("die Ticket-Operationen decken ab, was ticketing_write schreibt", () => {
    for (const a of ["createTicket", "addInternalNote", "addPublicReply"]) {
      expect(AKTION_TEXT[a]).toBeTruthy();
    }
  });
});
