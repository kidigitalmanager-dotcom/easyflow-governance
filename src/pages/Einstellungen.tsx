import { useState, useEffect } from "react";
import { useMe } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { ExternalLink, AlertTriangle, Mail, Settings, BookOpen, Plug, FileSpreadsheet, Phone } from "lucide-react";
import { ChipDomainInput } from "@/components/ChipDomainInput";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import KnowledgeBaseTab from "@/components/KnowledgeBaseTab";
import HubSpotIntegration from "@/components/HubSpotIntegration";
import MicrosoftIntegration from "@/components/MicrosoftIntegration";
import TelegramIntegration from "@/components/TelegramIntegration";
import AssistantConfigCard from "@/components/AssistantConfigCard";
import TenantSetupSelfCard from "@/components/TenantSetupSelfCard";
import SpreadsheetConfigTab from "@/components/SpreadsheetConfigTab";
import JanaAutopilotTab from "@/components/JanaAutopilotTab";
import EmailAutopilotTab from "@/components/EmailAutopilotTab";
import EmailAutopilotAuditView from "@/components/EmailAutopilotAuditView";
import StichprobenAuditTab from "@/components/StichprobenAuditTab";

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

export default function Einstellungen() {
  const { user } = useAuth();
  const { data: me, isLoading } = useMe();

  const tenant = me?.tenant;
  const plan = me?.plan;
  const isActive = tenant && tenant.status !== "not_onboarded";

  const userEmail = user?.email ?? "";
  const userId = user?.id ?? "anon";

  const [mailboxStates, setMailboxStates] = useLocalState<Record<string, boolean>>(
    `ue_mailboxes_${userId}`,
    {}
  );

  const [approvalRules, setApprovalRules] = useLocalState(
    `ue_approval_${userId}`,
    {
      legalDsgvo: false,
      bankdaten: false,
      mahnung: false,
      externeEmpfaenger: false,
      anhaenge: false,
      betragThreshold: "500",
    }
  );

  const [allowDomains, setAllowDomains] = useLocalState<string[]>(`ue_allow_domains_${userId}`, []);
  const [blockDomains, setBlockDomains] = useLocalState<string[]>(`ue_block_domains_${userId}`, []);
  const [businessHours, setBusinessHours] = useLocalState(`ue_hours_${userId}`, { start: "08:00", end: "18:00" });
  const [slaTarget, setSlaTarget] = useLocalState(`ue_sla_${userId}`, "95");

  const mailboxList = Object.keys(mailboxStates);
  const activeMailboxes = Object.values(mailboxStates).filter(Boolean).length;
  const mailboxLimit = plan?.mailbox_limit ?? 0;

  const toggleMailbox = (mb: string) => {
    const isOn = mailboxStates[mb];
    if (!isOn && mailboxLimit > 0 && activeMailboxes >= mailboxLimit) return;
    setMailboxStates(prev => ({ ...prev, [mb]: !prev[mb] }));
  };

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

  const initialTab = (() => {
    if (typeof window === "undefined") return "general";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "excel") return "spreadsheet"; // Chrome-Extension Deep-Link Alias (?tab=excel)
    if (t === "jana" || t === "autopilot") return "autopilot"; // Phase 3C alias
    return t === "knowledge" || t === "integrations" || t === "spreadsheet" || t === "autopilot" ? t : "general";
  })();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">UseEasy-Konfiguration für deine Mailboxen.</p>
      </div>

      <Tabs defaultValue={initialTab} className="w-full">
        <TabsList className="w-full !grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 !h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            Allgemein
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Unternehmenswissen
          </TabsTrigger>
          <TabsTrigger value="spreadsheet" className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Live-Sync
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <Plug className="w-3.5 h-3.5" />
            Integrationen
          </TabsTrigger>
          <TabsTrigger value="email-autopilot" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Email-Autopilot
          </TabsTrigger>
          <TabsTrigger value="email-autopilot-audit" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Autopilot Audit
          </TabsTrigger>
          <TabsTrigger value="email-autopilot-samples" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Nachträglich prüfen
          </TabsTrigger>
          <TabsTrigger value="autopilot" className="gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            Jana-Autopilot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-8 mt-6">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">UseEasy pro Mailbox</h2>
              <span className="text-xs text-muted-foreground">
                {activeMailboxes} / {mailboxLimit} genutzt
              </span>
            </div>
            {mailboxLimit > 0 && activeMailboxes >= mailboxLimit && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Mailbox-Limit erreicht. Plan upgraden für mehr Mailboxen.
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : mailboxList.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Mail className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Noch keine Mailbox verbunden</p>
                {userEmail && (
                  <p className="text-xs text-muted-foreground/70">Angemeldet als {userEmail}</p>
                )}
                <button
                  onClick={() => setMailboxStates(prev => ({ ...prev, [userEmail]: false }))}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Mailbox verbinden
                </button>
              </div>
            ) : (
              mailboxList.map((mb) => (
                <div key={mb} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{mb}</p>
                    <p className="text-xs text-muted-foreground">{mailboxStates[mb] ? "Aktiv" : "Inaktiv"}</p>
                  </div>
                  <Toggle checked={mailboxStates[mb] || false} onChange={() => toggleMailbox(mb)} />
                </div>
              ))
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
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6">
          <KnowledgeBaseTab />
        </TabsContent>

        <TabsContent value="spreadsheet" className="mt-6">
          <SpreadsheetConfigTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-6">
          <MicrosoftIntegration />
          <HubSpotIntegration />
          <TelegramIntegration />
          <AssistantConfigCard />
          <TenantSetupSelfCard />
        </TabsContent>

        <TabsContent value="email-autopilot" className="mt-6 space-y-6">
          <EmailAutopilotTab />
        </TabsContent>

        <TabsContent value="email-autopilot-audit" className="mt-6 space-y-6">
          <EmailAutopilotAuditView />
        </TabsContent>

        <TabsContent value="email-autopilot-samples" className="mt-6 space-y-6">
          <StichprobenAuditTab />
        </TabsContent>

        <TabsContent value="autopilot" className="mt-6 space-y-6">
          <JanaAutopilotTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
