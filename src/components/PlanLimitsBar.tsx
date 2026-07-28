import { useMe } from "@/hooks/use-api";
import { Progress } from "@/components/ui/progress";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLimit, isUnlimitedLimit, planLabel } from "@/lib/api-client";

export function PlanLimitsBar() {
  const { data: me, isLoading } = useMe();

  const tenant = me?.tenant;
  const plan = me?.plan;
  const isActive = tenant && tenant.status !== "not_onboarded";

  const planName = plan?.name ? planLabel(plan.name) : (isActive ? "Team" : "Kein Plan aktiv");

  // v4.153.0 — unbegrenzt (Team-Paket) ist ein eigener Zustand, keine grosse
  // Zahl: kein Fortschrittsbalken, der nie voll wird, und keine "0" durch
  // `limit ?? 0`, wenn das Backend -1 schickt.
  const items = isActive && plan
    ? [
        {
          label: "Mailboxen",
          used: plan.active_mailboxes ?? 0,
          limit: plan.mailbox_limit ?? 0,
          unlimited: isUnlimitedLimit(plan.mailbox_limit, plan.mailbox_unlimited),
        },
      ]
    : [
        { label: "Mailboxen", used: 0, limit: 0, unlimited: false },
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
            {!item.unlimited && <Progress value={pct} className="w-16 h-1.5" />}
            <span className="text-foreground font-medium shrink-0">
              {item.unlimited
                ? `${item.used} · unbegrenzt`
                : `${item.used >= 99999 ? "∞" : item.used} / ${formatLimit(item.limit)}`}
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
