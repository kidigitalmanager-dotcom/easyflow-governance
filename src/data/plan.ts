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
  starter: { id: "starter", name: "Starter", includedPlaybooks: 1, mailboxLimit: 1, emailLimit: "2.500 / Monat", draftLimit: "600 / Monat", exportEnabled: false, processedEmails: 2500, draftCredits: 600 },
  team: { id: "team", name: "Team", includedPlaybooks: 2, mailboxLimit: 3, emailLimit: "12.000 / Monat", draftLimit: "3.000 / Monat", exportEnabled: false, processedEmails: 12000, draftCredits: 3000 },
  scale: { id: "scale", name: "Scale", includedPlaybooks: 4, mailboxLimit: 10, emailLimit: "30.000 / Monat", draftLimit: "8.000 / Monat", exportEnabled: true, processedEmails: 30000, draftCredits: 8000 },
  pro: { id: "pro", name: "Pro", includedPlaybooks: 6, mailboxLimit: 25, emailLimit: "80.000 / Monat", draftLimit: "20.000 / Monat", exportEnabled: true, processedEmails: 80000, draftCredits: 20000 },
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
