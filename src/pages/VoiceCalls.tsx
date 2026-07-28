// -----------------------------------------------------------------------------
// VoiceCalls.tsx — Vertriebler-Telefonie, Anruf-Audit, DSGVO-Consent, Co-Pilot,
// KI-Agenten und Lead-Listen.
//
// Redesign 27.07.2026 (Leons Entwurf): Die Bereiche stehen nicht mehr als
// TabsList-Reiter da, sondern als KACHELN — je Agent/Bereich eine Karte mit
// Name, Zustand (Dot), Kurzbeschreibung und Aktion. Der Zustand kommt aus den
// echten Queries der jeweiligen Bereiche (gleiche react-query-Keys wie die
// Unterseiten, also kein zusaetzlicher Request beim Oeffnen, sondern ein
// bereits gefuellter Cache). Wo der Server nichts liefert, steht "–";
// scheitert ein Abruf, sagt die Kachel das ("Zustand nicht abrufbar") statt
// stillschweigend "nichts vorhanden" zu behaupten.
//
// Die Bereichs-Logik bleibt: ?tab=<reps|calls|consent|copilot|agents|leads>
// waehlt den Bereich, Deep-Links aus Nav/CommandPalette funktionieren weiter.
// Neu ist nur, dass ein Kachel-Klick den Parameter auch schreibt — damit ist
// der geoeffnete Bereich teil- und wiederherstellbar.
// -----------------------------------------------------------------------------
import { useSearchParams } from "react-router-dom";
import { Users, PhoneCall, ShieldCheck, Rocket, Bot, ListChecks, ChevronRight } from "lucide-react";
import VoiceRepsTab from "@/components/VoiceRepsTab";
import CoPilotRepsTab from "@/components/CoPilotRepsTab";
import SalesCallsAuditTab from "@/components/SalesCallsAuditTab";
import RecordingConsentTab from "@/components/RecordingConsentTab";
import VoiceAgentsTab from "@/components/VoiceAgentsTab";
import LeadUploadTab from "@/components/LeadUploadTab";
import { useVoiceReps, useRecordingConsent, useAgentCatalog, useLeadLists, useCopilotVertriebler } from "@/hooks/use-api";
import { ApiError } from "@/lib/api-client";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, Dot, type DotTone } from "@/components/ue/primitives";
import { VoiceReadinessCard } from "@/components/voice/VoiceReadinessCard";
import { cn } from "@/lib/utils";

type AreaKey = "reps" | "calls" | "consent" | "copilot" | "agents" | "leads";
const AREAS: AreaKey[] = ["reps", "calls", "consent", "copilot", "agents", "leads"];
const isArea = (v: string | null): v is AreaKey => !!v && (AREAS as string[]).includes(v);

/** Zustand einer Kachel — bewusst knapp, immer aus echten Daten. */
type TileState = { tone: DotTone; text: string };
const UNKNOWN: TileState = { tone: "muted", text: "–" };
const FAILED: TileState = { tone: "danger", text: "Zustand nicht abrufbar" };

