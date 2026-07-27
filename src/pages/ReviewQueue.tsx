import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import {
  useRecentEmails,
  useGenerateDraft,
  useSubmitReviewVerdict,
  useCorrectLabel,
  useDismissReview,
  useMe,
} from "@/hooks/use-api";
import { useMemoryEntities } from "@/hooks/use-memory";
import { useReviewActions } from "@/hooks/use-review-actions";
import ReviewVerdictButtons from "@/components/ReviewVerdictButtons";
import { ShadowModePill, ShadowWouldDoLine } from "@/components/ShadowHint";
import { LabelReasonLine } from "@/components/LabelReasonLine";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { REVIEW } from "@/data/strings.de";
import { humanizeCategory, responseType, prettyRedaction } from "@/data/humanize";
import { deadlineSenderSet, isDeadlineItem, isMoneyItem } from "@/lib/review-facets";
import { Inbox, Sparkles, Loader2, Info, X, Trash2, MailOpen, CheckCheck, Tag, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ContactDossier } from "@/components/ContactDossier";
import { PageHeader, SectionCard, Chip, EmptyState } from "@/components/ue/primitives";
import type { RecentEmail } from "@/lib/api-client";

const onErr = (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e)));

// On-demand-Entwurf (Thread + Excel-Live-Sync + Knowledge → Bedrock).
function GenerateDraftButton({ eventId }: { eventId: string }) {
  const gen = useGenerateDraft();
  return (
    <Button size="sm" variant="outline" disabled={gen.isPending} onClick={() => gen.mutate(eventId, { onError: onErr })}>
      {gen.isPending ? (
        <>
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> {REVIEW.generatingDraft}
        </>
      ) : (
        <>
          <Sparkles className="mr-1 h-3.5 w-3.5" /> {REVIEW.generateDraft}
        </>
      )}
    </Button>
  );
}

