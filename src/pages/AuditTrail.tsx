import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { useAuditLog, useUndoAction, useRemoveLabel } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCurrentPlan } from "@/data/plan";
import { Download, X, Check, Send, Clock, ArrowRightLeft, User, Inbox, Loader2, RotateCcw, Ban, Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizePlaybook, humanizeDecision, humanizeCategory, humanizeReason, humanizeActor, humanizeConfidence, responseLabel, responseType } from "@/data/humanize";
import DecisionStory from "@/components/DecisionStory";

const priorities = ["Alle", "P0", "P1", "P2", "P3"] as const;

const ACTION_LABELS: Record<string, string> = {
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  sent: "Gesendet",
  pending: "Ausstehend",
  playbook_switch: "Playbook gewechselt",
};

const actionIcons: Record<string, React.ReactNode> = {
  approved: <Check className="w-3.5 h-3.5 text-primary" />,
  rejected: <X className="w-3.5 h-3.5 text-destructive" />,
  sent: <Send className="w-3.5 h-3.5 text-p2" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  playbook_switch: <ArrowRightLeft className="w-3.5 h-3.5 text-p1" />,
};

export default function AuditTrail() {
  const plan = getCurrentPlan();
  const { data: auditData, isLoading, error } = useAuditLog();
  const undo = useUndoAction();
  const removeLabel = useRemoveLabel();
  const [selectedPriority, setSelectedPriority] = useState<string>("Alle");
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  const entries = auditData ?? [];

  const filtered = entries.filter((entry) => {
    if (selectedPriority !== "Alle" && entry.priority !== selectedPriority) return false;
    return true;
  });

  const detail = entries.find((e) => e.id === selectedEntry);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">Vollständige Dokumentation aller UseEasy-Entscheidungen.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-sm text-destructive">
          Fehler beim Laden des Audit Trails.
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Inbox className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium">Noch keine Einträge</p>
          <p className="text-sm text-muted-foreground mt-1">Sobald E-Mails verarbeitet werden, erscheinen sie hier.</p>
        </div>
      ) : (
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
                    <ResponseTypeBadge type={responseType(entry)} />
                    <PriorityBadge priority={entry.priority} />
                    <span className="text-xs text-muted-foreground">{humanizeCategory(entry.category)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {actionIcons[entry.user_action]}
                    <span className="text-xs text-muted-foreground">
                      {ACTION_LABELS[entry.user_action] || entry.user_action}
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
            <div className="w-96 flex-shrink-0 glass-card p-6 space-y-4 sticky top-8 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Details</h3>
                <button onClick={() => setSelectedEntry(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <DecisionStory entry={detail} />

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Technische Details</summary>
                <div className="space-y-3 text-sm p-3 pt-0">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-muted-foreground">Playbook:</span>
                    <p className="mt-0.5 font-medium">{humanizePlaybook(detail.playbook, detail.playbook_version)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priorität:</span>
                    <div className="mt-0.5"><PriorityBadge priority={detail.priority} showLabel labelOverride={responseLabel(detail)} /></div>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground">Konfidenz:</span>
                  <p className="mt-0.5 font-medium">{humanizeConfidence(detail.confidence)}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Evidenz:</span>
                  <ul className="mt-1 space-y-1">
                    {(detail.evidence ?? []).slice(0, 5).map((e, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">·</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>

                {detail.policy_hits && detail.policy_hits.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Policy Hits:</span>
                    <ul className="mt-1 space-y-1">
                      {detail.policy_hits.map((ph, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-primary mt-0.5">•</span> {ph}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground">Entscheidung:</span>
                  <p className="mt-0.5 font-medium">{humanizeDecision(detail.decision)}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Warum:</span>
                  <p className="mt-0.5">{humanizeReason(detail.reason)}</p>
                </div>

                <div>
                  <span className="text-muted-foreground">Akteur:</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{humanizeActor(detail.actor)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground">Aktion:</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {actionIcons[detail.user_action]}
                    <span className="font-medium">
                      {ACTION_LABELS[detail.user_action] || detail.user_action}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground">Zeitpunkt:</span>
                  <p className="mt-0.5 font-medium">{detail.timestamp}</p>
                </div>
              </div>
              </details>

              {(detail.user_action === "dismissed" || detail.user_action === "rejected" || detail.user_action === "autopilot_approved") && (
                <div className="pt-3 border-t border-border space-y-2">
                  <p className="text-xs text-muted-foreground">Rückgängig</p>
                  {(detail.user_action === "dismissed" || detail.user_action === "rejected") && (
                    <Button size="sm" variant="outline" className="w-full justify-center" disabled={undo.isPending}
                      onClick={() => undo.mutate({ event_id: detail.id, undo_type: "reopen" }, {
                        onSuccess: () => toast.success("Wieder in die Queue geholt."),
                        onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                      })}>
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Wieder öffnen
                    </Button>
                  )}
                  {detail.user_action === "autopilot_approved" && (
                    <Button size="sm" variant="destructive" className="w-full justify-center" disabled={undo.isPending}
                      onClick={() => undo.mutate({ event_id: detail.id, undo_type: "cancel_send" }, {
                        onSuccess: () => toast.success("Autonomer Versand abgebrochen."),
                        onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                      })}>
                      <Ban className="w-3.5 h-3.5 mr-1" /> Autonomen Versand abbrechen
                    </Button>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground">Postfach-Label</p>
                <Button size="sm" variant="outline" className="w-full justify-center" disabled={removeLabel.isPending}
                  onClick={() => {
                    if (!window.confirm("UseEasy-Labels (UE/…) dieser E-Mail im Postfach entfernen? Deine eigenen Labels bleiben unberührt.")) return;
                    removeLabel.mutate({ event_id: detail.id }, {
                      onSuccess: (r) => toast.success(r.removed && r.removed.length ? `Entfernt: ${r.removed.join(", ")}` : "Keine UseEasy-Labels an dieser Mail."),
                      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                    });
                  }}>
                  {removeLabel.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Tag className="w-3.5 h-3.5 mr-1" />}
                  UseEasy-Label entfernen
                </Button>
              </div>

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
      )}
    </div>
  );
}
