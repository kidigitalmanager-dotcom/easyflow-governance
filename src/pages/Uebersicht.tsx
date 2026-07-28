import { useEffect, useState } from "react";
import { ChevronRight, Inbox, Sparkles, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { responseType, humanizeCategory, prettyRedaction } from "@/data/humanize";
import { useDashboardStats, useRecentEmails, useImproveSuggestion, useConsentImprove } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { storeProviderTokens } from "@/lib/api-client";
import { OnboardingNudges } from "@/components/onboarding/OnboardingNudges";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { FristenBoard } from "@/components/FristenBoard";
import { FristenStrip } from "@/components/ue/FristenStrip";
import { AutopilotReifeWidget } from "@/components/AutopilotReifeWidget";
import { WochenRueckblick } from "@/components/WochenRueckblick";
import { LiveActivity } from "@/components/ue/LiveActivity";
import { PageHeader, StatCard, SectionCard, EmptyState, Dot } from "@/components/ue/primitives";

/**
 * Heute — Tagesbericht (Briefing §2, Phase 2 des Umsetzungsplans).
 *
 * Aufbau nach Leons Entwurf: Statement-Kopf, vier KPIs mit Count-up,
 * "Braucht dich jetzt", Fristen (7/14 Tage), Reife-Ring und Live-Aktivitaet.
 *
 * Grundregel bleibt: nichts anzeigen, was der Server nicht liefert. Alle
 * Kennzahlen haengen an /stats bzw. /emails/recent; ein Query-Fehler zeigt
 * QueryErrorNotice und NICHT den Leer-Zustand.
 */
export default function Uebersicht() {
  useEffect(() => {
    storeProviderTokens();
  }, []);

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: statsRefetch, isFetching: statsFetching } =
    useDashboardStats();
  const { data: improve } = useImproveSuggestion();
  const consent = useConsentImprove();
  const [improveDismissed, setImproveDismissed] = useState(false);
  // 2026-07-27: error mit destrukturieren — ein API-Fehler darf nicht wie
  // "Aktuell nichts zur Freigabe" aussehen.
  const {
    data: emails,
    isLoading: emailsLoading,
    isError: emailsError,
    refetch: emailsRefetch,
    isFetching: emailsFetching,
  } = useRecentEmails();

  // Spiegelt die Review-Queue-Logik (has_draft || pending), damit Uebersicht und
  // Review Queue NICHT widersprechen. Sortiert nach Prioritaet (P0 zuerst).
  const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const NEEDS_ACTION = new Set(["pending", "needs_review", "pending_review"]);
  const allPending = (emails ?? [])
    .filter((e) => e.has_draft || NEEDS_ACTION.has(e.status))
    .sort((a, b) => (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9));
  const pendingEmails = allPending.slice(0, 6);

  const priorityBreakdown = stats?.priority_breakdown ?? {};
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
  })();

  return (
    <div className="space-y-7">
      <PageHeader
        kicker={new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting} —`}
        accent="dein Tagesbericht."
        subtitle="Was über Nacht gelesen und einsortiert wurde, was dich jetzt braucht und welche Fristen näherkommen. Entwürfe erstellst du mit einem Klick in den Freigaben."
      />

      <OnboardingNudges />

      {/* v4.26.0 (3A): nicht-technische "System verbessern?"-Karte */}
      {improve?.suggestion && !improveDismissed && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-4 animate-fade-up">
          <div className="flex min-w-0 items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">System verbessern?</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Uns ist aufgefallen: Mails von{" "}
                <span className="font-medium text-foreground">{improve.suggestion.sender_domain}</span> hast du schon{" "}
                {improve.suggestion.count}× nach{" "}
                <span className="font-medium text-foreground">{humanizeCategory(improve.suggestion.to_core_key)}</span>{" "}
                umsortiert. Sollen wir UseEasy dafür dauerhaft verbessern?
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              disabled={consent.isPending}
              onClick={() => {
                const s = improve.suggestion!;
                consent.mutate(
                  { patternKey: s.pattern_key, toCoreKey: s.to_core_key, senderDomain: s.sender_domain },
                  {
                    onSuccess: () => {
                      toast.success("Danke! Wir kümmern uns darum.");
                      setImproveDismissed(true);
                    },
                    onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                  },
                );
              }}
            >
              {consent.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Ja, verbessern
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setImproveDismissed(true)}>
              Nicht jetzt
            </Button>
          </div>
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[var(--radius)]" />
          ))}
        </div>
      ) : statsError ? (
        <QueryErrorNotice
          label="Die Kennzahlen konnten nicht geladen werden."
          onRetry={() => statsRefetch()}
          retrying={statsFetching}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="E-Mails heute"
            value={stats?.emails_today ?? null}
            glow
            hint="gelesen und einsortiert"
            className="stagger-1 animate-fade-up"
          />
          <StatCard
            label="E-Mails diese Woche"
            value={stats?.emails_week ?? null}
            className="stagger-2 animate-fade-up"
          />
          <StatCard
            label="Entwürfe erstellt"
            value={stats?.drafts_created_week ?? null}
            hint="diese Woche · warten auf dich"
            className="stagger-3 animate-fade-up"
          />
          <StatCard
            label="Gelöst diese Woche"
            value={stats?.resolved_week ?? null}
            className="stagger-4 animate-fade-up"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Linke Spalte ──────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <div data-tour="ueb-queue">
            <SectionCard
              title="Braucht dich jetzt"
              subtitle={
                emailsError
                  ? undefined
                  : `${allPending.length} ${allPending.length === 1 ? "Vorgang wartet" : "Vorgänge warten"} auf Freigabe`
              }
              bodyClassName="p-0"
              action={
                <Link to="/review" className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline">
                  Alle Freigaben <ChevronRight className="h-3 w-3" />
                </Link>
              }
            >
              {emailsLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : emailsError ? (
                <div className="p-4">
                  <QueryErrorNotice
                    label="Die Freigabe-Liste konnte nicht geladen werden."
                    onRetry={() => emailsRefetch()}
                    retrying={emailsFetching}
                  />
                </div>
              ) : pendingEmails.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="h-7 w-7" />}
                  title="Aktuell nichts zur Freigabe."
                  description="Sobald ein neuer Vorgang hereinkommt, findest du ihn hier — und in den Freigaben."
                />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {pendingEmails.map((item) => (
                    <li key={item.id}>
                      <Link
                        to="/review"
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{prettyRedaction(item.subject)}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {item.sender} · {new Date(item.created_at).toLocaleString("de-DE")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ResponseTypeBadge type={responseType(item)} />
                          <PriorityBadge priority={item.priority} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* Fristen: erst das 14-Tage-Band (Ueberblick), darunter die Liste mit
              den Namen. Leon-Entscheid 27.07.: das Band ERSETZT die Liste nicht,
              sonst sieht man nicht mehr, zu wem eine Frist gehoert. Das Band
              traegt Leer- und Fehlerzustand fuer beide, die Liste darunter
              bleibt bei leer bewusst still (sonst zwei Leermeldungen). */}
          <FristenStrip />
          <FristenBoard />

          <LiveActivity />
        </div>

        {/* ── Rechte Spalte ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* v4.43.0: "Heute hätte UseEasy autonom: N" — Shadow-Aggregat,
              Drill-down → Audit-Trail */}
          <SectionCard
            title="Autopilot heute"
            subtitle="was UseEasy autonom erledigt hätte"
            action={
              <Link
                to="/audit?shadow=1"
                className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
              >
                Details <ChevronRight className="h-3 w-3" />
              </Link>
            }
          >
            {statsError ? (
              <QueryErrorNotice label="Die Autopilot-Zahlen konnten nicht geladen werden." />
            ) : (
              <div className="flex flex-wrap items-start gap-6">
                <MiniStat label="würde senden" value={stats?.shadow_would_send_today} tone="emerald" />
                <MiniStat label="würde halten" value={stats?.shadow_would_hold_today} tone="amber" />
                {/* v4.155.0: Ohne Entwurf kann UseEasy nicht behaupten, es haette
                    gesendet. Alle anderen Kriterien kann es aber pruefen. Genau
                    das zeigt diese Zahl: geeignet gewesen, nur der Entwurf fehlte. */}
                <MiniStat
                  label="wäre geeignet"
                  value={stats?.shadow_would_qualify_today}
                  tone="muted"
                  hint="Alle Autopilot-Kriterien erfüllt, es lag nur kein Entwurf vor. Entwürfe entstehen aktuell auf Knopfdruck."
                />
                {Number(stats?.autopilot_queued_today ?? 0) > 0 && (
                  <MiniStat label="automatisch" value={stats?.autopilot_queued_today} tone="emerald" />
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Prioritäts-Verteilung">
            {statsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 rounded-md" />
                ))}
              </div>
            ) : statsError ? (
              <QueryErrorNotice label="Die Verteilung konnte nicht geladen werden." />
            ) : Object.keys(priorityBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Daten vorhanden.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(priorityBreakdown).map(([prio, count]) => (
                  <div key={prio} className="flex items-center justify-between">
                    <PriorityBadge priority={prio as "P0" | "P1" | "P2" | "P3"} />
                    <span className="tabular text-[17px] font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Reife-Fortschritt + Wochen-Rueckblick (rendern nur mit Daten) */}
          <AutopilotReifeWidget />
          <WochenRueckblick />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  tone: "emerald" | "amber" | "muted";
  hint?: string;
}) {
  const has = value !== null && value !== undefined;
  const toneClass =
    tone === "amber" ? "text-amber" : tone === "muted" ? "text-muted-foreground" : "text-primary";
  return (
    <div title={hint}>
      <p className={"tabular text-[26px] font-semibold leading-none " + toneClass}>
        {has ? Number(value) : "–"}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Dot tone={tone} className="!h-1.5 !w-1.5" />
        {label}
      </p>
    </div>
  );
}
