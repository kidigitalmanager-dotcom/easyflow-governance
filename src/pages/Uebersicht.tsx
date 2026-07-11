import { useEffect, useState } from "react";
import { Clock, Mail, CheckCircle, AlertTriangle, TrendingUp, ChevronRight, Inbox, Bot } from "lucide-react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { responseType } from "@/data/humanize";
import { useDashboardStats, useRecentEmails, useImproveSuggestion, useConsentImprove } from "@/hooks/use-api";
import { humanizeCategory, prettyRedaction } from "@/data/humanize";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { storeProviderTokens } from "@/lib/api-client";
import { OnboardingNudges } from "@/components/onboarding/OnboardingNudges";

export default function Uebersicht() {
  useEffect(() => {
    storeProviderTokens();
  }, []);
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { data: improve } = useImproveSuggestion();
  const consent = useConsentImprove();
  const [improveDismissed, setImproveDismissed] = useState(false);
  const { data: emails, isLoading: emailsLoading } = useRecentEmails();

  const kpis = stats
    ? [
        { label: "E-Mails heute", value: String(stats.emails_today), icon: Mail, trend: "" },
        { label: "E-Mails diese Woche", value: String(stats.emails_week), icon: Mail, trend: "" },
        { label: "Entwürfe erstellt", value: String(stats.drafts_created_week), icon: CheckCircle, trend: "" },
        { label: "Gelöst diese Woche", value: String(stats.resolved_week), icon: TrendingUp, trend: "" },
      ]
    : [];

  const priorityBreakdown = stats?.priority_breakdown ?? {};

  // Spiegelt die Review-Queue-Logik (has_draft || pending), damit Uebersicht und
  // Review Queue NICHT widersprechen. Sortiert nach Prioritaet (P0 zuerst).
  const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const NEEDS_ACTION = new Set(["pending", "needs_review", "pending_review"]);
  const pendingEmails = (emails ?? [])
    .filter((e) => e.has_draft || NEEDS_ACTION.has(e.status))
    .sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="text-sm text-muted-foreground mt-1">Dein UseEasy Dashboard – KPIs, offene Reviews und Eskalationen.</p>
      </div>

      <OnboardingNudges />

      {/* v4.26.0 (3A): nicht-technische "System verbessern?"-Karte */}
      {improve?.suggestion && !improveDismissed && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">System verbessern?</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Uns ist aufgefallen: Mails von <span className="font-medium text-foreground">{improve.suggestion.sender_domain}</span> hast du schon {improve.suggestion.count}× nach <span className="font-medium text-foreground">{humanizeCategory(improve.suggestion.to_core_key)}</span> umsortiert. Sollen wir UseEasy dafür dauerhaft verbessern?
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" disabled={consent.isPending} onClick={() => {
              const s = improve.suggestion!;
              consent.mutate({ patternKey: s.pattern_key, toCoreKey: s.to_core_key, senderDomain: s.sender_domain }, {
                onSuccess: () => { toast.success("Danke! Wir kümmern uns darum."); setImproveDismissed(true); },
                onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
              });
            }}>
              {consent.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Ja, verbessern
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImproveDismissed(true)}>Nicht jetzt</Button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : statsError ? (
        <div className="glass-card p-6 text-center text-sm text-destructive">
          Fehler beim Laden der Statistiken. Bitte versuche es erneut.
        </div>
      ) : (
        <>
          {kpis.every(k => k.value === "0") ? (
            <div className="glass-card p-6 text-center">
              <Inbox className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Noch keine E-Mails verarbeitet. Verbinde deine Mailbox, um loszulegen.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <kpi.icon className="w-4 h-4 text-muted-foreground" />
                    {kpi.trend && <span className="text-xs font-medium text-primary">{kpi.trend}</span>}
                  </div>
                  <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue Widget */}
        <div data-tour="ueb-queue" className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Wartet auf Freigabe</h2>
            <Link to="/review" className="text-xs text-primary hover:underline flex items-center gap-1">
              Zur Review Queue <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {emailsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
          ) : pendingEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Inbox className="w-8 h-8 mb-2" />
              <p className="text-sm">Aktuell nichts zur Freigabe.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingEmails.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{prettyRedaction(item.subject)}</p>
                    <p className="text-xs text-muted-foreground">{item.sender} · {new Date(item.created_at).toLocaleString("de-DE")}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ResponseTypeBadge type={responseType(item)} />
                    <PriorityBadge priority={item.priority} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column – Autopilot + Priority Breakdown */}
        <div className="space-y-6">
          {/* v4.43.0: "Heute hätte UseEasy autonom: N" — Shadow-Aggregat, Drill-down → Audit-Trail */}
          <Link to="/audit?shadow=1" className="glass-card p-6 block hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold">Autopilot heute</h2>
              <Bot className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mb-4">Was UseEasy autonom erledigt hätte.</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-semibold text-emerald-500">{Number(stats?.shadow_would_send_today ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">würde senden</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-amber-500">{Number(stats?.shadow_would_hold_today ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">würde halten</p>
              </div>
              {Number(stats?.autopilot_queued_today ?? 0) > 0 && (
                <div>
                  <p className="text-2xl font-semibold text-primary">{Number(stats?.autopilot_queued_today ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">automatisch</p>
                </div>
              )}
            </div>
            <span className="text-xs text-primary hover:underline mt-4 inline-flex items-center gap-1">
              Im Audit-Trail ansehen <ChevronRight className="w-3 h-3" />
            </span>
          </Link>
          <div className="glass-card p-6">
            <h2 className="text-base font-semibold mb-4">Prioritäts-Verteilung</h2>
            {statsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 rounded-md" />
                ))}
              </div>
            ) : Object.keys(priorityBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Daten vorhanden.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(priorityBreakdown).map(([prio, count]) => (
                  <div key={prio} className="flex items-center justify-between">
                    <PriorityBadge priority={prio as "P0" | "P1" | "P2" | "P3"} />
                    <span className="text-lg font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
