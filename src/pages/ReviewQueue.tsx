import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { useRecentEmails, useGenerateDraft, useDismissReview } from "@/hooks/use-api";
import ReviewVerdictButtons from "@/components/ReviewVerdictButtons";
import { ShadowModePill, ShadowWouldDoLine } from "@/components/ShadowHint";
import { LabelReasonLine } from "@/components/LabelReasonLine";
import { REVIEW } from "@/data/strings.de";
import { humanizeCategory, responseType, prettyRedaction } from "@/data/humanize";
import { Eye, Inbox, Sparkles, Loader2, Info, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const onErr = (e: unknown) =>
  toast.error("Fehler: " + (e instanceof Error ? e.message : String(e)));

// On-demand-Entwurf (Thread + Excel-Live-Sync + Knowledge → Bedrock).
function GenerateDraftButton({ eventId }: { eventId: string }) {
  const gen = useGenerateDraft();
  return (
    <Button size="sm" variant="outline" disabled={gen.isPending}
      onClick={() => gen.mutate(eventId, { onError: onErr })}>
      {gen.isPending ? (
        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {REVIEW.generatingDraft}</>
      ) : (
        <><Sparkles className="h-3.5 w-3.5 mr-1" /> {REVIEW.generateDraft}</>
      )}
    </Button>
  );
}

// Verwerfen OHNE Draft-Generierung — entfernt das Item aus der Queue (reversibel).
function DismissButton({ eventId }: { eventId: string }) {
  const dismiss = useDismissReview();
  return (
    <Button size="sm" variant="ghost" disabled={dismiss.isPending}
      title="Aus der Queue entfernen (kein Entwurf nötig)"
      onClick={() => dismiss.mutate({ event_id: eventId }, {
        onSuccess: () => toast.success("Verworfen."),
        onError: onErr,
      })}>
      <X className="h-3.5 w-3.5 mr-1" /> Verwerfen
    </Button>
  );
}

export default function ReviewQueue() {
  const { data: emails, isLoading, error } = useRecentEmails();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dismissBulk = useDismissReview();

  // Identische Logik wie die Übersicht ("Wartet auf Freigabe"), damit beide Ansichten
  // NICHT auseinanderlaufen: needs_review + pending_review gehören ebenfalls in die Queue.
  const NEEDS_ACTION = new Set(["pending", "needs_review", "pending_review"]);
  const items = (emails ?? []).filter((e) => e.has_draft || NEEDS_ACTION.has(e.status));
  const withDraft = items.filter((e) => e.has_draft && !!e.draft_id).length;
  const awaitingGen = items.length - withDraft;
  const noSubjectCount = items.filter((e) => e.subject === "(kein Betreff)").length;

  const clearWithoutSubject = () => {
    if (noSubjectCount === 0) return;
    if (!window.confirm(`${noSubjectCount} E-Mail(s) ohne Betreff aus der Queue entfernen? (reversibel, keine Daten gelöscht)`)) return;
    dismissBulk.mutate({ scope: "without_subject" }, {
      onSuccess: (d) => toast.success(`${d.dismissed} verworfen.`),
      onError: onErr,
    });
  };

  return (
    <div className="space-y-6">
      <div data-tour="review-header" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{REVIEW.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Lade…" : `${items.length} in der Warteschlange · ${withDraft} mit Entwurf, ${awaitingGen} warten auf Generierung.`}
          </p>
        </div>
        {noSubjectCount > 0 && (
          <Button size="sm" variant="outline" disabled={dismissBulk.isPending}
            onClick={clearWithoutSubject} className="flex-shrink-0">
            {dismissBulk.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Räume auf…</>
              : <><Trash2 className="h-3.5 w-3.5 mr-1" /> Ohne Betreff verwerfen ({noSubjectCount})</>}
          </Button>
        )}
      </div>

      <div data-tour="review-verdict" className="flex items-start gap-2 text-xs text-muted-foreground glass-card p-3">
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
            const rt = responseType(item);
            const isOpen = expandedId === item.id;
            return (
              <div key={item.id} className="glass-card-hover">
                <div className="flex items-center gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <ResponseTypeBadge type={rt} />
                      <PriorityBadge priority={item.priority} />
                      <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50 border border-border">
                        {humanizeCategory(item.action_type)}
                      </span>
                      {item.has_draft && (
                        <span className="text-xs text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                          Entwurf
                        </span>
                      )}
                      <ShadowModePill mode={item.autopilot_mode} />
                    </div>
                    <p className="text-sm font-medium mt-2">{prettyRedaction(item.subject)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.sender} · {new Date(item.created_at).toLocaleString("de-DE")}
                    </p>
                    <ShadowWouldDoLine mode={item.autopilot_mode} decision={item.shadow_decision} />
                    {/* v4.57.0 (J4): Warum dieses Label? — Quelle-Badge + Klartext-Satz */}
                    <LabelReasonLine
                      text={item.label_reason}
                      kind={item.label_reason_kind}
                      source={item.label_reason_source}
                      confidencePct={item.label_reason_confidence_pct}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasRealDraft && item.draft_body && (
                      <Button size="sm" variant="ghost" aria-label="Entwurf anzeigen" onClick={() => setExpandedId(isOpen ? null : item.id)} title="Entwurf anzeigen">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>

                    )}
                    {hasRealDraft ? (
                      <ReviewVerdictButtons draftId={draftId!} originalBody={item.draft_body ?? ""} />
                    ) : rt === "info" ? (
                      <>
                        <span className="text-xs text-muted-foreground px-2">Kein Handlungsbedarf</span>
                        <DismissButton eventId={item.id} />
                      </>
                    ) : (
                      <>
                        <GenerateDraftButton eventId={item.id} />
                        <DismissButton eventId={item.id} />
                      </>
                    )}
                  </div>
                </div>

                {isOpen && hasRealDraft && item.draft_body && (
                  <div className="px-5 pb-5 -mt-2">
                    <div className="rounded-md border border-border bg-muted/30 p-4 whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-72 overflow-auto">
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
