import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useMe, useDisconnectMailbox } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ExternalLink, AlertTriangle, Mail, Settings, BookOpen, Plug, FileSpreadsheet, Phone,
  CreditCard, ShieldCheck, Unplug, Brain, Archive, MapPin, Lock, PenLine,
} from "lucide-react";
// Umbau 2026-07-27: Mitarbeiter (TeamTab) ist eine eigene Seite (/mitarbeiter);
// ?tab=team leitet unten dorthin um.
import { ChipDomainInput } from "@/components/ChipDomainInput";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, Chip, EmptyState, Dot, type DotTone } from "@/components/ue/primitives";
import { type MailboxHealth, formatLimit, isUnlimitedLimit } from "@/lib/api-client";
import KnowledgeBaseTab from "@/components/KnowledgeBaseTab";
import JanaKnowledgeTab from "@/components/JanaKnowledgeTab";
import HubSpotIntegration from "@/components/HubSpotIntegration";
import MicrosoftIntegration from "@/components/MicrosoftIntegration";
import MailboxReconnectCard from "@/components/MailboxReconnectCard";
import TelegramIntegration from "@/components/TelegramIntegration";
import DhlTrackingCard from "@/components/DhlTrackingCard"; // v4.116.0 — Per-Tenant-DHL-Key
import AssistantConfigCard from "@/components/AssistantConfigCard";
import TenantSetupSelfCard from "@/components/TenantSetupSelfCard";
import WebsiteScanCard from "@/components/WebsiteScanCard"; // v4.160.0: Website-Scan (Briefing C)
import SpreadsheetConfigTab from "@/components/SpreadsheetConfigTab";
import SecurityMfaCard from "@/components/SecurityMfaCard";
import JanaAutopilotTab from "@/components/JanaAutopilotTab";
import EmailAutopilotTab from "@/components/EmailAutopilotTab";
import EmailAutopilotAuditView from "@/components/EmailAutopilotAuditView";
import StichprobenAuditTab from "@/components/StichprobenAuditTab";
import BillingTab from "@/components/BillingTab";
import AiTransparencyTab from "@/components/AiTransparencyTab";
import AutoOfferSettingsCard from "@/components/AutoOfferSettingsCard"; // v4.130.0
import DunningSettingsCard from "@/components/DunningSettingsCard"; // v4.134.0
import PriceListsCard from "@/components/PriceListsCard"; // v4.130.0

/* Einstellungen — Redesign 27.07.2026.

   Umgebaut auf das Console-Design-System (PageHeader/SectionCard/Chip/Dot/EmptyState).
   Die Struktur bleibt identisch: dieselben Tabs, dieselben Tab-Werte, dieselben
   Deep-Links (?tab=…), dieselben Unter-Komponenten. Neu ist nur die Hülle plus
   die Karte "Aufbewahrung & DSGVO" im Tab KI-Transparenz (Briefing) — statisch
   und ohne Server-Zahlen, weil hier nichts behauptet werden darf, was die Console
   nicht belegen kann.

   Der eigene max-w-Container ist entfallen: die Breite macht das AppLayout. */

function useLocalState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState];
}

// v4.102.0: Anzeigename je Provider fuer die serverseitige Postfach-Liste.
const PROVIDER_LABEL: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Microsoft 365",
};

// v4.102.0: Postfach-Status-Chip. Semantik gespiegelt aus MailboxReconnectCard
// (Poller-Health aus mailbox_health[]): ok = verbunden/aktueller Abruf, stale = kein
// aktueller Abruf, error = Verbindungsfehler, unknown = verbunden (kein Poller-Signal).
// 2026-07-27: Punkt kommt jetzt aus <Dot> (Token-Farben) statt aus bg-emerald-500 & Co.
const MAILBOX_STATUS: Record<MailboxHealth["status"], { tone: DotTone; label: string }> = {
  ok: { tone: "emerald", label: "verbunden" },
  unknown: { tone: "emerald", label: "verbunden" },
  stale: { tone: "amber", label: "kein aktueller Abruf" },
  error: { tone: "danger", label: "Verbindungsfehler" },
};

