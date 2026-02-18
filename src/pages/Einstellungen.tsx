import { useState } from "react";
import { MAILBOXES } from "@/data/mock-data";
import { getCurrentPlan } from "@/data/plan";
import { ExternalLink } from "lucide-react";

export default function Einstellungen() {
  const plan = getCurrentPlan();
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

  const [allowList, setAllowList] = useState("firma.de, partner.de");
  const [blockList, setBlockList] = useState("spam.com");
  const [businessHours, setBusinessHours] = useState({ start: "08:00", end: "18:00" });
  const [slaTarget, setSlaTarget] = useState("95");

  const toggleMailbox = (mb: string) => {
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
        <h2 className="text-base font-semibold">UseEasy pro Mailbox</h2>
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

      {/* Allow/Block Lists */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Domain-Listen</h2>
        <div>
          <label className="text-sm font-medium">Erlaubte Domains</label>
          <input
            value={allowList}
            onChange={(e) => setAllowList(e.target.value)}
            className="w-full mt-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
            placeholder="domain1.de, domain2.de"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Blockierte Domains</label>
          <input
            value={blockList}
            onChange={(e) => setBlockList(e.target.value)}
            className="w-full mt-1 bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
            placeholder="spam.com"
          />
        </div>
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

      {/* Plan & Limits (read only) */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold">Plan & Limits</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Plan:</span>
            <p className="font-medium mt-0.5">{plan.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Inkl. Playbooks:</span>
            <p className="font-medium mt-0.5">{plan.includedPlaybooks}</p>
          </div>
          <div>
            <span className="text-muted-foreground">E-Mail-Limit:</span>
            <p className="font-medium mt-0.5">{plan.emailLimit}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Entwurf-Limit:</span>
            <p className="font-medium mt-0.5">{plan.draftLimit}</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> Plan upgraden
        </button>
      </div>
    </div>
  );
}
