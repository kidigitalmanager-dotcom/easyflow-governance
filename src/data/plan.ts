export type PlanId = "starter" | "team" | "scale" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  includedPlaybooks: number;
  emailLimit: string;
  draftLimit: string;
  exportEnabled: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", includedPlaybooks: 1, emailLimit: "500 / Monat", draftLimit: "100 / Monat", exportEnabled: false },
  team: { id: "team", name: "Team", includedPlaybooks: 2, emailLimit: "2.000 / Monat", draftLimit: "500 / Monat", exportEnabled: false },
  scale: { id: "scale", name: "Scale", includedPlaybooks: 4, emailLimit: "10.000 / Monat", draftLimit: "2.500 / Monat", exportEnabled: true },
  pro: { id: "pro", name: "Pro", includedPlaybooks: 6, emailLimit: "Unbegrenzt", draftLimit: "Unbegrenzt", exportEnabled: true },
};

// Current plan context
export const currentPlan: PlanId = "team";
export const getCurrentPlan = () => PLANS[currentPlan];
