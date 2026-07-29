import { describe, it, expect } from "vitest";
import {
  OP_ORDER,
  STATUS_ORDER,
  opLabel,
  sortOps,
  statusLabel,
  stateLabel,
  stateTone,
  herkunftLabel,
  schliesstLabel,
  nextAction,
  normalizeFreshdeskDomain,
  providerLabel,
  summarize,
} from "./ticketing-readiness";

describe("Anbieter-Name", () => {
  it("nennt die beiden Treiber beim Namen", () => {
    expect(providerLabel("hubspot")).toBe("HubSpot");
    expect(providerLabel("freshdesk")).toBe("Freshdesk");
    expect(providerLabel("FRESHDESK")).toBe("Freshdesk");
  });

  it("kippt bei einem dritten Treiber nicht um", () => {
    expect(providerLabel("zendesk")).toBe("zendesk");
  });

  it("hat einen Namen, wenn noch gar nichts verbunden ist", () => {
    expect(providerLabel(null)).toBe("Das Ticketsystem");
    expect(providerLabel(undefined)).toBe("Das Ticketsystem");
    expect(providerLabel("")).toBe("Das Ticketsystem");
  });
});

describe("Beschriftungen: unbekannte Schluessel verschwinden nicht", () => {
  it("kennt die sechs Schritte", () => {
    expect(OP_ORDER).toHaveLength(6);
    expect(opLabel("createTicket")).toBe("Ticket anlegen");
    expect(opLabel("assignToHuman")).toBe("An einen Menschen übergeben");
  });

  it("zeigt einen unbekannten Schritt roh an, statt ihn zu unterschlagen", () => {
    // Ein spaeterer Treiber bringt vielleicht einen siebten Schritt mit. Der darf
    // haesslich aussehen, aber die Liste darf nicht heimlich unvollstaendig sein.
    expect(opLabel("verifyCustomer")).toBe("verifyCustomer");
  });

  it("sortiert bekannte Schritte in Vorgangs-Reihenfolge und haengt Unbekanntes hinten an", () => {
    const sortiert = sortOps(["setPriority", "verifyCustomer", "createTicket"]);
    expect(sortiert).toEqual(["createTicket", "setPriority", "verifyCustomer"]);
  });

  it("verliert beim Sortieren keinen Eintrag", () => {
    const rein = ["assignToHuman", "zzz", "createTicket", "aaa"];
    expect(sortOps(rein)).toHaveLength(rein.length);
  });

  it("beschriftet die vier Status", () => {
    expect(STATUS_ORDER).toHaveLength(4);
    expect(statusLabel("wartet_auf_kunde")).toBe("Wartet auf Kunde");
    expect(statusLabel("irgendwas")).toBe("irgendwas");
  });
});

describe("Zustand eines Schrittes", () => {
  it("uebersetzt die vier bekannten Zustaende", () => {
    expect(stateLabel("yes")).toBe("geht");
    expect(stateLabel("conditional")).toBe("hängt am Zugang");
    expect(stateLabel("scope_missing")).toBe("Berechtigung fehlt");
    expect(stateLabel("unknown")).toBe("unklar");
  });

  it("faerbt nur eine fehlende Berechtigung als Handlungsbedarf", () => {
    expect(stateTone("yes")).toBe("emerald");
    expect(stateTone("scope_missing")).toBe("amber");
    // 'conditional' und 'unknown' sind keine Warnung, sondern nur keine Zusage.
    expect(stateTone("conditional")).toBe("muted");
    expect(stateTone("unknown")).toBe("muted");
    expect(stateTone("etwas_neues")).toBe("muted");
  });

  it("trennt gemessen von behauptet", () => {
    expect(herkunftLabel(true)).toBe("gemessen");
    expect(herkunftLabel(false)).toBe("laut Anbieter");
  });
});

describe("Stufen: die Auskunft, die Freshdesk nicht gibt", () => {
  it("nennt eine abschliessende Stufe abschliessend", () => {
    expect(schliesstLabel(true)).toBe("schließt ab");
  });

  it("nennt eine offene Stufe offen", () => {
    expect(schliesstLabel(false)).toBe("offen");
  });

  it("sagt bei fehlender Auskunft genau das — und behauptet nicht 'offen'", () => {
    // 🔴 Der Kern der Hard Line auf dem Bildschirm: bei einem selbst angelegten
    // Freshdesk-Status weiss niemand, ob er den Vorgang beendet. Wer das als
    // "offen" anzeigt, verspricht dem Kunden etwas, das der Assistent nicht
    // einloest — er schliesst ueber so eine Stufe naemlich nichts.
    expect(schliesstLabel(null)).toBe("sagt das System nicht");
    expect(schliesstLabel(undefined)).toBe("sagt das System nicht");
  });
});