// Verwerfen OHNE Draft-Generierung — entfernt das Item aus der Queue (reversibel).
function DismissButton({ eventId }: { eventId: string }) {
  const dismiss = useDismissReview();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={dismiss.isPending}
      title="Aus der Queue entfernen (kein Entwurf nötig)"
      onClick={() =>
        dismiss.mutate(
          { event_id: eventId },
          { onSuccess: () => toast.success("Verworfen."), onError: onErr },
        )
      }
    >
      <X className="mr-1 h-3.5 w-3.5" /> Verwerfen
    </Button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Freigaben — Zwei-Spalten-Arbeitsplatz (Briefing §2, Phase 3).

   NEU in diesem Umbau (Kernstueck des Entwurfs):
   · Tastatur-Flow  F = freigeben · A = ablehnen/verwerfen · ↓/↑ bzw. J/K = blättern
     · E = bearbeiten · Enter = auswählen. Tastatur und Buttons rufen dieselbe
     Aktion (useReviewActions) — sie koennen nicht auseinanderlaufen.
   · Filter-Chips zusaetzlich zu P0–P3: "Fristbezug" und "Geld". Beide leiten
     sich aus vorhandenen Feldern ab (Intent bzw. memory-Fristen), es wird nichts
     erfunden; ohne Treffer erscheint der Chip gar nicht.
   Deep-Link: /review?item=<event_id> (auch aus der Cmd-K-Suche).
   ────────────────────────────────────────────────────────────────────────── */
type FilterKey = "alle" | "frist" | "geld" | "P0" | "P1" | "P2" | "P3" | "ohne";

export default function ReviewQueue() {
  const { data: emails, isLoading, isError, refetch, isFetching } = useRecentEmails();
  const dismissBulk = useDismissReview();
  const bulkVerdict = useSubmitReviewVerdict();
  const correctLabel = useCorrectLabel();
  const { data: me } = useMe();
  // Fristen-Facette: dieselbe Quelle wie das Fristen-Board auf "Heute".
  const { data: entities } = useMemoryEntities(200);
  const actions = useReviewActions();

  const [bulkRunning, setBulkRunning] = useState(false);
  const [correctKey, setCorrectKey] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("item"));
  const [filter, setFilter] = useState<FilterKey>("alle");
  const [editRequest, setEditRequest] = useState(0); // Tastatur "E" -> Editor oeffnen
  const listRef = useRef<HTMLDivElement>(null);

  // Identische Logik wie die Übersicht ("Braucht dich jetzt"), damit beide Ansichten
  // NICHT auseinanderlaufen: needs_review + pending_review gehören ebenfalls in die Queue.
  const NEEDS_ACTION = useMemo(() => new Set(["pending", "needs_review", "pending_review"]), []);
  const items = useMemo(
    () => (emails ?? []).filter((e) => e.has_draft || NEEDS_ACTION.has(e.status)),
    [emails, NEEDS_ACTION],
  );

  const withDraft = items.filter((e) => e.has_draft && !!e.draft_id).length;
  const awaitingGen = items.length - withDraft;
  const noSubjectCount = items.filter((e) => e.subject === "(kein Betreff)").length;

  const deadlineSenders = useMemo(() => deadlineSenderSet(entities, 14), [entities]);
  const matches = useCallback(
    (e: RecentEmail, key: FilterKey) => {
      switch (key) {
        case "alle":
          return true;
        case "ohne":
          return !(e.has_draft && !!e.draft_id);
        case "frist":
          return isDeadlineItem(e, deadlineSenders);
        case "geld":
          return isMoneyItem(e);
        default:
          return e.priority === key;
      }
    },
    [deadlineSenders],
  );

  const chips: { key: FilterKey; label: string; count: number }[] = [
    { key: "alle", label: "Alle", count: items.length },
    { key: "frist", label: "Fristbezug", count: items.filter((e) => matches(e, "frist")).length },
    { key: "geld", label: "Geld", count: items.filter((e) => matches(e, "geld")).length },
    { key: "P0", label: "P0", count: items.filter((e) => e.priority === "P0").length },
    { key: "P1", label: "P1", count: items.filter((e) => e.priority === "P1").length },
    { key: "P2", label: "P2", count: items.filter((e) => e.priority === "P2").length },
    { key: "P3", label: "P3", count: items.filter((e) => e.priority === "P3").length },
    { key: "ohne", label: "Ohne Entwurf", count: items.filter((e) => matches(e, "ohne")).length },
  ];

  const filtered = useMemo(() => items.filter((e) => matches(e, filter)), [items, filter, matches]);
  const selected = filtered.find((e) => e.id === selectedId) ?? null;
  const selectedIndex = filtered.findIndex((e) => e.id === selectedId);

  // Auto-Auswahl: erstes Element der gefilterten Liste, wenn nichts (mehr) gewählt ist
  // (z.B. nach Freigeben/Verwerfen oder ungültigem ?item=-Deep-Link).
  useEffect(() => {
    if (!selected && filtered.length > 0 && selectedId !== filtered[0].id) {
      setSelectedId(filtered[0].id);
    }
  }, [selected, filtered, selectedId]);

  const pick = useCallback(
    (id: string) => {
      setSelectedId(id);
      const next = new URLSearchParams(searchParams);
      next.set("item", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  /** Nach einer Aktion auf den naechsten Eintrag springen (Flow bleibt in Bewegung). */
  const stepAfterAction = useCallback(() => {
    const idx = filtered.findIndex((e) => e.id === selectedId);
    const next = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
    if (next) pick(next.id);
  }, [filtered, selectedId, pick]);

  const move = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const idx = selectedIndex < 0 ? 0 : Math.min(filtered.length - 1, Math.max(0, selectedIndex + delta));
      pick(filtered[idx].id);
      // Zeile ins Sichtfeld holen.
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLElement>(`[data-row="${filtered[idx].id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
    },
    [filtered, selectedIndex, pick],
  );

  // ── Tastatur-Flow ──────────────────────────────────────────────────────
  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable ||
        !!el.closest("[role='dialog']")
      );
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (isTyping(ev.target)) return;

      const hasDraft = !!(selected && selected.has_draft && selected.draft_id);

      switch (ev.key) {
        case "ArrowDown":
        case "j":
        case "J":
          ev.preventDefault();
          move(1);
          return;
        case "ArrowUp":
        case "k":
        case "K":
          ev.preventDefault();
          move(-1);
          return;
        case "f":
        case "F":
          if (!selected || actions.isPending) return;
          ev.preventDefault();
          if (hasDraft) actions.approve(selected.draft_id!, stepAfterAction);
          else toast.info("Für diesen Vorgang gibt es noch keinen Entwurf — erst generieren.");
          return;
        case "a":
        case "A":
          if (!selected || actions.isPending) return;
          ev.preventDefault();
          if (hasDraft) actions.reject(selected.draft_id!, stepAfterAction);
          else actions.dismissEvent(selected.id, stepAfterAction);
          return;
        case "e":
        case "E":
          if (!selected || !hasDraft) return;
          ev.preventDefault();
          setEditRequest((n) => n + 1);
          return;
        default:
          return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    /* `actions` ist seit 27.07.2026 referenz-stabil (useReviewActions memoisiert):
       der Listener haengt sich nur noch bei echten Aenderungen neu ein, nicht mehr
       bei JEDEM Render. Alle gelesenen Werte bleiben Dependencies — der Handler
       sieht weiter denselben Stand wie die Buttons. */
  }, [selected, actions, move, stepAfterAction]);

  const clearWithoutSubject = () => {
    if (noSubjectCount === 0) return;
    if (!window.confirm(`${noSubjectCount} E-Mail(s) ohne Betreff aus der Queue entfernen? (reversibel, keine Daten gelöscht)`)) return;
    dismissBulk.mutate(
      { scope: "without_subject" },
      { onSuccess: (d) => toast.success(`${d.dismissed} verworfen.`), onError: onErr },
    );
  };

  // Routine-Entwuerfe (P3, Entwurf vorhanden) gesammelt freigeben. Nutzt denselben
  // Verdict-Endpunkt wie der Einzel-Button — kein Auto-Versand, die Entwuerfe
  // landen im Entwurfsordner des Postfachs.
  const bulkEligible = items.filter((e) => e.priority === "P3" && e.has_draft && !!e.draft_id);
  const runBulkApprove = async () => {
    if (bulkEligible.length === 0 || bulkRunning) return;
    if (!window.confirm(`${bulkEligible.length} Routine-Entwurf/-Entwürfe (P3) freigeben? Sie werden als Entwürfe in dein Postfach gelegt — gesendet wird nichts.`)) return;
    setBulkRunning(true);
    let ok = 0,
      fail = 0;
    for (const it of bulkEligible) {
      try {
        await bulkVerdict.mutateAsync({ draft_id: it.draft_id!, human_verdict: "approve" });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkRunning(false);
    if (fail === 0) toast.success(`${ok} Entwürfe in dein Postfach gelegt.`);
    else toast.warning(`${ok} freigegeben, ${fail} fehlgeschlagen.`);
  };

  const rtSelected = selected ? responseType(selected) : null;
  const selectedHasRealDraft = !!(selected && selected.has_draft && selected.draft_id);

  return (
    <div className="space-y-6">
      <div data-tour="review-header">
        <PageHeader
          kicker="Arbeit"
          title="Freigaben"
          subtitle={
            isLoading
              ? "Lade …"
              : isError
                ? "Die Warteschlange konnte nicht geladen werden."
                : `${items.length} in der Warteschlange · ${withDraft} mit Entwurf, ${awaitingGen} warten auf Generierung.`
          }
          actions={
            <>
              {bulkEligible.length > 0 && (
                <Button size="sm" disabled={bulkRunning} onClick={runBulkApprove}>
                  {bulkRunning ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Gebe frei…
                    </>
                  ) : (
                    <>
                      <CheckCheck className="mr-1 h-3.5 w-3.5" /> Routine freigeben ({bulkEligible.length})
                    </>
                  )}
                </Button>
              )}
              {noSubjectCount > 0 && (
                <Button size="sm" variant="outline" disabled={dismissBulk.isPending} onClick={clearWithoutSubject}>
                  {dismissBulk.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Räume auf…
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Ohne Betreff verwerfen ({noSubjectCount})
                    </>
                  )}
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* Tastatur-Legende + Hinweis */}
      <div
        data-tour="review-verdict"
        className="space-y-2 rounded-[var(--radius)] border border-border bg-muted px-4 py-3 animate-fade-up"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5 text-primary" />
            Tastatur:
          </span>
          <Key k="F">freigeben</Key>
          <Key k="A">ablehnen</Key>
          <Key k="E">bearbeiten</Key>
          <Key k="↓ ↑">blättern</Key>
          <span className="ml-auto text-[11px] text-tx-weak">
            Kein Auto-Versand · Senden erfolgt immer durch dich
          </span>
        </div>
        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <span>{REVIEW.hint}</span>
        </p>
      </div>

      {/* Filter-Chips */}
      <div className="flex flex-wrap gap-1.5">
        {chips
          .filter((c) => c.key === "alle" || c.count > 0)
          .map((c) => (
            <Chip key={c.key} active={filter === c.key} count={c.count} onClick={() => setFilter(c.key)}>
              {c.label}
            </Chip>
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
      ) : isError ? (
        <QueryErrorNotice
          label="Die Freigabe-Warteschlange konnte nicht geladen werden."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<Inbox className="h-9 w-9 text-primary" />}
            title={REVIEW.empty}
            description={REVIEW.emptyDesc}
          />
        </SectionCard>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Liste (links) */}
          <div
            ref={listRef}
            className="glass-card overflow-hidden lg:max-h-[calc(100vh-19rem)] lg:overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  data-row={item.id}
                  onClick={() => pick(item.id)}
                  className={cn(
                    "w-full border-b border-l-2 border-line-soft px-4 py-3 text-left transition-colors last:border-b-0",
                    selectedId === item.id
                      ? "border-l-primary bg-emerald-surface/40"
                      : "border-l-transparent hover:bg-surface-hover",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <PriorityBadge priority={item.priority} />
                    {item.has_draft && !!item.draft_id && (
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        Entwurf
                      </span>
                    )}
                    <span className="ml-auto whitespace-nowrap text-[10px] text-tx-weak">
                      {new Date(item.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                  <p className="truncate text-[13px] font-medium">{prettyRedaction(item.subject)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.sender} · {humanizeCategory(item.action_type)}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Detail (rechts) */}
          {selected ? (
            <div className="glass-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-4">
                <ResponseTypeBadge type={rtSelected!} />
                <PriorityBadge priority={selected.priority} />
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {humanizeCategory(selected.action_type)}
                </span>
                <ShadowModePill mode={selected.autopilot_mode} />
                <span className="ml-auto whitespace-nowrap text-[11px] text-tx-weak">
                  {new Date(selected.created_at).toLocaleString("de-DE")}
                </span>
              </div>

              <div className="space-y-2 border-b border-line-soft px-5 py-4">
                <p className="text-sm font-semibold">{prettyRedaction(selected.subject)}</p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{selected.sender}</span>
                  {/* Kontakt-Dossier (memory-engine B1) */}
                  <ContactDossier sender={selected.sender} />
                </p>
              </div>

              {/* "Warum dieser Entwurf" — ausschliesslich Backend-Begruendungen. */}
              <div className="space-y-2 border-b border-line-soft bg-muted/40 px-5 py-4">
                <p className="ue-kicker">Warum dieser Entwurf</p>
                <ShadowWouldDoLine mode={selected.autopilot_mode} decision={selected.shadow_decision} />
                {/* v4.57.0 (J4): Warum dieses Label? — Quelle-Badge + Klartext-Satz */}
                <LabelReasonLine
                  text={selected.label_reason}
                  kind={selected.label_reason_kind}
                  source={selected.label_reason_source}
                  confidencePct={selected.label_reason_confidence_pct}
                />
                {!selected.label_reason && !selected.autopilot_mode && (
                  <p className="text-xs text-muted-foreground">
                    Für diesen Vorgang liegt keine Begründung vor.
                  </p>
                )}
              </div>

              <div className="space-y-3 px-5 py-4">
                {selectedHasRealDraft && selected.draft_body ? (
                  <>
                    <p className="ue-kicker">Vorbereiteter Entwurf</p>
                    <div className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line-soft bg-muted p-4 font-mono text-xs leading-relaxed">
                      {selected.draft_body}
                    </div>
                  </>
                ) : selectedHasRealDraft ? (
                  // Entwurf existiert, aber der Text kam nicht mit — dann NICHT
                  // "noch kein Entwurf" behaupten, waehrend die Freigabe-Buttons
                  // danebenstehen.
                  <p className="text-xs text-muted-foreground">
                    Der Entwurfstext wurde nicht mitgeliefert. Freigeben legt ihn trotzdem in dein Postfach.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{REVIEW.noDraftYet}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedHasRealDraft ? (
                    <ReviewVerdictButtons
                      key={selected.draft_id}
                      draftId={selected.draft_id!}
                      originalBody={selected.draft_body ?? ""}
                      openEditorSignal={editRequest}
                      onDone={stepAfterAction}
                    />
                  ) : rtSelected === "info" ? (
                    <>
                      <span className="px-2 text-xs text-muted-foreground">Kein Handlungsbedarf</span>
                      <DismissButton eventId={selected.id} />
                    </>
                  ) : (
                    <>
                      <GenerateDraftButton eventId={selected.id} />
                      <DismissButton eventId={selected.id} />
                    </>
                  )}
                </div>

                {/* 1-Klick-Label-Korrektur direkt im Freigaben-Detail
                    (gleicher Endpunkt + Lernschleife wie im Verlauf). */}
                <div className="space-y-2 border-t border-line-soft pt-3">
                  <p className="text-xs text-muted-foreground">
                    Falsch einsortiert? Kategorie korrigieren — UseEasy ersetzt das Label im Postfach und lernt daraus.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                      value={correctKey}
                      onChange={(e) => setCorrectKey(e.target.value)}
                      disabled={correctLabel.isPending}
                    >
                      <option value="">Kategorie wählen …</option>
                      {(me?.core_labels ?? []).map((c) => (
                        <option key={c.core_key} value={c.core_key}>
                          {c.display}
                        </option>
                      ))}
                      <option value="noise">Kein passendes Label (nur entfernen)</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={correctLabel.isPending || !correctKey}
                      onClick={() => {
                        const isNoise = correctKey === "noise";
                        const chosen = (me?.core_labels ?? []).find((c) => c.core_key === correctKey);
                        const label = isNoise ? "kein UseEasy-Label (entfernen)" : (chosen?.display ?? correctKey);
                        if (!window.confirm(`Label dieser E-Mail auf „${label}“ korrigieren?`)) return;
                        correctLabel.mutate(
                          { event_id: selected.id, to_core_key: correctKey },
                          {
                            onSuccess: (r) => {
                              toast.success(isNoise ? "UseEasy-Label entfernt." : `Label gesetzt: ${r.applied ?? label}`);
                              setCorrectKey("");
                            },
                            onError: onErr,
                          },
                        );
                      }}
                    >
                      {correctLabel.isPending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Tag className="mr-1 h-3.5 w-3.5" />
                      )}
                      Richtiges Label setzen
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <SectionCard>
              <EmptyState
                icon={<MailOpen className="h-8 w-8 text-primary" />}
                title="Links eine E-Mail auswählen."
                description="Oder mit ↓ und ↑ durch die Liste blättern."
              />
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

function Key({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-tx-secondary">
        {k}
      </kbd>
      {children}
    </span>
  );
}
