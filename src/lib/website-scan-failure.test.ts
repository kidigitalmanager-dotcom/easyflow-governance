import { describe, it, expect } from "vitest";
import {
  describeWebsiteScanFailure,
  formatNotBefore,
  normalizeCause,
  ALL_CRAWL_CAUSES,
  type WebsiteScanRetry,
} from "./website-scan-failure";

/**
 * Diese Suite ist gegen bewusst eingebaute Fehler gegengeprueft worden (siehe
 * Memory „Grüne Tests beweisen nichts ohne Mutations-Gegenprobe“). Sie faellt,
 * wenn man
 *   1. die SPA-Erklaerung wieder auf einen zweiten Fall legt,
 *   2. den Handlungsaufruf im wartenden Zustand zeigt,
 *   3. den Zeitpunkt des zweiten Anlaufs weglaesst,
 *   4. die Altzeilen-Bruecke ueber die Ursachen-Marke stellt.
 */

const SPA_SATZ = "erst im Browser aufbauen";
const NOW = new Date("2026-07-29T06:00:00Z"); // 08:00 Uhr deutscher Zeit

function retry(over: Partial<WebsiteScanRetry> = {}): WebsiteScanRetry {
  return { cause: "timeout", attempt: 1, planned: false, not_before: null, final: true, ...over };
}

describe("normalizeCause", () => {
  it("nimmt die Ursachen-Marke, wenn es eine gibt", () => {
    expect(normalizeCause({ retry: retry({ cause: "bot_wall" }) })).toBe("bot_wall");
  });

  it("nimmt last_crawl.cause, wenn kein retry-Block gebildet wurde", () => {
    expect(normalizeCause({ retry: null, cause: "http_404" })).toBe("http_404");
  });

  it("uebersetzt den Klartext alter Zeilen ohne Marke", () => {
    expect(normalizeCause({ legacyError: "robots.txt disallows crawling" })).toBe("robots_disallow_all");
  });

  it("die Marke schlaegt den Klartext (sonst waere es eine zweite Wahrheit)", () => {
    expect(
      normalizeCause({
        retry: retry({ cause: "timeout" }),
        legacyError: "robots.txt disallows crawling",
      }),
    ).toBe("timeout");
  });

  it("alter Klartext ohne Aussage bleibt unbekannt statt geraten", () => {
    expect(normalizeCause({ legacyError: "No content extracted from URL" })).toBeNull();
    expect(normalizeCause({})).toBeNull();
  });
});

describe("formatNotBefore", () => {
  it("nennt die Uhrzeit in deutscher Zeit", () => {
    expect(formatNotBefore("2026-07-29T12:00:00Z", NOW)).toBe("gegen 14:00 Uhr");
  });

  it("sagt morgen, wenn der Anlauf ueber Mitternacht rutscht", () => {
    expect(formatNotBefore("2026-07-30T01:30:00Z", NOW)).toBe("morgen gegen 03:30 Uhr");
  });

  it("nennt das Datum, wenn es weiter weg ist", () => {
    expect(formatNotBefore("2026-08-01T06:00:00Z", NOW)).toBe("am 01.08. gegen 08:00 Uhr");
  });

  it("verspricht nichts, was schon vorbei ist", () => {
    expect(formatNotBefore("2026-07-29T05:00:00Z", NOW)).toBe("in Kürze");
  });

  it("kommt ohne Zeitpunkt und mit Unsinn zurecht", () => {
    expect(formatNotBefore(null, NOW)).toBe("in Kürze");
    expect(formatNotBefore("keine Zeit", NOW)).toBe("in Kürze");
  });
});

describe("wartender Zustand: wir versuchen es selbst noch einmal", () => {
  const view = describeWebsiteScanFailure({
    url: "https://beispiel.de",
    retry: retry({ cause: "http_5xx", planned: true, not_before: "2026-07-29T12:00:00Z", final: false }),
    now: NOW,
  });

  it("meldet sich als wartend, nicht als Problem", () => {
    expect(view.kind).toBe("waiting");
  });

  it("sagt WANN der zweite Anlauf laeuft", () => {
    expect(view.next).toContain("gegen 14:00 Uhr");
  });

  it("nimmt dem Kunden die Arbeit ab, statt sie ihm zu geben", () => {
    expect(view.showAddressAction).toBe(false);
    expect(view.next).toContain("Sie müssen nichts tun");
    expect(`${view.reason} ${view.next}`).not.toMatch(/prüfen Sie die (Adresse|Schreibweise)/i);
  });

  it("nennt trotzdem, was passiert ist", () => {
    expect(view.reason).toContain("hat nicht geantwortet");
  });

  it("bleibt wartend, auch wenn der Zeitpunkt fehlt", () => {
    const v = describeWebsiteScanFailure({
      url: "https://beispiel.de",
      retry: retry({ cause: "timeout", planned: true, not_before: null, final: false }),
      now: NOW,
    });
    expect(v.kind).toBe("waiting");
    expect(v.showAddressAction).toBe(false);
    expect(v.next).toContain("in Kürze");
  });
});

