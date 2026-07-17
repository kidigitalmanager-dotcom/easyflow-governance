import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { useRecentEmails, useGenerateDraft, useDismissReview } from "@/hooks/use-api";
import ReviewVerdictButtons from "@/components/ReviewVerdictButtons";
import { ShadowModePill, ShadowWouldDoLine } from "@/components/ShadowHint";
import { LabelReasonLine } from "@/components/LabelReasonLine";
import { REVIEW } from "@/data/strings.de";
import { humanizeCategory, responseType, prettyRedaction } from "@/data/humanize";
import { Inbox, Sparkles, Loader2, Info, X, Trash2, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

// Redesign Follow-up: Freigaben als Zwei-Spalten-Arbeitsplatz wie ein E-Mail-Client.
// Links die Liste (mit Filter-Chips), rechts Anliegen + Begründung + Entwurf + Aktionen.
// Deep-Link: /review?item=<event_id> (auch aus der Cmd-K-Suche).
type FilterKey = "alle" | "P0" | "P1" | "P2" | "P3" | "ohne";

export default function ReviewQueue() {
  const { data: emails, isLoading, error } = useRecentEmails();
  const dismissBulk = useDismissReview();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("item"));
  const [filter, setFilter] = useState<FilterKey>("alle");

  // Identische Logik wie die Übersicht ("Wartet auf Freigabe"), damit beide Ansichten
  // NICHT auseinanderlaufen: needs_review + pending_review gehören ebenfalls in die Queue.
  const NEEDS_ACTION = new Set(["pending", "needs_review", "pending_review"]);
  const items = (emails ?? []).filter((e) => e.has_draft || NEEDS_ACTION.has(e.status));
  const withDraft = items.filter((e) => e.has_draft && !!e.draft_id).length;
  const awaitingGen = items.length - withDraft;
  const noSubjectCount = items.filter((e) => e.subject === "(kein Betreff)").length;

  const prioCount = (p: string) => items.filter((e) => e.priority === p).length;
  const ohneCount = items.filter((e) => !(e.has_draft && !!e.draft_id)).length;
  const chips: { key: FilterKey; label: string; count: number }[] = [
    { key: "alle", label: "Alle", count: items.length },
    { key: "P0", label: "P0", count: prioCount("P0") },
    { key: "P1", label: "P1", count: prioCount("P1") },
    { key: "P2", label: "P2", count: prioCount("P2") },
    { key: "P3", label: "P3", count: prioCount("P3") },
    { key: "ohne", label: "Ohne Entwurf", count: ohneCount },
  ];

  const filtered = items.filter((e) =>
    filter === "alle" ? true
      : filter === "ohne" ? !(e.has_draft && !!e.draft_id)
      : e.priority === filter);

  const selected = filtered.find((e) => e.id === selectedId) ?? null;

  // Auto-Auswahl: erstes Element der gefilterten Liste, wenn nichts (mehr) gewählt ist
  // (z.B. nach Freigeben/Verwerfen oder ungültigem ?item=-Deep-Link).
  useEffect(() => {
    if (!selected && filtered.length > 0 && selectedId !== filtered[0].id) {
      setSelectedId(filtered[0].id);
    }
  }, [selected, filtered, selectedId]);

  const pick = (id: string) => {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    next.set("item", id);
    setSearchParams(next, { replace: true });
  };

  const clearWithoutSubject = () => {
    if (noSubjectCount === 0) return;
    if (!window.confirm(`${noSubjectCount} E-Mail(s) ohne Betreff aus der Queue entfernen? (reversibel, keine Daten gelöscht)`)) return;
    dismissBulk.mutate({ scope: "without_subject" }, {
      onSuccess: (d) => toast.success(`${d.dismissed} verworfen.`),
      onError: onErr,
    });
  };

  const rtSelected = selected ? responseType(selected) : null;
  const selectedHasRealDraft = !!(selected && selected.has_draft && selected.draft_id);

  return (
    <div className="space-y-6">
      <div data-tour="review-header" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Freigaben</h1>
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

      {/* Filter-Chips */}
      <div className="flex flex-wrap gap-1.5">
        {chips.filter((c) => c.key === "alle" || c.count > 0).map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              "text-xs font-semibold rounded-full border px-3 py-1.5 transition-colors",
              filter === c.key
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[var(--radius)]" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-[var(--radius)]" />
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
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] items-start">
          {/* Liste (links) */}
          <div className="glass-card overflow-hidden lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
            ) : filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => pick(item.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border last:border-b-0 border-l-2 transition-colors",
                  selectedId === item.id
                    ? "border-l-primary bg-primary/5"
                    : "border-l-transparent hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge priority={item.priority} />
                  {item.has_draft && !!item.draft_id && (
                    <span className="text-[10px] text-primary px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">Entwurf</span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
                <p className="text-[13px] font-semibold truncate">{prettyRedaction(item.subject)}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {item.sender} · {humanizeCategory(item.action_type)}
                </p>
              </button>
            ))}
          </div>

          {/* Detail (rechts) */}
          {selected ? (
            <div className="glass-card">
              <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
                <ResponseTypeBadge type={rtSelected!} />
                <PriorityBadge priority={selected.priority} />
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50 border border-border">
                  {humanizeCategory(selected.action_type)}
                </span>
                <ShadowModePill mode={selected.autopilot_mode} />
                <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(selected.created_at).toLocaleString("de-DE")}
                </span>
              </div>

              <div className="px-5 py-4 border-b border-border space-y-2">
                <p className="text-sm font-semibold">{prettyRedaction(selected.subject)}</p>
                <p className="text-xs text-muted-foreground">{selected.sender}</p>
                <ShadowWouldDoLine mode={selected.autopilot_mode} decision={selected.shadow_decision} />
                {/* v4.57.0 (J4): Warum dieses Label? — Quelle-Badge + Klartext-Satz */}
                <LabelReasonLine
                  text={selected.label_reason}
                  kind={selected.label_reason_kind}
                  source={selected.label_reason_source}
                  confidencePct={selected.label_reason_confidence_pct}
                />
              </div>

              <div className="px-5 py-4 space-y-3">
                {selectedHasRealDraft && selected.draft_body ? (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vorbereiteter Entwurf</p>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-[45vh] overflow-auto">
                      {selected.draft_body}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{REVIEW.noDraftYet}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedHasRealDraft ? (
                    <ReviewVerdictButtons draftId={selected.draft_id!} originalBody={selected.draft_body ?? ""} />
                  ) : rtSelected === "info" ? (
                    <>
                      <span className="text-xs text-muted-foreground px-2">Kein Handlungsbedarf</span>
                      <DismissButton eventId={selected.id} />
                    </>
                  ) : (
                    <>
                      <GenerateDraftButton eventId={selected.id} />
                      <DismissButton eventId={selected.id} />
                    </>
                  )}
                  <span className="ml-auto text-[10.5px] text-muted-foreground">Kein Auto-Versand · Senden erfolgt immer durch dich</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-12 text-center">
              <MailOpen className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Links eine E-Mail auswählen.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
