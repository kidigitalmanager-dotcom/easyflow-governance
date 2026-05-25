import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { useRecentEmails, useGenerateDraft } from "@/hooks/use-api";
import ReviewVerdictButtons from "@/components/ReviewVerdictButtons";
import { REVIEW } from "@/data/strings.de";
import { Eye, Inbox, Sparkles, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// Inline: "Entwurf generieren" für Mails ohne vorbereiteten Draft (on-demand,
// kontextbasiert — Thread + Excel-Live-Sync + Knowledge → Bedrock).
function GenerateDraftButton({ eventId }: { eventId: string }) {
  const gen = useGenerateDraft();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={gen.isPending}
      onClick={() =>
        gen.mutate(eventId, {
          onError: (e: unknown) =>
            toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
        })
      }
    >
      {gen.isPending ? (
        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {REVIEW.generatingDraft}</>
      ) : (
        <><Sparkles className="h-3.5 w-3.5 mr-1" /> {REVIEW.generateDraft}</>
      )}
    </Button>
  );
}

export default function ReviewQueue() {
  const { data: emails, isLoading, error } = useRecentEmails();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Vorschläge mit Draft ODER offene (pending) Mails ohne Draft.
  const items = (emails ?? []).filter((e) => e.has_draft || e.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{REVIEW.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "Lade…" : `${REVIEW.subtitle} ${items.length} offen.`}
        </p>
      </div>

      {/* Hinweis: native Mini-UI bleibt der primäre Ort für Einzelfälle. */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground glass-card p-3">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
        <span>{REVIEW.hint}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-sm text-destructive">
          Fehler beim Laden der Review Queue.
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Inbox className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium">{REVIEW.empty}</p>
          <p className="text-sm text-muted-foreground mt-1">{REVIEW.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const draftId = item.draft_id ?? null;
            const hasRealDraft = item.has_draft && !!draftId;
            const isOpen = expandedId === item.id;
            return (
              <div key={item.id} className="glass-card-hover">
                <div className="flex items-center gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <PriorityBadge priority={item.priority} showLabel />
                      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50 border border-border">
                        {item.action_type}
                      </span>
                      {item.has_draft && (
                        <span className="text-xs text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                          Entwurf
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-2">{item.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.sender} · {new Date(item.created_at).toLocaleString("de-DE")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasRealDraft && item.draft_body && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isOpen ? null : item.id)}
                        title="Entwurf anzeigen"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {hasRealDraft ? (
                      <ReviewVerdictButtons draftId={draftId!} originalBody={item.draft_body ?? ""} />
                    ) : (
                      <GenerateDraftButton eventId={item.id} />
                    )}
                  </div>
                </div>

                {/* Draft-Vorschau (Body) */}
                {isOpen && hasRealDraft && item.draft_body && (
                  <div className="px-5 pb-5 -mt-2">
                    <div className="rounded-md border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-72 overflow-auto">
                      {item.draft_body}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
