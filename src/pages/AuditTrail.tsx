import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { AUDIT_TRAIL, MAILBOXES } from "@/data/mock-data";
import { AUDIT_ACTION_LABELS } from "@/data/strings.de";
import { getCurrentPlan } from "@/data/plan";
import { Download, X, Check, Send, Clock, ArrowRightLeft, User } from "lucide-react";

const priorities = ["Alle", "P0", "P1", "P2", "P3"] as const;

const actionIcons: Record<string, React.ReactNode> = {
  approved: <Check className="w-3.5 h-3.5 text-primary" />,
  rejected: <X className="w-3.5 h-3.5 text-destructive" />,
  sent: <Send className="w-3.5 h-3.5 text-p2" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  playbook_switch: <ArrowRightLeft className="w-3.5 h-3.5 text-p1" />,
};

export default function AuditTrail() {
  const plan = getCurrentPlan();
  const [selectedPriority, setSelectedPriority] = useState<string>("Alle");
  const [selectedMailbox, setSelectedMailbox] = useState<string>("Alle");
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  const filtered = AUDIT_TRAIL.filter((entry) => {
    if (selectedPriority !== "Alle" && entry.priority !== selectedPriority) return false;
    if (selectedMailbox !== "Alle" && entry.mailbox !== selectedMailbox) return false;
    return true;
  });

  const detail = AUDIT_TRAIL.find(e => e.id === selectedEntry);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">Vollständige Dokumentation aller UseEasy-Entscheidungen.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedMailbox}
          onChange={(e) => setSelectedMailbox(e.target.value)}
          className="bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        >
          <option value="Alle">Alle Mailboxen</option>
          {MAILBOXES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <div className="flex gap-1">
          {priorities.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPriority(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedPriority === p
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-border hover:bg-muted/30"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Timeline list */}
        <div className="flex-1 space-y-2">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedEntry(entry.id)}
              className={`w-full text-left glass-card-hover p-4 transition-all ${
                selectedEntry === entry.id ? "border-primary/30" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={entry.priority} />
                  <span className="text-xs text-muted-foreground">{entry.category}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {actionIcons[entry.userAction]}
                  <span className="text-xs text-muted-foreground">
                    {AUDIT_ACTION_LABELS[entry.userAction] || entry.userAction}
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium">{entry.subject}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{entry.mailbox} · {entry.timestamp}</p>
            </button>
          ))}
        </div>

        {/* Detail drawer */}
        {detail && (
          <div className="w-96 flex-shrink-0 glass-card p-6 space-y-4 sticky top-8 self-start">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Details</h3>
              <button onClick={() => setSelectedEntry(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Playbook + Version */}
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-muted-foreground">Playbook:</span>
                  <p className="mt-0.5 font-medium">{detail.playbook} {detail.playbookVersion}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Priorität:</span>
                  <div className="mt-0.5"><PriorityBadge priority={detail.priority} showLabel /></div>
                </div>
              </div>

              {/* Evidence (max 3) */}
              <div>
                <span className="text-muted-foreground">Evidenz:</span>
                <ul className="mt-1 space-y-1">
                  {detail.evidence.slice(0, 3).map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">·</span> {e}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Outcome (decision) */}
              <div>
                <span className="text-muted-foreground">Entscheidung:</span>
                <p className="mt-0.5 font-medium">{detail.decision}</p>
              </div>

              {/* Reason */}
              <div>
                <span className="text-muted-foreground">Warum:</span>
                <p className="mt-0.5">{detail.reason}</p>
              </div>

              {/* Actor */}
              <div>
                <span className="text-muted-foreground">Akteur:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{detail.actor}</span>
                </div>
              </div>

              {/* Action status */}
              <div>
                <span className="text-muted-foreground">Aktion:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {actionIcons[detail.userAction]}
                  <span className="font-medium">
                    {AUDIT_ACTION_LABELS[detail.userAction] || detail.userAction}
                  </span>
                </div>
              </div>

              {/* Timestamp */}
              <div>
                <span className="text-muted-foreground">Zeitpunkt:</span>
                <p className="mt-0.5 font-medium">{detail.timestamp}</p>
              </div>
            </div>

            {/* Export */}
            <div className="pt-3 border-t border-border">
              {plan.exportEnabled ? (
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full justify-center">
                  <Download className="w-4 h-4" /> Exportieren
                </button>
              ) : (
                <button
                  disabled
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground w-full justify-center opacity-60 cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Export (ab Scale-Plan)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
