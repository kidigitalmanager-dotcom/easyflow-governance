import { describe, it, expect } from "vitest";
import { needsMfaChallenge, pickVerifiedTotpFactor, listUnverifiedFactors } from "./mfa";

describe("needsMfaChallenge — Regressions-Matrix", () => {
  it("User OHNE Faktor (aal1/aal1) → KEINE Challenge (Login exakt wie heute)", () => {
    expect(needsMfaChallenge("aal1", "aal1")).toBe(false);
  });
  it("User MIT Faktor, Code fehlt (aal1/aal2) → Challenge", () => {
    expect(needsMfaChallenge("aal1", "aal2")).toBe(true);
  });
  it("Code bereits eingegeben (aal2/aal2) → keine Challenge", () => {
    expect(needsMfaChallenge("aal2", "aal2")).toBe(false);
  });
  it("null/undefined (Fehlerpfad) → fail-open, keine Challenge", () => {
    expect(needsMfaChallenge(null, null)).toBe(false);
    expect(needsMfaChallenge(undefined, undefined)).toBe(false);
    expect(needsMfaChallenge("aal1", null)).toBe(false);
  });
});

describe("pickVerifiedTotpFactor", () => {
  it("findet den verifizierten Faktor, ignoriert unverifizierte", () => {
    const f = pickVerifiedTotpFactor([
      { id: "a", status: "unverified" },
      { id: "b", status: "verified" },
    ]);
    expect(f?.id).toBe("b");
  });
  it("null bei leerer/fehlender Liste", () => {
    expect(pickVerifiedTotpFactor([])).toBeNull();
    expect(pickVerifiedTotpFactor(null)).toBeNull();
    expect(pickVerifiedTotpFactor(undefined)).toBeNull();
  });
  it("unverifizierte Enrollments blockieren nie (nur unverified → null)", () => {
    expect(pickVerifiedTotpFactor([{ id: "a", status: "unverified" }])).toBeNull();
  });
});

describe("listUnverifiedFactors", () => {
  it("liefert nur unverifizierte (Aufräum-Kandidaten)", () => {
    const list = listUnverifiedFactors([
      { id: "a", status: "unverified" },
      { id: "b", status: "verified" },
    ]);
    expect(list.map((f) => f.id)).toEqual(["a"]);
  });
});
