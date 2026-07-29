import { describe, it, expect } from "vitest";
import {
  TENANT_FLAG_ROWS,
  visibleTenantFlags,
  buildTenantFlagPayload,
  describeSkippedFlags,
  type TenantFlagKey,
} from "./tenant-flags";

const ALL_ON = Object.fromEntries(TENANT_FLAG_ROWS.map((r) => [r.key, true])) as Record<TenantFlagKey, boolean>;

describe("TENANT_FLAG_ROWS", () => {
  // Der Test haelt die Reihenfolge UND die Menge fest — laeuft die Liste von der
  // Server-Whitelist (TENANT_BOOL_FLAGS in admin_tenant_setup.js) weg, faellt es
  // hier auf. v4.186.0: neunter Schalter auto_draft_enabled dazugekommen.
  it("kennt genau die neun Gates der Server-Whitelist", () => {
    expect(TENANT_FLAG_ROWS.map((r) => r.key)).toEqual([
      "documents_enabled",
      "accounting_ap_enabled",
      "auto_offer_enabled",
      "dunning_scan_enabled",
      "einvoice_enabled",
      "sales_pack_enabled",
      "spam_rescue_enabled",
      "spreadsheet_enabled",
      "auto_draft_enabled",
    ]);
  });

  it("hat zu jedem Schalter Beschriftung und Untertitel", () => {
    for (const r of TENANT_FLAG_ROWS) {
      expect(r.label.length).toBeGreaterThan(3);
      expect(r.hint.length).toBeGreaterThan(10);
    }
  });

  it("hat keine doppelten Schluessel", () => {
    expect(new Set(TENANT_FLAG_ROWS.map((r) => r.key)).size).toBe(TENANT_FLAG_ROWS.length);
  });
});

describe("visibleTenantFlags", () => {
  it("zeigt bei unbekannter DB-Lage alle Schalter", () => {
    expect(visibleTenantFlags(null)).toHaveLength(9);
    expect(visibleTenantFlags(undefined)).toHaveLength(9);
  });

  it("blendet Gates aus, die die Datenbank nicht hat", () => {
    const rows = visibleTenantFlags(["documents_enabled", "spreadsheet_enabled"]);
    expect(rows.map((r) => r.key)).toEqual(["documents_enabled", "spreadsheet_enabled"]);
  });

  it("behaelt die Reihenfolge der Whitelist bei, nicht die der Serverliste", () => {
    const rows = visibleTenantFlags(["spreadsheet_enabled", "documents_enabled"]);
    expect(rows.map((r) => r.key)).toEqual(["documents_enabled", "spreadsheet_enabled"]);
  });

  it("leere Liste heisst: kein Schalter (nicht: alle)", () => {
    expect(visibleTenantFlags([])).toHaveLength(0);
  });

  it("ignoriert unbekannte Schluessel aus dem Server", () => {
    expect(visibleTenantFlags(["gibts_nicht", "documents_enabled"]).map((r) => r.key))
      .toEqual(["documents_enabled"]);
  });
});

describe("buildTenantFlagPayload", () => {
  it("schickt nur die sichtbaren Schalter mit (Partial-Merge)", () => {
    const rows = visibleTenantFlags(["documents_enabled"]);
    expect(buildTenantFlagPayload(rows, ALL_ON)).toEqual({ documents_enabled: true });
  });

  it("laesst ein verstecktes Gate unangetastet — kein stilles false", () => {
    const rows = visibleTenantFlags(["documents_enabled"]);
    const payload = buildTenantFlagPayload(rows, { ...ALL_ON, einvoice_enabled: false });
    expect("einvoice_enabled" in payload).toBe(false);
  });

  it("uebertraegt false als echten Wert", () => {
    const rows = visibleTenantFlags(null);
    const payload = buildTenantFlagPayload(rows, { ...ALL_ON, dunning_scan_enabled: false });
    expect(payload.dunning_scan_enabled).toBe(false);
    expect(payload.documents_enabled).toBe(true);
  });

  it("erzeugt echte Booleans, keine truthy-Werte", () => {
    const rows = visibleTenantFlags(null);
    const payload = buildTenantFlagPayload(rows, ALL_ON);
    expect(Object.values(payload).every((v) => typeof v === "boolean")).toBe(true);
    expect(Object.keys(payload)).toHaveLength(9);
  });
});

describe("describeSkippedFlags", () => {
  it("bleibt leer, wenn nichts uebersprungen wurde", () => {
    expect(describeSkippedFlags([])).toBe("");
    expect(describeSkippedFlags(undefined)).toBe("");
    expect(describeSkippedFlags(null)).toBe("");
  });

  it("nennt Beschriftung und Grund im Klartext", () => {
    expect(describeSkippedFlags([{ flag: "einvoice_enabled", reason: "column_missing" }]))
      .toBe("E-Rechnung (Spalte fehlt in der Datenbank)");
  });

  it("uebersetzt auch die fehlende Tenant-Zeile", () => {
    expect(describeSkippedFlags([{ flag: "documents_enabled", reason: "tenant_row_missing" }]))
      .toBe("Belege & Rechnungen (kein Eintrag fuer diesen Kunden)");
  });

  it("faellt bei unbekanntem Grund auf den Rohwert zurueck statt zu raten", () => {
    expect(describeSkippedFlags([{ flag: "documents_enabled", reason: "irgendwas" }]))
      .toBe("Belege & Rechnungen (irgendwas)");
  });

  it("listet mehrere Gates kommagetrennt", () => {
    expect(describeSkippedFlags([
      { flag: "documents_enabled", reason: "column_missing" },
      { flag: "spam_rescue_enabled", reason: "column_missing" },
    ])).toBe("Belege & Rechnungen (Spalte fehlt in der Datenbank), Spam-Rettung (Spalte fehlt in der Datenbank)");
  });
});
