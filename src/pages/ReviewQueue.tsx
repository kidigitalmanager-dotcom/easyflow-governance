import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { REVIEW_QUEUE, REJECTION_REASONS } from "@/data/mock-data";
import { Check, X, ChevronDown, Eye } from "lucide-react";
import { toast } from "sonner";

export default function ReviewQueue() {
  const [items, setItems] = useState(REVIEW_QUEUE);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success("Vorschlag wurde übernommen.");
  };

  const handleReject = (id: string, reason: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setRejectingId(null);
    toast.error("Vorschlag wurde verworfen.", { description: reason });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">{items.length} Vorschläge warten auf Freigabe.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="glass-card-hover">
            {/* Main row */}
            <div className="flex items-center gap-4 p-5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <PriorityBadge priority={item.priority} showLabel />
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50 border border-border">
                    {item.suggestionType}
                  </span>
                </div>
                <p className="text-sm font-medium mt-2">{item.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.sender} · {item.senderEmail} · {item.mailbox} · {item.timestamp}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Details anzeigen"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleApprove(item.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" /> Freigeben
                </button>
                <div className="relative">
                  <button
                    onClick={() => setRejectingId(rejectingId === item.id ? null : item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Ablehnen <ChevronDown className="w-3 h-3" />
                  </button>
                  {rejectingId === item.id && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                      {REJECTION_REASONS.map((reason) => (
                        <button
                          key={reason}
                          onClick={() => handleReject(item.id, reason)}
                          className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === item.id && (
              <div className="px-5 pb-5 pt-0 border-t border-border">
                <div className="pt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">Warum diese Entscheidung?</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Playbook:</span>{" "}
                      <span className="font-medium">{item.playbook} {item.playbookVersion}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priorität:</span>{" "}
                      <PriorityBadge priority={item.priority} />
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Evidenz:</span>
                    <ul className="mt-1 space-y-1">
                      {item.evidence.map((e, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span> {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div className="glass-card p-12 text-center">
            <Check className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="text-lg font-medium">Alle Reviews erledigt</p>
            <p className="text-sm text-muted-foreground mt-1">Keine offenen Vorschläge.</p>
          </div>
        )}
      </div>
    </div>
  );
}
