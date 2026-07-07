import { describe, it, expect } from "vitest";
import {
  evaluateUpsell,
  complianceSignalCount,
  complianceConfirmedCount,
  COMPLIANCE_SIGNAL_MIN,
  DRAFTS_WEEK_MIN,
  type UpsellComplianceItem,
  type UpsellInput,
} from "./upsell";

const item = (subtype: string, severity: string, count: number | null): UpsellComplianceItem => ({ subtype, severity, count });

const base = (over: Partial<UpsellInput> = {}): UpsellInput => ({
  hasTenant: true,
  complianceItems: [],
  draftsCreatedWeek: 0,
  dismissed: [],
  ...over,
});

describe("upsell counting helpers", () => {
  it("summiert nur Cluster-Subtypes (dsar zaehlt NICHT)", () => {
    const items = [item("dunning_escalation", "amber", 5), item("legal_signal", "red", 3), item("dsar_pending", "red", 9), item("deadline_overdue", "amber", 2)];
    expect(complianceSignalCount(items)).toBe(10); // 5 + 3 + 2, dsar 9 ignoriert
  });
  it("coerct null/negative counts auf 0", () => {
    expect(complianceSignalCount([item("dunning_escalation", "amber", null), item("legal_signal", "amber", -4)])).toBe(0);
  });
  it("zaehlt nur rote Cluster-Signale als bestaetigt", () => {
    const items = [item("dunning_escalation", "red", 1), item("legal_signal", "amber", 9), item("dsar_pending", "red", 9)];
    expect(complianceConfirmedCount(items)).toBe(1); // nur dunning rot; dsar ausserhalb Cluster
  });
});

describe("evaluateUpsell - Gate", () => {
  it("kein Vorschlag ohne echtes Firmen-Konto", () => {
    expect(evaluateUpsell(base({ hasTenant: false, draftsCreatedWeek: 999, complianceItems: [item("dunning_escalation", "red", 99)] }))).toBeNull();
  });
  it("kein Vorschlag bei leeren Signalen", () => {
    expect(evaluateUpsell(base())).toBeNull();
  });
});

describe("evaluateUpsell - Compliance-Regel -> Branchen-Pack", () => {
  it("feuert ab Schwelle (Summe >= COMPLIANCE_SIGNAL_MIN)", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("dunning_escalation", "amber", 5), item("legal_signal", "amber", 3)] }));
    expect(s?.key).toBe("compliance_addon");
    expect(s?.addonLookupKey).toBe("ue2_branch_pack_monthly");
    expect(s?.evidenceCount).toBe(8);
    expect(s?.tier).toBe("info");
    expect(s?.headline).toContain("8 offene");
  });
  it("feuert sofort bei bestaetigtem (rotem) Signal auch unter der Summen-Schwelle", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("legal_signal", "red", 2)] }));
    expect(s?.key).toBe("compliance_addon");
    expect(s?.tier).toBe("urgent");
    expect(s?.evidenceCount).toBe(2);
  });
  it("feuert NICHT knapp unter der Schwelle ohne rotes Signal", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("dunning_escalation", "amber", COMPLIANCE_SIGNAL_MIN - 1)] }));
    expect(s).toBeNull();
  });
  it("Singular-Text bei genau 1 bestaetigtem Signal (count 0)", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("legal_signal", "red", 0)] }));
    expect(s?.key).toBe("compliance_addon");
    expect(s?.evidenceCount).toBe(1);
    expect(s?.headline).toContain("1 bestätigtes");
  });
});

describe("evaluateUpsell - Draft-Volumen-Regel -> Autopilot", () => {
  it("feuert ab DRAFTS_WEEK_MIN", () => {
    const s = evaluateUpsell(base({ draftsCreatedWeek: DRAFTS_WEEK_MIN }));
    expect(s?.key).toBe("autopilot_addon");
    expect(s?.addonLookupKey).toBe("ue2_autopilot_monthly");
    expect(s?.evidenceCount).toBe(DRAFTS_WEEK_MIN);
    expect(s?.headline).toContain(`${DRAFTS_WEEK_MIN} Entwürfe`);
  });
  it("feuert NICHT knapp darunter", () => {
    expect(evaluateUpsell(base({ draftsCreatedWeek: DRAFTS_WEEK_MIN - 1 }))).toBeNull();
  });
});

describe("evaluateUpsell - Prioritaet + Opt-out (nur EIN Vorschlag)", () => {
  it("bei beiden aktiven Regeln gewinnt Compliance (Reihenfolge)", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("dunning_escalation", "amber", 6)], draftsCreatedWeek: 40 }));
    expect(s?.key).toBe("compliance_addon");
  });
  it("dringliche Compliance bleibt vor Autopilot", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("legal_signal", "red", 8)], draftsCreatedWeek: 40 }));
    expect(s?.key).toBe("compliance_addon");
    expect(s?.tier).toBe("urgent");
  });
  it("weggeklickte Compliance -> faellt auf Autopilot zurueck", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("dunning_escalation", "red", 9)], draftsCreatedWeek: 40, dismissed: ["compliance_addon"] }));
    expect(s?.key).toBe("autopilot_addon");
  });
  it("beide weggeklickt -> null", () => {
    const s = evaluateUpsell(base({ complianceItems: [item("dunning_escalation", "red", 9)], draftsCreatedWeek: 40, dismissed: ["compliance_addon", "autopilot_addon"] }));
    expect(s).toBeNull();
  });
});
