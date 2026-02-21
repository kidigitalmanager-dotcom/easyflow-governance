import { useMe, usePlaybooks } from "@/hooks/use-api";
import { Check, Lock, ExternalLink, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PACK_LABELS: Record<string, string> = {
  ecom_core: "E-Commerce Pack",
  b2b_sales: "B2B Sales Pack",
  logistics: "Logistics Pack",
  hotel: "Hotel Pack",
  education: "Education Pack",
  real_estate: "Real Estate Pack",
};

export default function Playbooks() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: pbData, isLoading: pbLoading } = usePlaybooks();

  const tenant = me?.tenant;
  const plan = me?.plan;
  const isActive = tenant && tenant.status !== "not_onboarded";
  const hasNoPlan = !isActive || !plan;

  const isLoading = meLoading || pbLoading;

  const packLabel = pbData?.pack_key ? (PACK_LABELS[pbData.pack_key] ?? pbData.pack_key) : null;
  const playbooks = pbData?.playbooks ?? [];
  const totalRules = pbData?.total_rules ?? 0;
  const activeRules = pbData?.active_rules ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Playbooks</h1>
          {playbooks.length > 0 ? (
            <div className="flex items-center gap-3 mt-1">
              {packLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30">
                  <BookOpen className="w-3 h-3" /> {packLabel}
                </span>
              )}
              <p className="text-sm text-muted-foreground">
                {activeRules} aktive Regeln in {playbooks.length} Playbooks
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {hasNoPlan ? "Noch keine Playbooks aktiviert." : "Kein Playbook-Pack konfiguriert."}
            </p>
          )}
        </div>

        {/* Empty / no-plan state */}
        {(hasNoPlan || playbooks.length === 0) && (
          <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
            <Lock className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {hasNoPlan
                ? "Aktiviere einen Plan, um Playbooks zu nutzen."
                : "Kein Playbook-Pack konfiguriert. Kontaktiere deinen Admin."}
            </p>
            {hasNoPlan && (
              <a
                href="https://useeasy.ai/pricing"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Plan aktivieren
              </a>
            )}
          </div>
        )}

        {/* Playbook cards from API */}
        {playbooks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playbooks.map((pb) => (
              <div
                key={pb.name}
                className={`glass-card p-5 transition-all duration-200 ${
                  pb.active ? "border-primary/30" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold">{pb.name}</h3>
                  {pb.active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30">
                      <Check className="w-3 h-3" /> Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border">
                      Inaktiv
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-3">
                  {pb.rules_active} / {pb.rules_total} Regeln aktiv
                </p>

                {/* Rules list */}
                <ul className="space-y-1 mb-4">
                  {pb.rules.slice(0, 4).map((rule) => (
                    <li key={rule.name} className="text-xs text-muted-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${rule.active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        {rule.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border">
                        {rule.priority}
                      </span>
                    </li>
                  ))}
                  {pb.rules.length > 4 && (
                    <li className="text-xs text-muted-foreground/60">
                      +{pb.rules.length - 4} weitere Regeln
                    </li>
                  )}
                </ul>

                {hasNoPlan ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground opacity-50 cursor-not-allowed"
                      >
                        Aktivieren
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Plan erforderlich</TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="text-center text-xs text-muted-foreground font-medium py-2">
                    {pb.active ? "Aktiv" : "Deaktiviert"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
