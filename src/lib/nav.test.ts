import { describe, it, expect } from "vitest";
import { isNavActive, areaForPath, AREAS } from "./nav";

describe("isNavActive", () => {
  it("matcht einfache Pfade", () => {
    expect(isNavActive("/review", "/review", "")).toBe(true);
    expect(isNavActive("/review", "/audit", "")).toBe(false);
  });

  it("unterscheidet Gesundheit und Fruehwarnung ueber ?sec=", () => {
    expect(isNavActive("/signale?sec=signale", "/signale", "?sec=signale")).toBe(true);
    expect(isNavActive("/signale?sec=signale", "/signale", "?sec=risk_shield")).toBe(false);
    expect(isNavActive("/signale?sec=risk_shield", "/signale", "?sec=risk_shield")).toBe(true);
    // ohne Query darf keiner der beiden faelschlich aktiv sein
    expect(isNavActive("/signale?sec=signale", "/signale", "")).toBe(false);
  });

  it("ignoriert zusaetzliche Parameter", () => {
    expect(isNavActive("/signale?sec=signale", "/signale", "?sec=signale&x=1")).toBe(true);
  });

  // ── Vertriebsflaeche (12.08.2026) ────────────────────────────────────────
  it("🔴 Telefon und Anrufe sind nie gleichzeitig aktiv", () => {
    // "Telefon" ist /vertrieb OHNE Reiter. Ohne Sonderbehandlung waere es bei
    // jedem Reiter mit-aktiv, weil der Pfad derselbe ist.
    expect(isNavActive("/vertrieb", "/vertrieb", "")).toBe(true);
    expect(isNavActive("/vertrieb", "/vertrieb", "?tab=calls")).toBe(false);
    expect(isNavActive("/vertrieb?tab=calls", "/vertrieb", "?tab=calls")).toBe(true);
    expect(isNavActive("/vertrieb?tab=calls", "/vertrieb", "?tab=leads")).toBe(false);
  });

  it("ein fremder Parameter macht Telefon nicht inaktiv", () => {
    expect(isNavActive("/vertrieb", "/vertrieb", "?rep=kerim")).toBe(true);
  });

  it("🔴 Seiten OHNE ?tab=-Geschwister verhalten sich unveraendert", () => {
    // Die Sonderbehandlung darf nur greifen, wo es wirklich Geschwister gibt.
    // /forderungen?tab=rechnungen ist eine Weiterleitung, KEIN Nav-Eintrag.
    expect(isNavActive("/forderungen", "/forderungen", "?tab=rechnungen")).toBe(true);
    expect(isNavActive("/voice", "/voice", "?tab=calls")).toBe(true);
    expect(isNavActive("/review", "/review", "?x=1")).toBe(true);
  });
});

describe("AREAS — der Zuschnitt selbst", () => {
  it("Vertrieb steht als eigener Bereich da, gleichrangig zu System", () => {
    const v = AREAS.find((a) => a.key === "vertrieb");
    expect(v).toBeTruthy();
    expect(v!.label).toBe("Vertrieb");
    expect(v!.items.map((i) => i.label)).toEqual([
      "Telefon", "Leads", "Fälle", "Anrufe", "Termine", "Skripte & Einwände",
    ]);
  });

  it("🔴 Voice & Co-Pilot bleibt unter System — die Verwaltung zieht NICHT um", () => {
    const sys = AREAS.find((a) => a.key === "system");
    expect(sys!.items.some((i) => i.to === "/voice")).toBe(true);
  });

  it("🔴 kein Feature-Verlust: jeder Bereich, den es vor dem Umbau gab, ist noch da", () => {
    const alle = AREAS.flatMap((a) => a.items.map((i) => i.to));
    for (const to of [
      "/", "/review", "/audit",
      "/buchhaltung", "/forderungen", "/verbindlichkeiten", "/angebote",
      "/mitarbeiter", "/zeiterfassung",
      "/signale?sec=signale", "/signale?sec=risk_shield", "/chancen",
      "/playbooks", "/datenquellen", "/voice", "/einstellungen", "/onboarding",
    ]) {
      expect(alle).toContain(to);
    }
  });

  it("kein Nav-Ziel ist doppelt vergeben", () => {
    const alle = AREAS.flatMap((a) => a.items.map((i) => i.to));
    expect(new Set(alle).size).toBe(alle.length);
  });
});

describe("areaForPath", () => {
  it("ordnet die Arbeitsseiten zu", () => {
    expect(areaForPath("/")).toBe("arbeit");
    expect(areaForPath("/review")).toBe("arbeit");
    expect(areaForPath("/audit")).toBe("arbeit");
  });

  it("ordnet die Geld-Seiten zu", () => {
    for (const p of ["/buchhaltung", "/forderungen", "/verbindlichkeiten", "/angebote"]) {
      expect(areaForPath(p)).toBe("geld");
    }
  });

  it("ordnet Mitarbeiter, Signale und System zu", () => {
    expect(areaForPath("/mitarbeiter")).toBe("mitarbeiter");
    expect(areaForPath("/zeiterfassung")).toBe("mitarbeiter");
    expect(areaForPath("/signale")).toBe("signale");
    expect(areaForPath("/chancen")).toBe("signale");
    expect(areaForPath("/einstellungen")).toBe("system");
    expect(areaForPath("/playbooks")).toBe("system");
    expect(areaForPath("/datenquellen")).toBe("system");
    expect(areaForPath("/voice")).toBe("system");
    expect(areaForPath("/onboarding")).toBe("system");
    expect(areaForPath("/admin")).toBe("system");
    expect(areaForPath("/admin/tenant-setup")).toBe("system");
  });

  it("verwechselt die Wurzel nicht mit anderen Seiten", () => {
    // "/" darf NICHT als Praefix jeder Route gelten.
    expect(areaForPath("/buchhaltung")).not.toBe("arbeit");
  });

  it("🔴 ordnet die Vertriebsflaeche ihrem eigenen Bereich zu", () => {
    expect(areaForPath("/vertrieb")).toBe("vertrieb");
    // /verbindlichkeiten faengt aehnlich an und darf nicht dazwischenfunken.
    expect(areaForPath("/verbindlichkeiten")).toBe("geld");
    // Und umgekehrt: /vertrieb landet nicht bei Geld.
    expect(areaForPath("/vertrieb")).not.toBe("geld");
  });

  it("faellt bei unbekannten Pfaden auf Arbeit zurueck", () => {
    expect(areaForPath("/gibtesnicht")).toBe("arbeit");
  });

  it("erkennt Unterseiten ueber den Praefix", () => {
    expect(areaForPath("/forderungen/123")).toBe("geld");
    expect(areaForPath("/einstellungen/irgendwas")).toBe("system");
  });
});