describe("endgueltiger Zustand: jetzt darf der Kunde gefragt werden", () => {
  const cases: Array<[string, string]> = [
    ["bot_wall", "blockt automatische Zugriffe"],
    ["dead_dns", "gibt es nicht mehr"],
    ["timeout", "hat nicht geantwortet"],
    ["http_5xx", "hat nicht geantwortet"],
    ["robots_disallow_all", "erlaubt kein automatisches Lesen"],
    ["no_content", "kaum Text"],
    ["http_404", "gibt es keine Seite"],
    ["not_html", "sondern eine Datei"],
    ["blocked", "nicht abrufen"],
    ["http_429", "zu vieler Zugriffe"],
    ["too_many_redirects", "leitet immer weiter"],
  ];

  for (const [cause, satz] of cases) {
    it(`${cause}: nennt den passenden Grund`, () => {
      const v = describeWebsiteScanFailure({
        url: "https://beispiel.de",
        retry: retry({ cause, planned: false, final: true }),
        now: NOW,
      });
      expect(v.kind).toBe("final");
      expect(v.reason).toContain(satz);
      expect(v.showAddressAction).toBe(true);
    });
  }

  it("robots_disallow_all schickt den Kunden nicht auf Adress-Suche", () => {
    const v = describeWebsiteScanFailure({
      retry: retry({ cause: "robots_disallow_all", final: true }),
      url: "https://beispiel.de",
      now: NOW,
    });
    expect(v.next).toContain("Jana-Wissen");
    expect(v.next).not.toContain("Schreibweise");
  });
});

describe("die SPA-Erklaerung", () => {
  it("steht bei genau EINER Ursache, naemlich no_content", () => {
    const treffer = ALL_CRAWL_CAUSES.filter((c) => {
      const v = describeWebsiteScanFailure({
        url: "https://beispiel.de",
        retry: retry({ cause: c, final: true }),
        now: NOW,
      });
      return `${v.reason} ${v.next}`.includes(SPA_SATZ);
    });
    expect(treffer).toEqual(["no_content"]);
  });

  it("steht nicht bei unbekannter Ursache", () => {
    const v = describeWebsiteScanFailure({ url: "https://beispiel.de", now: NOW });
    expect(`${v.reason} ${v.next}`).not.toContain(SPA_SATZ);
    expect(v.reason).toContain("kein lesbarer Text");
  });

  it("steht nicht bei einer Ursache, die wir noch nicht kennen", () => {
    const v = describeWebsiteScanFailure({
      url: "https://beispiel.de",
      retry: retry({ cause: "http_418_teapot", final: true }),
      now: NOW,
    });
    expect(`${v.reason} ${v.next}`).not.toContain(SPA_SATZ);
    expect(v.kind).toBe("final");
  });
});

describe("Altzeilen aus der Zeit vor der Ursachen-Marke", () => {
  it("Disallow bleibt Disallow", () => {
    const v = describeWebsiteScanFailure({
      url: "https://beispiel.de",
      retry: null,
      legacyError: "robots.txt disallows crawling",
      now: NOW,
    });
    expect(v.reason).toContain("erlaubt kein automatisches Lesen");
  });

  it("der alte Sammel-Text behauptet keinen Grund mehr", () => {
    const v = describeWebsiteScanFailure({
      url: "https://beispiel.de",
      retry: null,
      legacyError: "No content extracted from URL",
      now: NOW,
    });
    expect(v.reason).toContain("kein lesbarer Text");
    expect(`${v.reason} ${v.next}`).not.toContain(SPA_SATZ);
  });
});

describe("ohne Adresse bleibt jeder Satz vollstaendig", () => {
  for (const c of [...ALL_CRAWL_CAUSES, "unbekannt"]) {
    it(`${c}: kein Loch im Satz`, () => {
      const v = describeWebsiteScanFailure({
        url: null,
        retry: retry({ cause: c, final: true }),
        now: NOW,
      });
      const t = `${v.headline} ${v.reason} ${v.next}`;
      expect(t).not.toMatch(/undefined|null|\bNaN\b/);
      expect(t).not.toContain("  ");
      expect(v.reason.trim().endsWith(".")).toBe(true);
    });
  }
});

describe("Schreibweise", () => {
  const alle: string[] = [];
  for (const c of [...ALL_CRAWL_CAUSES, "unbekannt"]) {
    for (const planned of [true, false]) {
      const v = describeWebsiteScanFailure({
        url: "https://beispiel.de",
        retry: retry({ cause: c, planned, final: !planned, not_before: "2026-07-29T12:00:00Z" }),
        now: NOW,
      });
      alle.push(v.headline, v.reason, v.next);
    }
  }

  it("keine Em- und En-Dashes", () => {
    expect(alle.filter((s) => /[—–]/.test(s))).toEqual([]);
  });

  it("deutsche Anfuehrungszeichen statt gerader", () => {
    expect(alle.filter((s) => s.includes('"'))).toEqual([]);
  });

  it("echte Umlaute, keine Umschreibung", () => {
    expect(alle.filter((s) => /\b(pruefen|Kuerze|muessen|oeffentlich|laesst)\b/i.test(s))).toEqual([]);
  });

  it("keine internen Schluessel in Kundentexten", () => {
    expect(alle.filter((s) => /bot_wall|dead_dns|http_5xx|no_content|robots_disallow|_/.test(s))).toEqual([]);
  });
});