function MailboxStatusBadge({ status }: { status: MailboxHealth["status"] }) {
  const { tone, label } = MAILBOX_STATUS[status] ?? MAILBOX_STATUS.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <Dot tone={tone} pulse={tone !== "emerald"} />
      {label}
    </span>
  );
}

// Schalter im Entwurfs-Look. Bewusst auf Modul-Ebene: als Inline-Komponente wurde er
// bei jedem Render neu erzeugt und damit unnoetig neu gemountet.
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${checked ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

// Freigabe-Regeln: fruehere `any`-Zugriffe sauber typisiert — die Schluessel sind
// bekannt und endlich, ein Cast ist dafuer nicht noetig.
const APPROVAL_RULES = [
  { key: "legalDsgvo", label: "Legal / DSGVO", desc: "E-Mails mit rechtlichem Inhalt" },
  { key: "bankdaten", label: "Bankdatenänderung", desc: "Änderung von Kontodaten" },
  { key: "mahnung", label: "Mahnung / Zahlungsrückstand", desc: "Zahlungsbezogene Inhalte" },
  { key: "externeEmpfaenger", label: "Externe Empfänger", desc: "E-Mails an externe Domains" },
  { key: "anhaenge", label: "Anhänge", desc: "E-Mails mit Dateianhängen" },
] as const;

type ApprovalRuleKey = (typeof APPROVAL_RULES)[number]["key"];
type ApprovalRules = Record<ApprovalRuleKey, boolean> & { betragThreshold: string };

export default function Einstellungen() {
  const { user } = useAuth();
  // 2026-07-27: isError/refetch mitnehmen — ein /me-Fehler darf nicht wie
  // "kein Postfach verbunden" bzw. "Plan 0 / 0" aussehen (Fehler ≠ leer).
  const { data: me, isLoading, isError, isSuccess, refetch, isFetching } = useMe();

  const tenant = me?.tenant;
  const plan = me?.plan;
  const isActive = tenant && tenant.status !== "not_onboarded";

  const userEmail = user?.email ?? "";
  const userId = user?.id ?? "anon";

  const [approvalRules, setApprovalRules] = useLocalState<ApprovalRules>(
    `ue_approval_${userId}`,
    {
      // Sensible Standard-Absicherung: rechtlich/finanziell heikle Kategorien
      // erfordern per Default eine manuelle Freigabe (deckt sich mit den
      // Autopilot-Hard-Locks). Optionale Kategorien bleiben aus.
      legalDsgvo: true,
      bankdaten: true,
      mahnung: true,
      externeEmpfaenger: false,
      anhaenge: false,
      betragThreshold: "500",
    }
  );

  const [allowDomains, setAllowDomains] = useLocalState<string[]>(`ue_allow_domains_${userId}`, []);
  const [blockDomains, setBlockDomains] = useLocalState<string[]>(`ue_block_domains_${userId}`, []);
  const [businessHours, setBusinessHours] = useLocalState(`ue_hours_${userId}`, { start: "08:00", end: "18:00" });
  const [slaTarget, setSlaTarget] = useLocalState(`ue_sla_${userId}`, "95");

  // v4.102.0: Postfach-Anzeige serverseitig ableiten (identische Wahrheit wie die Topbar)
  // statt aus leerem localStorage. plan.active_mailboxes ist backendseitig auf Postfach-
  // Ebene dedupliziert (ein Postfach mit mehreren Credential-Rows zaehlt EINMAL);
  // mailbox_health[] liefert pro verbundenem Postfach Adresse + Poller-Status. Fallback
  // auf die Tenant-Flags, falls die Poller-Health-Migration (noch) fehlt (mailbox_health=[]).
  const mailboxLimit = plan?.mailbox_limit ?? 0;
  const activeMailboxes = plan?.active_mailboxes ?? 0;

  // v4.103.0 — Mailbox-Governance: Postfach trennen (Inline-Confirm statt Dialog)
  // + 30-Tage-Swap-Lock-Anzeige aus /me (plan.mailbox_swap). Der Wechsel-Schutz
  // selbst wird serverseitig im OAuth-Callback erzwungen; hier nur Transparenz.
  const disconnectMb = useDisconnectMailbox();
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const mailboxSwap = plan?.mailbox_swap;

  const handleDisconnect = (email: string) => {
    disconnectMb.mutate(email, {
      onSuccess: (r) => {
        setConfirmDisconnect(null);
        const lockHint = r.swap?.locked && r.swap.next_swap_possible_at
          ? ` Ein Wechsel zu einem neuen Postfach ist ab dem ${new Date(r.swap.next_swap_possible_at).toLocaleDateString("de-DE")} möglich.`
          : "";
        toast.success("Postfach getrennt", {
          description: `UseEasy verwaltet dieses Postfach ab sofort nicht mehr.${lockHint}`,
        });
      },
      onError: (e) => {
        setConfirmDisconnect(null);
        toast.error("Trennen fehlgeschlagen", {
          description: e instanceof Error ? e.message : "Unbekannter Fehler. Bitte support@useeasy.ai kontaktieren.",
        });
      },
    });
  };

  const mailboxHealth = (me?.mailbox_health ?? []) as MailboxHealth[];
  const connectedMailboxes: Array<{ provider: string; email: string | null; status: MailboxHealth["status"] }> = (
    mailboxHealth.length > 0
      ? mailboxHealth.map((h) => ({ provider: h.provider, email: h.email, status: h.status }))
      : ([
          tenant?.gmail_enabled ? { provider: "gmail", email: userEmail || null, status: "unknown" as const } : null,
          tenant?.outlook_enabled ? { provider: "outlook", email: userEmail || null, status: "unknown" as const } : null,
        ].filter((m): m is { provider: string; email: string | null; status: "unknown" } => m !== null))
  ).filter(
    (m, i, arr) =>
      arr.findIndex(
        (x) => (x.email || x.provider).toLowerCase() === (m.email || m.provider).toLowerCase(),
      ) === i,
  );

  // v4.153.0 — "unbegrenzt" kommt vom Server (-1 bzw. das *_unlimited-Boolean)
  // und wird hier nicht mehr nachgerechnet. Betrifft die Postfaecher im
  // Team-Paket und das Mail-Kontingent bei Enterprise.
  const limitItems = [
    {
      label: "Mailboxen",
      used: plan?.active_mailboxes ?? 0,
      limit: plan?.mailbox_limit ?? 0,
      unlimited: isUnlimitedLimit(plan?.mailbox_limit, plan?.mailbox_unlimited),
    },
    {
      label: "E-Mails / Monat",
      used: plan?.emails_used ?? 0,
      limit: plan?.email_limit ?? 0,
      unlimited: isUnlimitedLimit(plan?.email_limit, plan?.email_unlimited),
    },
    {
      label: "Entwürfe / Monat",
      used: plan?.drafts_used ?? 0,
      limit: plan?.draft_limit ?? 0,
      unlimited: isUnlimitedLimit(plan?.draft_limit, plan?.draft_unlimited),
    },
  ];

  // Redesign Follow-up: Untersektion des verschmolzenen Email-Autopilot-Bereichs.
  const [apSection, setApSection] = useState<"reife" | "audit" | "samples">(() => {
    if (typeof window === "undefined") return "reife";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "email-autopilot-audit") return "audit";
    if (t === "email-autopilot-samples") return "samples";
    return "reife";
  });

  const initialTab = (() => {
    if (typeof window === "undefined") return "general";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "excel") return "spreadsheet"; // Chrome-Extension Deep-Link Alias (?tab=excel)
    if (t === "jana" || t === "autopilot") return "autopilot"; // Phase 3C alias
    // Redesign Follow-up: die frueheren Einzel-Tabs Audit/Stichproben leben als
    // Untersektionen im verschmolzenen Email-Autopilot-Bereich weiter.
    if (t === "email-autopilot-audit" || t === "email-autopilot-samples") return "email-autopilot";
    return t === "knowledge" || t === "jana-wissen" || t === "integrations" || t === "spreadsheet" || t === "autopilot" || t === "billing" || t === "email-autopilot" || t === "ki-transparenz" ? t : "general";
  })();

  // Umbau 2026-07-27: der fruehere Mitarbeiter-Tab ist jetzt /mitarbeiter.
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "team") {
    return <Navigate to="/mitarbeiter" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="System"
        title="Einstellungen"
        subtitle="Postfächer, Freigabe-Regeln, Wissen und Konto — alles, was UseEasy für deinen Betrieb konfiguriert."
      />

      <Tabs defaultValue={initialTab} className="w-full md:grid md:grid-cols-[230px_minmax(0,1fr)] md:gap-6 md:items-start">
        {/* Redesign 07.07.2026: vertikale Navigation in 4 Gruppen statt 11 horizontaler Tabs.
            Tab-Werte und Deep-Links (?tab=…) bleiben identisch. */}
        <TabsList className="md:sticky md:top-20 w-full !flex flex-col !h-auto items-stretch justify-start gap-0.5 bg-card border border-border rounded-[var(--radius)] p-2 mb-6 md:mb-0">
          <div className="ue-kicker px-3 pt-3 pb-1.5">Postfächer &amp; Konto</div>
          <TabsTrigger value="general" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <Settings className="w-3.5 h-3.5" />
            Allgemein &amp; Postfächer
          </TabsTrigger>
          <div className="ue-kicker px-3 pt-3 pb-1.5">Autopilot</div>
          <TabsTrigger value="email-autopilot" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <Mail className="w-3.5 h-3.5" />
            Email-Autopilot
          </TabsTrigger>
          <TabsTrigger value="autopilot" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <Phone className="w-3.5 h-3.5" />
            Jana Voice
          </TabsTrigger>
          <div className="ue-kicker px-3 pt-3 pb-1.5">Wissen &amp; Daten</div>
          <TabsTrigger value="jana-wissen" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <Brain className="w-3.5 h-3.5" />
            Jana-Wissen
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <BookOpen className="w-3.5 h-3.5" />
            Unternehmenswissen
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Live-Sync
          </TabsTrigger>
          <TabsTrigger value="integrations" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <Plug className="w-3.5 h-3.5" />
            Integrationen
          </TabsTrigger>
          <div className="ue-kicker px-3 pt-3 pb-1.5">Konto</div>
          <TabsTrigger value="billing" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <CreditCard className="w-3.5 h-3.5" />
            Abo &amp; Zusatz
          </TabsTrigger>
          <TabsTrigger value="ki-transparenz" className="justify-start gap-2 rounded-lg px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-emerald-surface/60 data-[state=active]:text-emerald-light data-[state=active]:shadow-none">
            <ShieldCheck className="w-3.5 h-3.5" />
            KI-Transparenz
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0">

        <TabsContent value="general" className="space-y-6 mt-0">
          {/* v4.160.0 (Briefing C): Website-Scan sichtbar machen. Bewusst ganz
              oben: der Scan laeuft beim Onboarding automatisch, und der Kunde
              soll sofort sehen, was daraus geworden ist bzw. was noch fehlt. */}
          <WebsiteScanCard />
          {/* v4.130.0 — Auto-Angebot-Toggle (rendert nur wenn documents_enabled) */}
          <AutoOfferSettingsCard />
          {/* v4.134.0 — Automatische Zahlungserinnerungen / Mahn-Zyklus (rendert nur wenn documents_enabled) */}
          <DunningSettingsCard />

          <SectionCard
            title="Verbundene Postfächer"
            subtitle="UseEasy liest und entwirft je Postfach — gesendet wird nie ohne dich."
            action={
              /* 2026-07-27: der Zaehler stand ausserhalb des isError-Guards. Bei
                 kaputtem /me behauptete "0 / 0 verbunden" direkt UEBER der
                 Fehlermeldung, es sei nichts verbunden — eine erfundene Zahl aus
                 `?? 0`. Zahl nur bei erfolgreicher Query, sonst gar nichts. */
              isSuccess ? (
                <span className="text-[11.5px] text-muted-foreground">
                  <span className="tabular">{activeMailboxes}</span> / <span className="tabular">{mailboxLimit}</span> verbunden
                </span>
              ) : null
            }
            bodyClassName="p-4 space-y-3"
          >
            {mailboxLimit > 0 && activeMailboxes > mailboxLimit && (
              <div className="flex items-center gap-2 rounded-md border border-amber/25 bg-amber-surface px-3 py-2 text-[12px] text-amber">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Mehr Postfächer verbunden als der Plan erlaubt. Plan upgraden für mehr Mailboxen.
              </div>
            )}
            {mailboxSwap?.locked && mailboxSwap.next_swap_possible_at && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Postfach-Wechsel gesperrt bis zum {new Date(mailboxSwap.next_swap_possible_at).toLocaleDateString("de-DE")} (ein Wechsel pro Monat). Früher wechseln? Ticket an support@useeasy.ai.
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : isError ? (
              <QueryErrorNotice
                label="Die Postfach-Liste konnte nicht geladen werden."
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            ) : connectedMailboxes.length > 0 ? (
              <ul className="divide-y divide-line-soft">
                {connectedMailboxes.map((mb) => (
                  <li key={`${mb.provider}:${mb.email ?? ""}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{mb.email ?? (PROVIDER_LABEL[mb.provider] ?? mb.provider)}</p>
                      <p className="text-[11.5px] text-muted-foreground">{PROVIDER_LABEL[mb.provider] ?? mb.provider}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <MailboxStatusBadge status={mb.status} />
                      {mb.email && (
                        confirmDisconnect === mb.email ? (
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDisconnect(mb.email!)}
                              disabled={disconnectMb.isPending}
                              className="text-[11.5px] font-medium text-danger hover:underline disabled:opacity-50"
                            >
                              {disconnectMb.isPending ? "Trenne …" : "Wirklich trennen"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDisconnect(null)}
                              disabled={disconnectMb.isPending}
                              className="text-[11.5px] text-muted-foreground hover:underline disabled:opacity-50"
                            >
                              Abbrechen
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDisconnect(mb.email!)}
                            className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-danger"
                            title="Postfach von UseEasy trennen (E-Mails bleiben unberührt)"
                          >
                            <Unplug className="w-3.5 h-3.5" /> Trennen
                          </button>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : activeMailboxes > 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                <span className="tabular">{activeMailboxes}</span> Postfach{activeMailboxes === 1 ? "" : "er"} verbunden.
              </p>
            ) : (
              <EmptyState
                icon={<Mail className="h-7 w-7" />}
                title="Noch kein Postfach verbunden"
                description={userEmail ? `Angemeldet als ${userEmail}. Verbinde Gmail oder Outlook, damit UseEasy loslegen kann.` : "Verbinde Gmail oder Outlook, damit UseEasy loslegen kann."}
                action={
                  <a
                    href="/einstellungen?tab=integrations"
                    className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Plug className="w-3.5 h-3.5" /> Postfach verbinden
                  </a>
                }
              />
            )}
          </SectionCard>

          <SectionCard
            title="Freigabe-Regeln"
            subtitle="Bestimme, welche E-Mails eine manuelle Freigabe erfordern."
          >
            <div className="divide-y divide-line-soft">
              {APPROVAL_RULES.map((rule) => (
                <div key={rule.key} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{rule.label}</p>
                    <p className="text-[11.5px] text-muted-foreground">{rule.desc}</p>
                  </div>
                  <Toggle
                    label={rule.label}
                    checked={approvalRules[rule.key]}
                    onChange={() => setApprovalRules((prev) => ({ ...prev, [rule.key]: !prev[rule.key] }))}
                  />
                </div>
              ))}
              <div className="pt-3">
                <label htmlFor="betrag-schwelle" className="text-[13px] font-medium">Betrag-Schwelle</label>
                <p className="mb-2 text-[11.5px] text-muted-foreground">Freigabe erforderlich ab diesem Betrag.</p>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">Betrag &gt;</span>
                  <input
                    id="betrag-schwelle"
                    type="number"
                    value={approvalRules.betragThreshold}
                    onChange={(e) => setApprovalRules((prev) => ({ ...prev, betragThreshold: e.target.value }))}
                    className="ue-input tabular w-28"
                  />
                  <span className="text-[13px] text-muted-foreground">€</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Domain-Listen"
            subtitle="Absender-Domains, die UseEasy immer bzw. nie automatisch behandeln darf."
          >
            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-medium">Erlaubte Domains</label>
                <div className="mt-1.5">
                  <ChipDomainInput domains={allowDomains} onChange={setAllowDomains} />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium">Blockierte Domains</label>
                <div className="mt-1.5">
                  <ChipDomainInput domains={blockDomains} onChange={setBlockDomains} />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Geschäftszeiten & SLA"
            subtitle="Innerhalb dieser Zeiten misst UseEasy die Reaktionszeit."
          >
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="hours-start" className="text-[11.5px] text-muted-foreground">Von</label>
                <input
                  id="hours-start"
                  type="time"
                  value={businessHours.start}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))}
                  className="ue-input tabular mt-1 w-36"
                />
              </div>
              <div>
                <label htmlFor="hours-end" className="text-[11.5px] text-muted-foreground">Bis</label>
                <input
                  id="hours-end"
                  type="time"
                  value={businessHours.end}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))}
                  className="ue-input tabular mt-1 w-36"
                />
              </div>
              <div>
                <label htmlFor="sla-target" className="text-[11.5px] text-muted-foreground">SLA-Ziel</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    id="sla-target"
                    type="number"
                    value={slaTarget}
                    onChange={(e) => setSlaTarget(e.target.value)}
                    className="ue-input tabular w-20"
                  />
                  <span className="text-[13px] text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Plan & Limits"
            subtitle="Verbrauch des laufenden Monats laut Server."
          >
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : isError ? (
              /* Fehler ≠ leer: ohne /me stünde hier sonst überall "0 / 0". */
              <QueryErrorNotice
                label="Plan und Limits konnten nicht geladen werden."
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            ) : (
              <div className="space-y-3">
                {limitItems.map((item) => {
                  const pct = item.limit > 0 ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
                  return (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="tabular font-medium">
                          {item.unlimited
                            ? `${item.used} · unbegrenzt`
                            : `${item.used} / ${formatLimit(item.limit)}`}
                        </span>
                      </div>
                      {/* Kein Fortschrittsbalken bei unbegrenzt — er wird nie voll. */}
                      {!item.unlimited && <Progress value={pct} className="h-2" />}
                    </div>
                  );
                })}
              </div>
            )}
            <a
              href="https://useeasy.ai/pricing"
              className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {isActive ? "Plan upgraden" : "Plan aktivieren"}
            </a>
          </SectionCard>

          <SecurityMfaCard />
        </TabsContent>

        <TabsContent value="jana-wissen" data-tour="jana-wissen-tab" className="mt-0">
          <JanaKnowledgeTab />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-0 space-y-6">
          {/* v4.130.0 — Preislisten dort, wo Leon sie erwartet (Unternehmenswissen) */}
          <PriceListsCard />
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="spreadsheet" data-tour="excel-tab" className="mt-0">
          <SpreadsheetConfigTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-0 space-y-6">
          <MailboxReconnectCard />
          <MicrosoftIntegration />
          <HubSpotIntegration />
          <TelegramIntegration />
          <DhlTrackingCard />
          <AssistantConfigCard />
          <TenantSetupSelfCard />
        </TabsContent>

        <TabsContent value="email-autopilot" data-tour="email-autopilot-tab" className="mt-0 space-y-6">
          {/* Redesign Follow-up: EIN Autopilot-Bereich mit Untersektionen statt drei Tabs.
              Deep-Links ?tab=email-autopilot-audit / -samples landen hier in der passenden Sektion. */}
          <div className="flex flex-wrap gap-1.5">
            {([["reife", "Stufen & Reife"], ["audit", "Audit"], ["samples", "Stichproben (nachträglich prüfen)"]] as const).map(([k, l]) => (
              <Chip key={k} active={apSection === k} onClick={() => setApSection(k)}>
                {l}
              </Chip>
            ))}
          </div>
          {apSection === "reife" && <EmailAutopilotTab />}
          {apSection === "audit" && <EmailAutopilotAuditView />}
          {apSection === "samples" && <StichprobenAuditTab />}
        </TabsContent>

        <TabsContent value="autopilot" className="mt-0 space-y-6">
          <JanaAutopilotTab />
        </TabsContent>

        <TabsContent value="billing" className="mt-0 space-y-6">
          <BillingTab />
        </TabsContent>

        <TabsContent value="ki-transparenz" className="mt-0 space-y-6">
          {/* Briefing 27.07.2026 — "Aufbewahrung & DSGVO" steht bewusst GANZ OBEN im
              Transparenz-Bereich: es ist die Antwort auf die erste Frage, die ein
              Handwerks- oder Hausverwaltungsbetrieb zu einer KI im Postfach stellt.
              Alle vier Aussagen sind vertraglich/architektonisch feste Rahmenbedingungen
              und deshalb statisch. Bewusst OHNE Zertifikats-Versprechen und ohne Zahlen
              vom Server — was die Console nicht belegen kann, behauptet sie nicht. */}
          <RetentionPrivacyCard />
          <AiTransparencyTab />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ── Aufbewahrung & DSGVO ────────────────────────────────────────────────────
   Reine Erklaerkarte. Kein Query, kein State — daher auch kein QueryErrorNotice:
   hier kann nichts fehlschlagen und nichts veralten. */
function RetentionPrivacyCard() {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Aufbewahrung &amp; DSGVO
        </span>
      }
      subtitle="Wie lange deine Daten liegen, wo sie liegen und was UseEasy mit ihnen tut."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ue-surface p-3.5">
            <p className="ue-kicker flex items-center gap-1.5">
              <Archive className="h-3 w-3" /> Aufbewahrung
            </p>
            <p className="mt-2 text-[22px] font-semibold leading-none">
              <span className="tabular">6</span>
              <span className="ml-1.5 text-base font-medium text-muted-foreground">Jahre</span>
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              Handels- und steuerrechtliche Aufbewahrungsfrist.
            </p>
          </div>
          <div className="ue-surface p-3.5">
            <p className="ue-kicker flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Hosting &amp; Verarbeitung
            </p>
            <p className="mt-2 text-[15px] font-semibold leading-tight">EU · Frankfurt</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              Region eu-central-1.
            </p>
          </div>
        </div>

        <ul className="space-y-3">
          <li className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-medium text-foreground">Mail-Inhalte bleiben im Haus.</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                Vor der KI-Verarbeitung werden personenbezogene Daten pseudonymisiert
                beziehungsweise auf das Nötige minimiert.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-[13px] font-medium text-foreground">Nur Entwürfe, nie Versand.</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                UseEasy erstellt ausschließlich Entwürfe. Es wird nichts versendet, gebucht
                oder gemeldet, bevor du freigibst.
              </p>
            </div>
          </li>
        </ul>

        <p className="text-[11.5px] leading-relaxed text-tx-weak">
          Fragen zu Auftragsverarbeitung, Löschung oder Auskunft beantwortet
          support@useeasy.ai.
        </p>
      </div>
    </SectionCard>
  );
}
