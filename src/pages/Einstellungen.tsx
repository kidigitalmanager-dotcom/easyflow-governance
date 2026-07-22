import { useState, useEffect } from "react";
import { useMe, useDisconnectMailbox } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ExternalLink, AlertTriangle, Mail, Settings, BookOpen, Plug, FileSpreadsheet, Phone, CreditCard, ShieldCheck, Unplug, Brain, Users } from "lucide-react";
import { TeamTab } from "@/components/TeamTab"; // v4.132.0 — Zeiterfassung: Mitarbeiter + Stundensätze
import { ChipDomainInput } from "@/components/ChipDomainInput";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type MailboxHealth } from "@/lib/api-client";
import KnowledgeBaseTab from "@/components/KnowledgeBaseTab";
import JanaKnowledgeTab from "@/components/JanaKnowledgeTab";
import HubSpotIntegration from "@/components/HubSpotIntegration";
import MicrosoftIntegration from "@/components/MicrosoftIntegration";
import MailboxReconnectCard from "@/components/MailboxReconnectCard";
import TelegramIntegration from "@/components/TelegramIntegration";
import DhlTrackingCard from "@/components/DhlTrackingCard"; // v4.116.0 — Per-Tenant-DHL-Key
import AssistantConfigCard from "@/components/AssistantConfigCard";
import TenantSetupSelfCard from "@/components/TenantSetupSelfCard";
import SpreadsheetConfigTab from "@/components/SpreadsheetConfigTab";
import SecurityMfaCard from "@/components/SecurityMfaCard";
import JanaAutopilotTab from "@/components/JanaAutopilotTab";
import EmailAutopilotTab from "@/components/EmailAutopilotTab";
import EmailAutopilotAuditView from "@/components/EmailAutopilotAuditView";
import StichprobenAuditTab from "@/components/StichprobenAuditTab";
import BillingTab from "@/components/BillingTab";
import AiTransparencyTab from "@/components/AiTransparencyTab";
import AutoOfferSettingsCard from "@/components/AutoOfferSettingsCard"; // v4.130.0
import PriceListsCard from "@/components/PriceListsCard"; // v4.130.0

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
function MailboxStatusBadge({ status }: { status: MailboxHealth["status"] }) {
  const map: Record<MailboxHealth["status"], { dot: string; label: string }> = {
    ok: { dot: "bg-emerald-500", label: "verbunden" },
    unknown: { dot: "bg-emerald-500", label: "verbunden" },
    stale: { dot: "bg-amber-500", label: "kein aktueller Abruf" },
    error: { dot: "bg-destructive", label: "Verbindungsfehler" },
  };
  const { dot, label } = map[status] ?? map.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

export default function Einstellungen() {
  const { user } = useAuth();
  const { data: me, isLoading } = useMe();

  const tenant = me?.tenant;
  const plan = me?.plan;
  const isActive = tenant && tenant.status !== "not_onboarded";

  const userEmail = user?.email ?? "";
  const userId = user?.id ?? "anon";

  const [approvalRules, setApprovalRules] = useLocalState(
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );

  const limitItems = [
    { label: "Mailboxen", used: plan?.active_mailboxes ?? 0, limit: plan?.mailbox_limit ?? 0 },
    { label: "E-Mails / Monat", used: plan?.emails_used ?? 0, limit: plan?.email_limit ?? 0 },
    { label: "Entwürfe / Monat", used: plan?.drafts_used ?? 0, limit: plan?.draft_limit ?? 0 },
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
    return t === "knowledge" || t === "jana-wissen" || t === "integrations" || t === "spreadsheet" || t === "autopilot" || t === "billing" || t === "email-autopilot" || t === "ki-transparenz" || t === "team" ? t : "general";
  })();

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">UseEasy-Konfiguration für deine Mailboxen.</p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full md:grid md:grid-cols-[230px_minmax(0,1fr)] md:gap-6 md:items-start">
        {/* Redesign 07.07.2026: vertikale Navigation in 4 Gruppen statt 11 horizontaler Tabs.
            Tab-Werte und Deep-Links (?tab=…) bleiben identisch. */}
        <TabsList className="md:sticky md:top-20 w-full !flex flex-col !h-auto items-stretch justify-start gap-0.5 bg-card border border-border rounded-2xl p-2 mb-6 md:mb-0">
          <div className="px-3 pt-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/60">Postfächer &amp; Konto</div>
          <TabsTrigger value="general" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Settings className="w-3.5 h-3.5" />
            Allgemein &amp; Postfächer
          </TabsTrigger>
          <TabsTrigger value="team" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Users className="w-3.5 h-3.5" />
            Team
          </TabsTrigger>
          <div className="px-3 pt-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/60">Autopilot</div>
          <TabsTrigger value="email-autopilot" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Mail className="w-3.5 h-3.5" />
            Email-Autopilot
          </TabsTrigger>
          <TabsTrigger value="autopilot" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Phone className="w-3.5 h-3.5" />
            Jana Voice
          </TabsTrigger>
          <div className="px-3 pt-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/60">Wissen &amp; Daten</div>
          <TabsTrigger value="jana-wissen" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Brain className="w-3.5 h-3.5" />
            Jana-Wissen
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <BookOpen className="w-3.5 h-3.5" />
            Unternehmenswissen
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Live-Sync
          </TabsTrigger>
          <TabsTrigger value="integrations" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <Plug className="w-3.5 h-3.5" />
            Integrationen
          </TabsTrigger>
          <div className="px-3 pt-3 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/60">Konto</div>
          <TabsTrigger value="billing" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <CreditCard className="w-3.5 h-3.5" />
            Abo &amp; Zusatz
          </TabsTrigger>
          <TabsTrigger value="ki-transparenz" className="justify-start gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
            <ShieldCheck className="w-3.5 h-3.5" />
            KI-Transparenz
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0">

        <TabsContent value="team" className="space-y-8 mt-6">
          {/* v4.132.0 — Zeiterfassung: Mitarbeiter-Logins + Stundensätze */}
          <TeamTab />
        </TabsContent>

        <TabsContent value="general" className="space-y-8 mt-6">
          {/* v4.130.0 — Auto-Angebot-Toggle (rendert nur wenn documents_enabled) */}
          <AutoOfferSettingsCard />
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">UseEasy pro Mailbox</h2>
              <span className="text-xs text-muted-foreground">
                {activeMailboxes} / {mailboxLimit} verbunden
              </span>
            </div>
            {mailboxLimit > 0 && activeMailboxes > mailboxLimit && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Mehr Postfächer verbunden als der Plan erlaubt. Plan upgraden für mehr Mailboxen.
              </div>
            )}
            {mailboxSwap?.locked && mailboxSwap.next_swap_possible_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Postfach-Wechsel gesperrt bis zum {new Date(mailboxSwap.next_swap_possible_at).toLocaleDateString("de-DE")} (ein Wechsel pro Monat). Früher wechseln? Ticket an support@useeasy.ai.
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : connectedMailboxes.length > 0 ? (
              connectedMailboxes.map((mb) => (
                <div key={`${mb.provider}:${mb.email ?? ""}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{mb.email ?? (PROVIDER_LABEL[mb.provider] ?? mb.provider)}</p>
                    <p className="text-xs text-muted-foreground">{PROVIDER_LABEL[mb.provider] ?? mb.provider}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <MailboxStatusBadge status={mb.status} />
                    {mb.email && (
                      confirmDisconnect === mb.email ? (
                        <span className="flex items-center gap-2">
                          <button
                            onClick={() => handleDisconnect(mb.email!)}
                            disabled={disconnectMb.isPending}
                            className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                          >
                            {disconnectMb.isPending ? "Trenne …" : "Wirklich trennen"}
                          </button>
                          <button
                            onClick={() => setConfirmDisconnect(null)}
                            disabled={disconnectMb.isPending}
                            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                          >
                            Abbrechen
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDisconnect(mb.email!)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                          title="Postfach von UseEasy trennen (E-Mails bleiben unberührt)"
                        >
                          <Unplug className="w-3.5 h-3.5" /> Trennen
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))
            ) : activeMailboxes > 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {activeMailboxes} Postfach{activeMailboxes === 1 ? "" : "er"} verbunden.
              </p>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Mail className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Noch keine Mailbox verbunden</p>
                {userEmail && (
                  <p className="text-xs text-muted-foreground/70">Angemeldet als {userEmail}</p>
                )}
                <a
                  href="/einstellungen?tab=integrations"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plug className="w-3.5 h-3.5" /> Mailbox verbinden
                </a>
              </div>
            )}
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Freigabe-Regeln</h2>
            <p className="text-xs text-muted-foreground">Bestimme, welche E-Mails eine manuelle Freigabe erfordern.</p>
            <div className="space-y-3">
              {[
                { key: "legalDsgvo", label: "Legal / DSGVO", desc: "E-Mails mit rechtlichem Inhalt" },
                { key: "bankdaten", label: "Bankdatenänderung", desc: "Änderung von Kontodaten" },
                { key: "mahnung", label: "Mahnung / Zahlungsrückstand", desc: "Zahlungsbezogene Inhalte" },
                { key: "externeEmpfaenger", label: "Externe Empfänger", desc: "E-Mails an externe Domains" },
                { key: "anhaenge", label: "Anhänge", desc: "E-Mails mit Dateianhängen" },
              ].map((rule) => (
                <div key={rule.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{rule.label}</p>
                    <p className="text-xs text-muted-foreground">{rule.desc}</p>
                  </div>
                  <Toggle
                    checked={(approvalRules as any)[rule.key]}
                    onChange={() => setApprovalRules(prev => ({ ...prev, [rule.key]: !(prev as any)[rule.key] }))}
                  />
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <label className="text-sm font-medium">Betrag-Schwelle</label>
                <p className="text-xs text-muted-foreground mb-2">Freigabe erforderlich ab diesem Betrag.</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Betrag &gt;</span>
                  <input
                    type="number"
                    value={approvalRules.betragThreshold}
                    onChange={(e) => setApprovalRules(prev => ({ ...prev, betragThreshold: e.target.value }))}
                    className="w-24 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                  />
                  <span className="text-sm text-muted-foreground">€</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Domain-Listen</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Erlaubte Domains</label>
                <div className="mt-1">
                  <ChipDomainInput domains={allowDomains} onChange={setAllowDomains} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Blockierte Domains</label>
                <div className="mt-1">
                  <ChipDomainInput domains={blockDomains} onChange={setBlockDomains} />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Geschäftszeiten & SLA</h2>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Von</label>
                <input
                  type="time"
                  value={businessHours.start}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))}
                  className="block mt-1 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Bis</label>
                <input
                  type="time"
                  value={businessHours.end}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))}
                  className="block mt-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">SLA-Ziel</label>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    value={slaTarget}
                    onChange={(e) => setSlaTarget(e.target.value)}
                    className="w-16 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-base font-semibold">Plan & Limits</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {limitItems.map((item) => {
                  const pct = item.limit > 0 ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium">
                          {item.limit === -1 ? "Unlimited" : `${item.used} / ${item.limit >= 99999 ? "∞" : (item.limit || 0)}`}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>
            )}
            <a
              href="https://useeasy.ai/pricing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> {isActive ? "Plan upgraden" : "Plan aktivieren"}
            </a>
          </div>

          <SecurityMfaCard />
        </TabsContent>

        <TabsContent value="jana-wissen" data-tour="jana-wissen-tab" className="mt-6">
          <JanaKnowledgeTab />
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6 space-y-6">
          {/* v4.130.0 — Preislisten dort, wo Leon sie erwartet (Unternehmenswissen) */}
          <PriceListsCard />
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="spreadsheet" data-tour="excel-tab" className="mt-6">
          <SpreadsheetConfigTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-6">
          <MailboxReconnectCard />
          <MicrosoftIntegration />
          <HubSpotIntegration />
          <TelegramIntegration />
          <DhlTrackingCard />
          <AssistantConfigCard />
          <TenantSetupSelfCard />
        </TabsContent>

        <TabsContent value="email-autopilot" data-tour="email-autopilot-tab" className="mt-6 space-y-6">
          {/* Redesign Follow-up: EIN Autopilot-Bereich mit Untersektionen statt drei Tabs.
              Deep-Links ?tab=email-autopilot-audit / -samples landen hier in der passenden Sektion. */}
          <div className="flex flex-wrap gap-1.5">
            {([["reife", "Stufen & Reife"], ["audit", "Audit"], ["samples", "Stichproben (nachträglich prüfen)"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setApSection(k)}
                className={`text-xs font-semibold rounded-full border px-3 py-1.5 transition-colors ${
                  apSection === k
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {apSection === "reife" && <EmailAutopilotTab />}
          {apSection === "audit" && <EmailAutopilotAuditView />}
          {apSection === "samples" && <StichprobenAuditTab />}
        </TabsContent>

        <TabsContent value="autopilot" className="mt-6 space-y-6">
          <JanaAutopilotTab />
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <BillingTab />
        </TabsContent>

        <TabsContent value="ki-transparenz" className="mt-6 space-y-6">
          <AiTransparencyTab />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
