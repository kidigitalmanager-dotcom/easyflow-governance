import type { CustomerSegment, TenantType } from "./types";

/**
 * Mandanten-Kontext des Risk-Portals.
 *
 * HEUTE: aus dem localStorage, gespiegelt vom bestehenden Rollenmuster
 * (ue_role fuer Unternehmen/Investor). Das reicht fuer Demo und Sprint.
 *
 * SPAETER: tenant_type und customer_segment kommen aus dem Token
 * (siehe Contract, Abschnitt "Basis"). Genau diese eine Datei wird dann
 * umgestellt - kein Aufrufer muss angefasst werden.
 */

export type RiskRole = "underwriter" | "risk" | "admin" | "revision";

export const RISK_ROLE_LABEL: Record<RiskRole, string> = {
  underwriter: "Underwriter",
  risk: "Risk / Validierung",
  admin: "Admin",
  revision: "Revision (lesend)",
};

export type RiskSession = {
  tenantId: string;
  tenantName: string;
  tenantType: TenantType;
  segment: CustomerSegment;
  role: RiskRole;
};

const KEY_SEGMENT = "ue_risk_segment";
const KEY_ROLE = "ue_risk_role";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function getRiskSession(): RiskSession {
  const seg = read(KEY_SEGMENT);
  const role = read(KEY_ROLE);
  return {
    tenantId: "demo_underwriting_book",
    tenantName: "Demo-Bestand",
    // Das Risk-Portal ist per Definition ein Underwriting-Buch. Ein
    // investment-Mandant kommt hier gar nicht erst an (RiskGate in App.tsx).
    tenantType: "underwriting_book",
    segment: (seg as CustomerSegment) || "credit_insurer",
    role: (role as RiskRole) || "underwriter",
  };
}

export function setRiskSegment(seg: CustomerSegment) {
  try { window.localStorage.setItem(KEY_SEGMENT, seg); } catch { /* ignore */ }
}
export function setRiskRole(role: RiskRole) {
  try { window.localStorage.setItem(KEY_ROLE, role); } catch { /* ignore */ }
}

/** Rollen-Gate: wer darf welchen Bereich sehen. */
export function canSeePortfolio(role: RiskRole): boolean {
  return role !== "revision"; // Revision prueft Governance, sieht keine Bestandsdaten.
}
export function canEditAlertRules(role: RiskRole): boolean {
  return role === "risk" || role === "admin";
}
export function canWriteDecisionNote(role: RiskRole): boolean {
  return role === "underwriter" || role === "risk";
}
export function canManageUsers(role: RiskRole): boolean {
  return role === "admin";
}
