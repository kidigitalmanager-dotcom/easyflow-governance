import { useState } from "react";
import { MAILBOXES } from "@/data/mock-data";
import { getCurrentPlan, USAGE } from "@/data/plan";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { ChipDomainInput } from "@/components/ChipDomainInput";
import { LockedControl } from "@/components/LockedControl";
import { Progress } from "@/components/ui/progress";

export default function Einstellungen() {
  const plan = getCurrentPlan();
  const isLocked = plan.id === "starter" || plan.id === "team";

  const [mailboxStates, setMailboxStates] = useState<Record<string, boolean>>({
    "support@firma.de": true,
    "sales@firma.de": true,
    "info@firma.de": false,
  });

  const [approvalRules, setApprovalRules] = useState({
    legalDsgvo: true,
    bankdaten: true,
    mahnung: false,
    externeEmpfaenger: true,
    anhaenge: false,
    betragThreshold: "500",
  });

  const [allowDomains, setAllowDomains] = useState(["firma.de", "partner.de"]);
  const [blockDomains, setBlockDomains] = useState(["spam.com"]);
  const [businessHours, setBusinessHours] = useState({ start: "08:00", end: "18:00" });
  const [slaTarget, setSlaTarget] = useState("95");

  const activeMailboxes = Object.values(mailboxStates).filter(Boolean).length;

  const toggleMailbox = (mb: string) => {
    const isActive = mailboxStates[mb];
    if (!isActive && activeMailboxes >= plan.mailboxLimit) return;
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

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">UseEasy-Konfiguration für deine Mailboxen.</p>
      </div>

      {/* Mailbox toggles */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">UseEasy pro Mailbox</h2>
          <span className="text-xs text-muted-foreground">
            {activeMailboxes} / {plan.mailboxLimit} genutzt
          </span>
        </div>
        {activeMailboxes >= plan.mailboxLimit && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Mailbox-Limit erreicht. Plan upgraden für mehr Mailboxen.
          </div>
        )}
        {MAILBOXES.map((mb) => (
          <div key={mb} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">{mb}</p>
              <p className="text-xs text-muted-foreground">{mailboxStates[mb] ? "Aktiv" : "Inaktiv"}</p>
            </div>
            <Toggle checked={mailboxStates[mb] || false} onChange={() => toggleMailbox(mb)} />
          </div>
        ))}
      </div>

      {/* Approval Rules */}
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

      {/* Domain Lists */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Domain-Listen</h2>
        {isLocked ? (
          <LockedControl category="Domains">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Erlaubte Domains</label>
                <div className="mt-1">
                  <ChipDomainInput domains={allowDomains} onChange={setAllowDomains} disabled />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Blockierte Domains</label>
                <div className="mt-1">
                  <ChipDomainInput domains={blockDomains} onChange={setBlockDomains} disabled />
                </div>
              </div>
            </div>
          </LockedControl>
        ) : (
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
        )}
      </div>

      {/* Business hours */}
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
              className="block mt-1 bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
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

      {/* Plan & Limits with progress bars */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Plan & Limits</h2>
        <div className="space-y-3">
          {[
            { label: "Mailboxen", used: USAGE.mailboxesUsed, limit: plan.mailboxLimit },
            { label: "Playbooks", used: USAGE.activePlaybooks, limit: plan.includedPlaybooks },
            { label: "Verarbeitete E-Mails", used: USAGE.processedEmails, limit: plan.processedEmails },
            { label: "Entwurf-Credits", used: USAGE.draftCreditsUsed, limit: plan.draftCredits },
          ].map((item) => {
            const pct = Math.min(100, Math.round((item.used / item.limit) * 100));
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">
                    {item.used >= 99999 ? "∞" : item.used} / {item.limit >= 99999 ? "∞" : item.limit}
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> Plan upgraden
        </button>
      </div>
    </div>
  );
}
