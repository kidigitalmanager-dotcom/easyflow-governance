import { describe, it, expect } from "vitest";
import {
  deriveSourceState,
  sourceStateLabel,
  countsAsConnected,
  isConnectedStatus,
} from "./source-state";

describe("deriveSourceState", () => {
  it("manuelle Quelle kennt keinen Verbindungszustand", () => {
    expect(deriveSourceState({ manual: true })).toBe("manual");
    // auch dann, wenn zufällig ein Connector-Status mitkommt
    expect(deriveSourceState({ manual: true, connected: true, delivering: true, metricsKnown: true }))
      .toBe("manual");
  });

  it("liefert Kennzahlen schlägt alles andere", () => {
    expect(deriveSourceState({ delivering: true, metricsKnown: true })).toBe("active");
    // Status-Endpunkt antwortet nicht, Werte sind aber da → trotzdem aktiv
    expect(deriveSourceState({ delivering: true, metricsKnown: true, connected: undefined }))
      .toBe("active");
  });

  it("delivering ohne geladene Kennzahlen zählt nicht", () => {
    // metricsKnown=false heißt: dash ist noch nicht da, delivering ist Rauschen
    expect(deriveSourceState({ delivering: true, metricsKnown: false, connected: true }))
      .toBe("connected");
  });

  it("DER Fall aus Leons Meldung: HubSpot verbunden, noch keine Werte → grün-ish, nicht grau", () => {
    const s = deriveSourceState({ connected: true, delivering: false, metricsKnown: true });
    expect(s).toBe("connected");
    expect(countsAsConnected(s)).toBe(true);
    expect(sourceStateLabel(s)).toBe("verbunden");
  });

  it("nicht verbunden, Kennzahlen geladen → idle", () => {
    expect(deriveSourceState({ connected: false, delivering: false, metricsKnown: true })).toBe("idle");
  });

  it("Status noch nicht geladen, aber Kennzahlen da und leer → idle statt Dauer-Spinner", () => {
    expect(deriveSourceState({ connected: undefined, delivering: false, metricsKnown: true })).toBe("idle");
  });

  it("gar nichts geladen → unknown, wir behaupten nichts", () => {
    expect(deriveSourceState({})).toBe("unknown");
    expect(sourceStateLabel(deriveSourceState({}))).toBe("–");
    expect(countsAsConnected("unknown")).toBe(false);
  });

  it("countsAsConnected zählt manual und idle nicht mit", () => {
    expect(countsAsConnected("active")).toBe(true);
    expect(countsAsConnected("connected")).toBe(true);
    expect(countsAsConnected("idle")).toBe(false);
    expect(countsAsConnected("manual")).toBe(false);
  });
});

describe("isConnectedStatus", () => {
  it("erkennt die verbundenen Zustände", () => {
    expect(isConnectedStatus("connected")).toBe(true);
    expect(isConnectedStatus("active")).toBe(true);
  });

  it("reauth_required ist verbunden — es fehlt nur eine Freigabe", () => {
    expect(isConnectedStatus("reauth_required")).toBe(true);
  });

  it("permission_required (Shopify ohne read_orders) ist verbunden", () => {
    expect(isConnectedStatus("permission_required")).toBe(true);
  });

  it("not_connected / pending / error sind nicht verbunden", () => {
    expect(isConnectedStatus("not_connected")).toBe(false);
    expect(isConnectedStatus("pending")).toBe(false);
    expect(isConnectedStatus("error")).toBe(false);
  });

  it("unbekannt bleibt unbekannt statt false", () => {
    expect(isConnectedStatus(null)).toBeUndefined();
    expect(isConnectedStatus(undefined)).toBeUndefined();
    expect(isConnectedStatus("")).toBeUndefined();
    expect(isConnectedStatus("   ")).toBeUndefined();
  });

  it("ist unempfindlich gegen Groß-/Kleinschreibung und Leerzeichen", () => {
    expect(isConnectedStatus("  Connected ")).toBe(true);
  });
});
