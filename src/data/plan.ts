export type PlanId = "starter" | "team" | "scale" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  includedPlaybooks: number;
  mailboxLimit: number;
  emailLimit: string;
  draftLimit: string;
  exportEnabled: boolean;
  processedEmails: number;
  draftCredits: number;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", includedPlaybooks: 1, mailboxLimit: 1, emailLimit: "500 / Monat", draftLimit: "100 / Monat", exportEnabled: false, processedEmails: 500, draftCredits: 100 },
  team: { id: "team", name: "Team", includedPlaybooks: 2, mailboxLimit: 3, emailLimit: "2.000 / Monat", draftLimit: "500 / Monat", exportEnabled: false, processedEmails: 2000, draftCredits: 500 },
  scale: { id: "scale", name: "Scale", includedPlaybooks: 4, mailboxLimit: 10, emailLimit: "10.000 / Monat", draftLimit: "2.500 / Monat", exportEnabled: true, processedEmails: 10000, draftCredits: 2500 },
  pro: { id: "pro", name: "Pro", includedPlaybooks: 6, mailboxLimit: 25, emailLimit: "Unbegrenzt", draftLimit: "Unbegrenzt", exportEnabled: true, processedEmails: 99999, draftCredits: 99999 },
};

// Mock usage data
export const USAGE = {
  mailboxesUsed: 2,
  activePlaybooks: 1,
  processedEmails: 847,
  draftCreditsUsed: 213,
};

// Current plan context
export const currentPlan: PlanId = "team";
export const getCurrentPlan = () => PLANS[currentPlan];
