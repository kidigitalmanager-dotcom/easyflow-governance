import { getCurrentPlan, USAGE } from "@/data/plan";
import { Progress } from "@/components/ui/progress";
import { ExternalLink } from "lucide-react";

export function PlanLimitsBar() {
  const plan = getCurrentPlan();

  const items = [
    { label: "Mailboxen", used: USAGE.mailboxesUsed, limit: plan.mailboxLimit },
    { label: "Playbooks", used: USAGE.activePlaybooks, limit: plan.includedPlaybooks },
    { label: "E-Mails", used: USAGE.processedEmails, limit: plan.processedEmails },
    { label: "Entwürfe", used: USAGE.draftCreditsUsed, limit: plan.draftCredits },
  ];

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 bg-muted/30 border-b border-border text-xs">
      <span className="text-muted-foreground font-medium shrink-0">{plan.name}-Plan</span>
      {items.map((item) => {
        const pct = Math.min(100, Math.round((item.used / item.limit) * 100));
        return (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{item.label}</span>
            <Progress value={pct} className="w-16 h-1.5" />
            <span className="text-foreground font-medium shrink-0">
              {item.used >= 99999 ? "∞" : item.used} / {item.limit >= 99999 ? "∞" : item.limit}
            </span>
          </div>
        );
      })}
      <button className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium shrink-0 transition-colors">
        <ExternalLink className="w-3 h-3" /> Plan upgraden
      </button>
    </div>
  );
}