describe("Naechster Schritt: nur Knoepfe, die wirklich etwas tun", () => {
  it("bietet die vier Wege an, die die Konsole gehen kann", () => {
    expect(nextAction("tarif_pruefen")).toBe("tarif");
    expect(nextAction("verbinden")).toBe("verbinden");
    expect(nextAction("einschalten")).toBe("einschalten");
    expect(nextAction("neu_verbinden")).toBe("neu_verbinden");
  });

  it("bietet keinen Knopf an, wo die Konsole nichts ausrichten kann", () => {
    // Diese drei passieren im Fremdsystem oder in der Datenbank. Ein Knopf waere
    // eine Luege; der erklaerende Satz steht in `hinweise` und kommt vom Server.
    expect(nextAction("pipeline_anlegen")).toBe("keine");
    expect(nextAction("zuordnung_festlegen")).toBe("keine");
    expect(nextAction("migration_einspielen")).toBe("keine");
  });

  it("bietet nichts an, wenn alles bereit ist", () => {
    expect(nextAction("bereit")).toBe("keine");
    expect(nextAction(null)).toBe("keine");
    expect(nextAction(undefined)).toBe("keine");
    expect(nextAction("etwas_neues")).toBe("keine");
  });
});

describe("Freshdesk-Adresse", () => {
  it("nimmt die blosse Kennung", () => {
    expect(normalizeFreshdeskDomain("acme")).toEqual({ ok: true, sub: "acme" });
  });

  it("nimmt die volle Adresse", () => {
    expect(normalizeFreshdeskDomain("acme.freshdesk.com")).toEqual({ ok: true, sub: "acme" });
  });

  it("nimmt eine aus der Adresszeile kopierte Ticket-URL", () => {
    expect(normalizeFreshdeskDomain("https://acme.freshdesk.com/a/tickets/1234")).toEqual({
      ok: true,
      sub: "acme",
    });
  });

  it("raeumt Grossschreibung und Leerzeichen weg", () => {
    expect(normalizeFreshdeskDomain("  ACME.Freshdesk.COM/ ")).toEqual({ ok: true, sub: "acme" });
  });

  it("laesst Bindestriche in der Mitte zu", () => {
    expect(normalizeFreshdeskDomain("acme-support")).toEqual({ ok: true, sub: "acme-support" });
  });

  it("lehnt ab, was der Server auch ablehnen wuerde", () => {
    expect(normalizeFreshdeskDomain("").ok).toBe(false);
    expect(normalizeFreshdeskDomain("-acme").ok).toBe(false); // Bindestrich am Anfang
    expect(normalizeFreshdeskDomain("acme_support").ok).toBe(false); // Unterstrich
    expect(normalizeFreshdeskDomain("acme.example.com").ok).toBe(false); // fremder Punkt
    expect(normalizeFreshdeskDomain("a".repeat(64)).ok).toBe(false); // zu lang
  });

  it("akzeptiert genau 63 Zeichen", () => {
    expect(normalizeFreshdeskDomain("a".repeat(63)).ok).toBe(true);
  });

  it("laesst kein Punkt-Zeichen durch, das die Adresse umlenken koennte", () => {
    // Wer hier `evil.com` durchliesse, wuerde daraus `evil.com.freshdesk.com`
    // bauen — harmlos — aber eine Regel, die Punkte erlaubt, ist eine Regel, die
    // beim naechsten Umbau kippt. Also gar nicht erst.
    expect(normalizeFreshdeskDomain("evil.com").ok).toBe(false);
  });
});

describe("Zusammenfassung: gezaehlt, nicht behauptet", () => {
  const ops = {
    createTicket: { state: "yes", gemessen: true },
    addPublicReply: { state: "scope_missing", gemessen: true },
    addInternalNote: { state: "yes", gemessen: false },
    setStatus: { state: "yes", gemessen: false },
    setPriority: { state: "yes", gemessen: false },
    assignToHuman: { state: "unknown", gemessen: true },
  };

  it("zaehlt moegliche, fehlende und gesamte Schritte", () => {
    const s = summarize({ ok: true, connected: true, entitled: true, operations: ops });
    expect(s.moeglich).toBe(4);
    expect(s.fehlend).toBe(1);
    expect(s.gesamt).toBe(6);
  });

  it("faerbt gelb, solange eine Berechtigung fehlt — auch wenn der Server ok meldet", () => {
    const s = summarize({ ok: true, connected: true, entitled: true, operations: ops });
    expect(s.tone).toBe("amber");
  });

  it("faerbt gruen, wenn nichts fehlt", () => {
    const s = summarize({
      ok: true,
      connected: true,
      entitled: true,
      operations: { createTicket: { state: "yes" } },
    });
    expect(s.tone).toBe("emerald");
  });

  it("bleibt grau, solange kein Tarif oder keine Verbindung da ist", () => {
    expect(summarize({ entitled: false, connected: false }).tone).toBe("muted");
    expect(summarize({ entitled: true, connected: false }).tone).toBe("muted");
  });

  it("kippt bei leerer Antwort nicht um", () => {
    const s = summarize(null);
    expect(s.gesamt).toBe(0);
    expect(s.moeglich).toBe(0);
    expect(s.aktion).toBe("keine");
    expect(s.tone).toBe("muted");
  });

  it("reicht den naechsten Schritt als Aktion durch", () => {
    expect(summarize({ entitled: false, naechster_schritt: "tarif_pruefen" }).aktion).toBe("tarif");
  });
});
