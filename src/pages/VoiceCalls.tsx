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
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, PhoneCall, ShieldCheck, Rocket, Bot, ListChecks, ChevronRight, BookOpenCheck, CalendarPlus, FolderOpen } from "lucide-react";
import VoiceRepsTab from "@/components/VoiceRepsTab";
import TerminBlock from "@/components/TerminBlock";
import CoPilotRepsTab from "@/components/CoPilotRepsTab";
import CoPilotScriptsTab from "@/components/CoPilotScriptsTab";
import SalesCallsAuditTab from "@/components/SalesCallsAuditTab";
import RecordingConsentTab from "@/components/RecordingConsentTab";
import VoiceAgentsTab from "@/components/VoiceAgentsTab";
import LeadUploadTab from "@/components/LeadUploadTab";
import FaelleTab from "@/components/FaelleTab";
import { useVoiceReps, useRecordingConsent, useAgentCatalog, useLeadLists, useCopilotVertriebler, useCopilotCases } from "@/hooks/use-api";
import { ApiError, fetchCalendarReadiness } from "@/lib/api-client";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, Dot, type DotTone } from "@/components/ue/primitives";
import { VoiceReadinessCard } from "@/components/voice/VoiceReadinessCard";
import { VoiceShadowCard } from "@/components/voice/VoiceShadowCard";
import { cn } from "@/lib/utils";

// v4.195.0 (Schnitt 0d): "termin" ergaenzt — erste Stufe des Telefon-Modus.
// Der Vertriebler telefoniert weiter im Co-Piloten und traegt den Termin hier
// ein. Das Softphone bleibt, wo es ist (Schnitt E, bewusst zuletzt).
// v4.197.0 (Schnitt B): "faelle" ergaenzt — die Vorgangs-Sicht auf einen Lead.
type AreaKey = "reps" | "faelle" | "calls" | "consent" | "copilot" | "scripts" | "agents" | "leads" | "termin";
const AREAS: AreaKey[] = ["reps", "faelle", "calls", "consent", "copilot", "scripts", "agents", "leads", "termin"];
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
  // Schnitt B: nur die ZAHL fuer die Kachel, deshalb limit 1. Die Liste selbst
  // holt der Bereich mit seinen eigenen Filtern.
  const faelleQ = useCopilotCases({ status: "offen", limit: 1 });

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

  // "Kein Zugriff" ist kein Serverfehler, sondern eine Aussage: das Konto ist
  // keinem Vertriebler zugeordnet und fuehrt den Betrieb nicht.
  const faelleKeinZugriff = faelleQ.error instanceof ApiError && faelleQ.error.message === "kein_zugriff";
  const faelleState: TileState = faelleQ.isLoading ? UNKNOWN
    : faelleKeinZugriff ? { tone: "muted", text: "nicht zugeordnet" }
    : faelleQ.isError ? FAILED
    : (() => {
        const n = faelleQ.data?.gesamt ?? 0;
        return n > 0 ? { tone: "amber", text: `${n} offen` } : { tone: "emerald", text: "nichts offen" };
      })();

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
    { failed: faelleQ.isError && !faelleKeinZugriff, fetching: faelleQ.isFetching, retry: () => { void faelleQ.refetch(); } },
  ];
  const anyFailed = statusQueries.some((q) => q.failed);
  const anyRetrying = statusQueries.some((q) => q.failed && q.fetching);
  const retryFailed = () => statusQueries.forEach((q) => { if (q.failed) q.retry(); });

  // v4.195.0: Zustand der Kalender-Verbindung. Bewusst aus echten Daten wie
  // alle anderen Kacheln, statt dauerhaft "–" zu zeigen. Scheitert der Abruf,
  // sagt die Kachel das, statt "nichts vorhanden" zu behaupten.
  const [terminState, setTerminState] = useState<TileState>(UNKNOWN);
  useEffect(() => {
    let abgebrochen = false;
    void fetchCalendarReadiness()
      .then((r) => {
        if (abgebrochen) return;
        setTerminState(r.termin_moeglich
          ? { tone: "emerald", text: "Kalender verbunden" }
          : { tone: "amber", text: "Kein Kalender verbunden" });
      })
      .catch(() => { if (!abgebrochen) setTerminState(FAILED); });
    return () => { abgebrochen = true; };
  }, []);

  const tiles: {
    key: AreaKey; name: string; icon: typeof Users; state: TileState; description: string; action: string;
  }[] = [
    {
      key: "reps", name: "Vertriebler", icon: Users, state: repsState, action: "Vertriebler verwalten",
      description: "Rufnummern, Weiterleitungen und Einladungen deiner Vertriebler.",
    },
    {
      key: "faelle", name: "Fälle", icon: FolderOpen, state: faelleState, action: "Fälle öffnen",
      description: "Jeder Lead, an dem gearbeitet wurde: Status, Termin, Frist und der volle Verlauf.",
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
      key: "scripts", name: "Skripte & Einwände", icon: BookOpenCheck, state: copilotState, action: "Skripte verwalten",
      description: "Skripte und Einwände zentral pflegen, an Vertriebler geben und sehen, womit sie wirklich telefonieren.",
    },
    {
      key: "agents", name: "KI-Agenten", icon: Bot, state: agentsState, action: "Agenten öffnen",
      description: "Telefon-Assistent für eingehende Anrufe und Janas Rückrufe.",
    },
    {
      key: "leads", name: "Leads", icon: ListChecks, state: leadsState, action: "Listen öffnen",
      description: "Lead-Listen hochladen und einzelnen Vertrieblern zuweisen.",
    },
    {
      key: "termin", name: "Termin", icon: CalendarPlus, state: terminState, action: "Termin anlegen",
      description: "Aus dem im Gespräch vereinbarten Zeitpunkt einen Kalendereintrag mit Meeting-Link machen und die Einladung verschicken.",
    },
  ];

  const activeTile = tiles.find((t) => t.key === tab) ?? tiles[0];

  // Statische Klassennamen: Tailwind scannt den Quelltext, ein
  // `stagger-${i}` waere im Build weggeputzt worden.
  const STAGGER = ["stagger-1", "stagger-2", "stagger-3", "stagger-4", "stagger-5", "stagger-6", "stagger-6"];

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
      <div data-tour="voice-readiness">
        <VoiceReadinessCard onGoToNumbers={() => openArea("reps")} />
      </div>

      {/* v4.157.0: Reifegrad direkt unter der Bereitschaft. Erst "kann er
          telefonieren", dann "wie weit ist er". Blendet sich wie die Karte
          darueber selbst aus, wenn kein Sprachassistent gebucht ist. */}
      <VoiceShadowCard />

      {/* ── Kacheln: je Agent/Bereich eine Karte ─────────────────────────── */}
      {/* data-tour: Ziel des gefuehrten Durchlaufs "voice-jana" (06.08.2026). */}
      <div data-tour="voice-tiles" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        {tab === "faelle" && <FaelleTab />}
        {tab === "calls" && <SalesCallsAuditTab />}
        {tab === "consent" && <RecordingConsentTab />}
        {tab === "copilot" && <CoPilotRepsTab />}
        {tab === "scripts" && <CoPilotScriptsTab />}
        {tab === "agents" && <VoiceAgentsTab />}
        {tab === "leads" && <LeadUploadTab />}
        {tab === "termin" && <TerminBlock />}
      </div>
    </div>
  );
}
