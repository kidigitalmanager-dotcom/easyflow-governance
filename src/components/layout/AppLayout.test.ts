import { describe, it, expect } from "vitest";
import { isNavActive, areaForPath } from "./AppLayout";

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

  it("faellt bei unbekannten Pfaden auf Arbeit zurueck", () => {
    expect(areaForPath("/gibtesnicht")).toBe("arbeit");
  });

  it("erkennt Unterseiten ueber den Praefix", () => {
    expect(areaForPath("/forderungen/123")).toBe("geld");
    expect(areaForPath("/einstellungen/irgendwas")).toBe("system");
  });
});
