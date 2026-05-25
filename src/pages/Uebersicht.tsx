import { useEffect } from "react";
import { Clock, Mail, CheckCircle, AlertTriangle, TrendingUp, ChevronRight, Inbox } from "lucide-react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { responseType } from "@/data/humanize";
import { useDashboardStats, useRecentEmails } from "@/hooks/use-api";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { storeProviderTokens } from "@/lib/api-client";

export default function Uebersicht() {
  useEffect(() => {
    storeProviderTokens();
  }, []);
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
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
        <div className="lg:col-span-2 glass-card p-6">
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
                    <p className="text-sm font-medium truncate">{item.subject}</p>
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

        {/* Right column – Priority Breakdown */}
        <div className="space-y-6">
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
