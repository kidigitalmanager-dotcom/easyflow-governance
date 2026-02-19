/**
 * Shared types for the UseEasy API Layer.
 */

// ─── Priority ───
export type PriorityLevel = "P0" | "P1" | "P2" | "P3";

// ─── Plan & Entitlements ───
export type PlanId = "starter" | "team" | "scale" | "pro";

export interface PlanLimits {
  mailboxes: number;
  playbooks: number;
  emailsPerMonth: number;
  draftsPerMonth: number;
  exportEnabled: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  starter: { mailboxes: 1, playbooks: 1, emailsPerMonth: 500, draftsPerMonth: 100, exportEnabled: false },
  team:    { mailboxes: 3, playbooks: 2, emailsPerMonth: 2000, draftsPerMonth: 500, exportEnabled: false },
  scale:   { mailboxes: 10, playbooks: 4, emailsPerMonth: 10000, draftsPerMonth: 2500, exportEnabled: true },
  pro:     { mailboxes: 25, playbooks: 6, emailsPerMonth: -1, draftsPerMonth: -1, exportEnabled: true },
};

// ─── API Request / Response ───

export interface AskAIRequest {
  url?: string;
  subject?: string;
  sender?: string;
  snippet?: string;
  mailbox?: string;
}

export interface AskAIResponse {
  priority: PriorityLevel;
  tldr: string;
  recommendation: string;
  evidence: string[];
  playbookName: string;
  version: string;
  draft: string;
  approvalRequired: boolean;
}

export interface LimitsResponse {
  plan: string;
  mailboxes: { used: number; limit: number };
  playbooks: { used: number; limit: number };
  emails: { used: number; limit: number };
  drafts: { used: number; limit: number };
}

export interface CreateDraftRequest {
  provider: "gmail" | "outlook";
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  accessToken: string; // OAuth token from the client
}

export interface CreateDraftResponse {
  draftId: string;
  provider: "gmail" | "outlook";
  status: "created" | "error";
  message?: string;
}

// ─── Auth ───
export interface AuthContext {
  tenantId: string;
  userId: string;
  plan: PlanId;
}

// ─── Rejection Reasons (no freetext) ───
export const REJECTION_REASONS = [
  "Falscher Inhalt / Missverstanden",
  "Zu riskant / Unsicher",
  "Compliance/Legal unklar",
  "Kunde fragt etwas anderes",
  "Daten fehlen / Rückfrage nötig",
  "Tonalität passt nicht",
  "Preis/Angebot prüfen",
  "Zahlungs-/Bankdaten: manuell prüfen",
  "Sonstiges",
] as const;
