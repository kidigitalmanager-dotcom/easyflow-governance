import { useMe } from "@/hooks/use-api";
import { Progress } from "@/components/ui/progress";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function PlanLimitsBar() {
  const { data: me, isLoading } = useMe();

  const tenant = me?.tenant;
  const isActive = tenant && tenant.status !== "not_onboarded";

  const planName = isActive ? (tenant.plan ?? "Team") : "Kein Plan aktiv";

  const items = isActive
    ? [
        { label: "Mailboxen", used: tenant.mailboxes_used ?? 0, limit: tenant.mailbox_limit ?? 0 },
        { label: "Playbooks", used: tenant.playbooks_used ?? 0, limit: tenant.playbook_limit ?? 0 },
        { label: "E-Mails", used: tenant.emails_used ?? 0, limit: tenant.email_limit ?? 0 },
        { label: "Entwürfe", used: tenant.drafts_used ?? 0, limit: tenant.draft_limit ?? 0 },
      ]
    : [
        { label: "Mailboxen", used: 0, limit: 0 },
        { label: "Playbooks", used: 0, limit: 0 },
        { label: "E-Mails", used: 0, limit: 0 },
        { label: "Entwürfe", used: 0, limit: 0 },
      ];

  if (isLoading) {
    return (
      <div className="flex items-center gap-6 px-6 py-2.5 bg-muted/30 border-b border-border text-xs">
        <Skeleton className="h-4 w-20" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 px-6 py-2.5 bg-muted/30 border-b border-border text-xs">
      <span className="text-muted-foreground font-medium shrink-0">{planName}</span>
      {items.map((item) => {
        const pct = item.limit > 0 ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
        return (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{item.label}</span>
            <Progress value={pct} className="w-16 h-1.5" />
            <span className="text-foreground font-medium shrink-0">
              {item.used >= 99999 ? "∞" : item.used} / {item.limit >= 99999 ? "∞" : (item.limit || 0)}
            </span>
          </div>
        );
      })}
      <a
        href="https://useeasy.ai/pricing"
        className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium shrink-0 transition-colors"
      >
        <ExternalLink className="w-3 h-3" /> {isActive ? "Plan upgraden" : "Plan aktivieren"}
      </a>
    </div>
  );
}