export default function VoiceCalls() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: AreaKey = isArea(raw) ? raw : "reps";
  const openArea = (v: AreaKey) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (v === "reps") n.delete("tab"); else n.set("tab", v);
      return n;
    }, { replace: true });

  // Dieselben Query-Keys wie in den Unterseiten — react-query liefert beide
  // Aufrufe aus einem Request, die Kacheln kosten also keinen zweiten Abruf.
  const repsQ = useVoiceReps();
  const consentQ = useRecordingConsent();
  const agentsQ = useAgentCatalog();
  const leadsQ = useLeadLists();
  const copilotQ = useCopilotVertriebler();

  // Der Co-Pilot laeuft gegen ein eigenes Backend: "kein Workspace verknuepft"
  // ist KEIN Serverfehler, sondern ein legitimer Zustand (siehe CoPilotRepsTab).
  const copilotNotConnected =
    copilotQ.error instanceof ApiError &&
    ["no_copilot_tenant_for_email", "console_auth_not_configured", "tenant_inactive"].includes(copilotQ.error.message);

  const reps = repsQ.data?.reps ?? [];
  const repsState: TileState = repsQ.isLoading ? UNKNOWN : repsQ.isError ? FAILED : (() => {
    const n = reps.filter((r) => r.active).length;
    return n > 0 ? { tone: "emerald", text: `${n} aktiv` } : { tone: "muted", text: "keine angelegt" };
  })();

  // Anruf-Zaehler stammt aus derselben Reps-Antwort (call_count je Vertriebler) —
  // kein eigener Request und keine geschaetzte Zahl.
  const callsState: TileState = repsQ.isLoading ? UNKNOWN : repsQ.isError ? FAILED : (() => {
    const n = reps.reduce((s, r) => s + (r.call_count || 0), 0);
    return n > 0 ? { tone: "emerald", text: `${n} erfasst` } : { tone: "muted", text: "noch keine" };
  })();

  const consentState: TileState = consentQ.isLoading ? UNKNOWN : consentQ.isError ? FAILED
    : consentQ.data?.recording_consent_enabled
      ? { tone: "emerald", text: "Ansage aktiv" }
      : { tone: "amber", text: "Ansage aus" };

  const copilotState: TileState = copilotQ.isLoading ? UNKNOWN
    : copilotNotConnected ? { tone: "muted", text: "nicht verknüpft" }
    : copilotQ.isError ? FAILED
    : (() => {
        const n = (copilotQ.data?.vertriebler ?? []).filter((v) => v.status === "active").length;
        return n > 0 ? { tone: "emerald", text: `${n} aktiv` } : { tone: "muted", text: "keine angelegt" };
      })();

  const mine = agentsQ.data?.mine ?? null;
  const agentsState: TileState = agentsQ.isLoading ? UNKNOWN : agentsQ.isError ? FAILED
    : !mine ? { tone: "muted", text: "nicht aktiviert" }
    : !mine.twilio_number ? { tone: "amber", text: "ohne Rufnummer" }
    : mine.status === "live" ? { tone: "emerald", text: "live" }
    : { tone: "amber", text: mine.status };

  const leadsState: TileState = leadsQ.isLoading ? UNKNOWN : leadsQ.isError ? FAILED : (() => {
    const lists = leadsQ.data?.lists ?? [];
    if (lists.length === 0) return { tone: "muted", text: "keine Liste" };
    const leads = lists.reduce((s, l) => s + (l.lead_count || 0), 0);
    return { tone: "emerald", text: `${lists.length} Listen · ${leads} Leads` };
  })();

  /* Fehler !== leer: scheitert einer der Status-Abrufe, sagt die Seite das —
     die Kacheln bleiben aber bedienbar, der Bereich selbst laedt eigenstaendig. */
  const statusQueries = [
    { failed: repsQ.isError, fetching: repsQ.isFetching, retry: () => { void repsQ.refetch(); } },
    { failed: consentQ.isError, fetching: consentQ.isFetching, retry: () => { void consentQ.refetch(); } },
    { failed: agentsQ.isError, fetching: agentsQ.isFetching, retry: () => { void agentsQ.refetch(); } },
    { failed: leadsQ.isError, fetching: leadsQ.isFetching, retry: () => { void leadsQ.refetch(); } },
    { failed: copilotQ.isError && !copilotNotConnected, fetching: copilotQ.isFetching, retry: () => { void copilotQ.refetch(); } },
  ];
  const anyFailed = statusQueries.some((q) => q.failed);
  const anyRetrying = statusQueries.some((q) => q.failed && q.fetching);
  const retryFailed = () => statusQueries.forEach((q) => { if (q.failed) q.retry(); });

  const tiles: {
    key: AreaKey; name: string; icon: typeof Users; state: TileState; description: string; action: string;
  }[] = [
    {
      key: "reps", name: "Vertriebler", icon: Users, state: repsState, action: "Vertriebler verwalten",
      description: "Rufnummern, Weiterleitungen und Einladungen deiner Vertriebler.",
    },
    {
      key: "calls", name: "Anrufe", icon: PhoneCall, state: callsState, action: "Anrufe prüfen",
      description: "Anruf-Audit: Ergebnis, Dauer und Notiz zu jedem Gespräch.",
    },
    {
      key: "consent", name: "DSGVO-Consent", icon: ShieldCheck, state: consentState, action: "Einstellung öffnen",
      description: "Ansage vor der Aufzeichnung — Text und Protokoll der Änderungen.",
    },
    {
      key: "copilot", name: "Co-Pilot", icon: Rocket, state: copilotState, action: "Co-Pilot öffnen",
      description: "Der Gesprächs-Assistent am Bildschirm deiner Vertriebler.",
    },
    {
      key: "agents", name: "KI-Agenten", icon: Bot, state: agentsState, action: "Agenten öffnen",
      description: "Telefon-Assistent für eingehende Anrufe und Janas Rückrufe.",
    },
    {
      key: "leads", name: "Leads", icon: ListChecks, state: leadsState, action: "Listen öffnen",
      description: "Lead-Listen hochladen und einzelnen Vertrieblern zuweisen.",
    },
  ];

  const activeTile = tiles.find((t) => t.key === tab) ?? tiles[0];

  // Statische Klassennamen: Tailwind scannt den Quelltext, ein
  // `stagger-${i}` waere im Build weggeputzt worden.
  const STAGGER = ["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5", "stagger-6"];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="System"
        title="Voice & Calls"
        subtitle="Vertriebler-Telefonie, Anruf-Audit, KI-Agenten und die DSGVO-Aufzeichnungs-Einstellungen — jeder Bereich mit seinem aktuellen Zustand."
      />

      {/* v4.156.0: Einrichtungsstand ganz oben. Blendet sich selbst aus, wenn
          kein Sprachassistent gebucht ist, und verschwindet nicht, sobald alles
          steht: "bereit" ist eine Antwort, die der Kunde sehen will. */}
      <VoiceReadinessCard onGoToNumbers={() => openArea("reps")} />

      {/* ── Kacheln: je Agent/Bereich eine Karte ─────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => openArea(t.key)}
              aria-pressed={isActive}
              className={cn(
                "glass-card-hover flex h-full flex-col p-4 text-left animate-fade-up",
                STAGGER[Math.min(i, STAGGER.length - 1)],
                isActive && "border-primary/50 bg-emerald-deep/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Dot tone={t.state.tone} pulse={t.state.tone === "amber"} className="!h-1.5 !w-1.5" />
                  {t.state.text}
                </span>
              </div>
              <p className="mt-3 text-[13.5px] font-semibold text-foreground">{t.name}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{t.description}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[11.5px] text-primary">
                {isActive ? "geöffnet" : t.action} <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {anyFailed && (
        <QueryErrorNotice
          label="Der Zustand einzelner Bereiche konnte nicht geladen werden."
          onRetry={retryFailed}
          retrying={anyRetrying}
        />
      )}

      {/* ── Geöffneter Bereich ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <p className="ue-kicker">{activeTile.name}</p>
        {tab === "reps" && <VoiceRepsTab />}
        {tab === "calls" && <SalesCallsAuditTab />}
        {tab === "consent" && <RecordingConsentTab />}
        {tab === "copilot" && <CoPilotRepsTab />}
        {tab === "agents" && <VoiceAgentsTab />}
        {tab === "leads" && <LeadUploadTab />}
      </div>
    </div>
  );
}
