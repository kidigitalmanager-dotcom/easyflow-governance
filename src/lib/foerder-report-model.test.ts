import { describe, it, expect } from "vitest";
import { buildFoerderReportModel, foerderAmountLabel } from "./foerder-report-model";
import type { FoerderRadar } from "@/lib/capital";

function radar(over: Partial<FoerderRadar> = {}): FoerderRadar {
  return {
    has_tenant: true,
    account_name: "Muster GmbH",
    vertical: "ecom",
    vertical_label: "E-Commerce",
    profile: { founding_year: 2021, city: "Hamburg", region: "HH", postal_code: null, employee_count: 8 },
    suggested: { founding_year: 2021 },
    kpi: {
      grant_count: 4, verified_count: 1, financing_count: 3, conditional_count: 2, total_visible: 9,
      latent_verified_min: 15000, latent_verified_max: 25000,
      latent_total_min: 40000, latent_total_max: 120000, latent_conditional_max: 30000,
      top_program: { name: "Digital Jetzt", amount_max_eur: 50000 },
    },
    programs: [
      { program_key: "dig", name: "Digital Jetzt", level: "Bund", region: null, provider: "BMWK", funding_type: "Zuschuss", grant_class: "zuschuss", status_class: "verify", source_type: "curated", description: "Digitalisierung", eligibility: "KMU bis 499 MA", amount_min_eur: 17000, amount_max_eur: 50000, source: "bmwk.de", is_startup_program: false, conditional_note: null, match_status: "match", match_reason: null },
      { program_key: "gh", name: "go-digital", level: "Bund", region: null, provider: "BMWK", funding_type: "Zuschuss", grant_class: "zuschuss", status_class: "verified", source_type: "curated", description: "IT-Sicherheit", eligibility: "KMU", amount_min_eur: 8000, amount_max_eur: 25000, source: "bmwk.de", is_startup_program: false, conditional_note: null, match_status: "match", match_reason: null },
      { program_key: "auto1", name: "Auto-Programm", level: "Land", region: "HH", provider: "IFB", funding_type: "Zuschuss", grant_class: "zuschuss", status_class: "verify", source_type: "auto", description: null, eligibility: null, amount_min_eur: null, amount_max_eur: 45000, source: "foerderdatenbank.de", is_startup_program: false, conditional_note: null, match_status: "match", match_reason: null },
      { program_key: "kredit1", name: "ERP-Kredit", level: "Bund", region: null, provider: "KfW", funding_type: "Kredit", grant_class: "kredit", status_class: "verified", source_type: "curated", description: "Wachstum", eligibility: "KMU", amount_min_eur: null, amount_max_eur: 500000, source: "kfw.de", is_startup_program: false, conditional_note: null, match_status: "match", match_reason: null },
    ],
    conditional_programs: [
      { program_key: "inno", name: "InnoRampUp", level: "Land", region: "HH", provider: "IFB", funding_type: "Zuschuss", grant_class: "zuschuss", status_class: "verified", source_type: "curated", description: "Startup", eligibility: "Startups", amount_min_eur: 0, amount_max_eur: 150000, source: "ifbhh.de", is_startup_program: true, conditional_note: "nur fuer Startups < 1 Jahr", match_status: "conditional", match_reason: "nur in Bundesland HH" },
    ],
    ...over,
  } as FoerderRadar;
}

describe("foerderAmountLabel", () => {
  it("range when min<max", () => expect(foerderAmountLabel(1000, 5000)).toBe("1.000 € bis 5.000 €"));
  it("bis when no min", () => expect(foerderAmountLabel(null, 5000)).toBe("bis 5.000 €"));
  it("bis when min==max", () => expect(foerderAmountLabel(5000, 5000)).toBe("bis 5.000 €"));
  it("individuell when no max", () => expect(foerderAmountLabel(null, 0)).toBe("individuell"));
});

describe("buildFoerderReportModel", () => {
  it("latent capital as a band (verified floor to total ceiling)", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.latentLow).toBe(25000);   // verifiedMax because verified_count>0
    expect(m.latentHigh).toBe(120000);
    expect(m.latentIsRange).toBe(true);
  });
  it("falls back to total_min floor when nothing verified", () => {
    const m = buildFoerderReportModel(radar({ kpi: { ...radar().kpi!, verified_count: 0, latent_verified_max: 0 } }));
    expect(m.latentLow).toBe(40000);
    expect(m.latentHigh).toBe(120000);
  });
  it("top matches: only curated grants, verified first, excludes auto + financing", () => {
    const m = buildFoerderReportModel(radar());
    const keys = m.topMatches.map((x) => x.program_key);
    expect(keys).toEqual(["gh", "dig"]);        // gh verified -> first; auto1 + kredit1 excluded
    expect(m.topMatches[0].statusLabel).toBe("web-verifiziert");
  });
  it("counts auto programs as excluded from headline", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.autoExcludedCount).toBe(1);
  });
  it("deterministic reason uses belegte eligibility", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.topMatches.find((x) => x.program_key === "gh")!.reason).toBe("KMU");
  });
  it("LLM blurb overrides the deterministic reason when present", () => {
    const m = buildFoerderReportModel(radar(), { blurbs: { gh: "Passt, weil Ihr Shop IT-Sicherheit foerdern kann." } });
    expect(m.topMatches.find((x) => x.program_key === "gh")!.reason).toBe("Passt, weil Ihr Shop IT-Sicherheit foerdern kann.");
  });
  it("conditional matches carry the condition and note", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.conditionalMatches.length).toBe(1);
    expect(m.conditionalMatches[0].reason).toContain("nur in Bundesland HH");
    expect(m.conditionalMatches[0].conditionalNote).toBe("nur fuer Startups < 1 Jahr");
  });
  it("financing count carried through, not in headline", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.financingCount).toBe(3);
  });
  it("region label + company age derived from profile", () => {
    const m = buildFoerderReportModel(radar(), { nowIso: "2026-07-07T00:00:00Z" });
    expect(m.regionLabel).toBe("Hamburg");
    expect(m.companyAge).toBe(5);
    expect(m.companyName).toBe("Muster GmbH");
  });
  it("distinct curated sources only", () => {
    const m = buildFoerderReportModel(radar());
    expect(m.sources).toEqual(["bmwk.de"]);   // kredit1/auto excluded from curated grants
  });
});
