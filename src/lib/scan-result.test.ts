import { describe, it, expect } from "vitest";
import { describeSkipped, skippedCount, isBlocked } from "./scan-result";

describe("describeSkipped", () => {
  it("gibt null zurueck, wenn nichts uebersprungen wurde", () => {
    expect(describeSkipped(undefined)).toBeNull();
    expect(describeSkipped(null)).toBeNull();
    expect(describeSkipped("")).toBeNull();
    expect(describeSkipped(false)).toBeNull();
  });

  it("behandelt eine Zahl als Zaehler, NICHT als Abbruchgrund", () => {
    // Das war der Fehler: `if (res.skipped)` meldete bei 5 uebersprungenen
    // Nachrichten faelschlich einen Fehler.
    expect(describeSkipped(5)).toBeNull();
    expect(describeSkipped(0)).toBeNull();
    expect(skippedCount(5)).toBe(5);
    expect(skippedCount("tenant_disabled")).toBeNull();
  });

  it("uebersetzt tenant_disabled in einen Satz ohne Roh-Enum", () => {
    const r = describeSkipped("tenant_disabled");
    expect(r).not.toBeNull();
    expect(r!.tone).toBe("blocked");
    expect(r!.hint).toContain("freigeschaltet");
    expect(r!.title).not.toContain("tenant_disabled");
    expect(r!.hint).not.toContain("tenant_disabled");
  });

  it("kennt die uebrigen Blockade-Gruende", () => {
    for (const key of ["feature_disabled", "tenant_opt_out", "auto_ingest_off", "ap_unavailable", "no_db", "bad_args"]) {
      expect(describeSkipped(key)!.tone).toBe("blocked");
    }
  });

  it("stuft harmlose Gruende als Hinweis ein", () => {
    for (const key of ["no_candidates", "not_invoice", "no_amount", "too_large", "no_msg"]) {
      expect(describeSkipped(key)!.tone).toBe("info");
    }
  });

  it("zeigt unbekannte Werte neutral an statt sie zu verschlucken", () => {
    const r = describeSkipped("irgendwas_neues_vom_server");
    expect(r).not.toBeNull();
    expect(r!.tone).toBe("info");
    expect(r!.hint).toContain("irgendwas_neues_vom_server");
    expect(r!.raw).toBe("irgendwas_neues_vom_server");
  });

  it("isBlocked trennt Blockade von Hinweis und Zaehler", () => {
    expect(isBlocked("tenant_disabled")).toBe(true);
    expect(isBlocked("no_candidates")).toBe(false);
    expect(isBlocked(7)).toBe(false);
    expect(isBlocked(undefined)).toBe(false);
  });

  it("schreibt deutsche Texte mit echten Umlauten und ohne Gedankenstriche", () => {
    for (const key of ["tenant_disabled", "feature_disabled", "no_candidates", "too_large"]) {
      const r = describeSkipped(key)!;
      const text = r.title + " " + r.hint;
      expect(text).not.toMatch(/[–—]/); // kein En-/Em-Dash
      expect(text).not.toMatch(/\b(ue|ae|oe)[a-z]/); // keine Transliteration
    }
  });
});
