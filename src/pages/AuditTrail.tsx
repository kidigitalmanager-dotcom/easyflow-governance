import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { SpamRescueBadge, spamRescueAction } from "@/components/SpamRescueBadge"; // v4.122.0
import { useAuditLog, useUndoAction, useCorrectLabel, useUndoLabelCorrect, useMe } from "@/hooks/use-api";
import { ApiError, type AuditLogEntry } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getCurrentPlan } from "@/data/plan";
import { Download, X, Check, Send, Clock, ArrowRightLeft, User, Inbox, Loader2, RotateCcw, Ban, Tag, Bot, Search, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizePlaybook, humanizeDecision, humanizeCategory, humanizeReason, humanizeActor, humanizeConfidence, responseLabel, responseType } from "@/data/humanize";
import DecisionStory from "@/components/DecisionStory";
import { ContactDossier } from "@/components/ContactDossier";
import { LabelReasonLine } from "@/components/LabelReasonLine";

const priorities = ["Alle", "P0", "P1", "P2", "P3"] as const;

const ACTION_LABELS: Record<string, string> = {
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  sent: "Gesendet",
  pending: "Ausstehend",
  playbook_switch: "Playbook gewechselt",
  label_corrected: "Label korrigiert",          // Verlauf-Eintrag einer Label-Korrektur
  label_correct_undone: "Korrektur rückgängig", // Verlauf-Eintrag eines Rückgängig
  label_removed: "Label entfernt",
};

const actionIcons: Record<string, React.ReactNode> = {
  approved: <Check className="w-3.5 h-3.5 text-primary" />,
  rejected: <X className="w-3.5 h-3.5 text-destructive" />,
  sent: <Send className="w-3.5 h-3.5 text-p2" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  playbook_switch: <ArrowRightLeft className="w-3.5 h-3.5 text-p1" />,
  label_corrected: <Tag className="w-3.5 h-3.5 text-primary" />,
  label_correct_undone: <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />,
  label_removed: <X className="w-3.5 h-3.5 text-muted-foreground" />,
};

// audit_detail eines label_correct-/label_correct_undo-Eintrags (Backend schreibt
// das seit v4.19.0 als JSONB; /v1/dashboard/audit-log liefert es als audit_detail).
type CorrectionDetail = {
  target_event_id?: string;
  from_core_key?: string | null;
  to_core_key?: string;
  to_core_keys?: string[];
  applied?: string | null;
  restored_core_key?: string | null;
};

const isCorrectionEntry = (e: AuditLogEntry): boolean =>
  e.audit_action === "label_correct" || e.audit_action === "label_correct_undo";

const corrDetail = (e: AuditLogEntry): CorrectionDetail =>
  e.audit_detail && typeof e.audit_detail === "object" ? (e.audit_detail as CorrectionDetail) : {};

export default function AuditTrail() {
  const plan = getCurrentPlan();
  const { data: auditData, isLoading, error } = useAuditLog();
  const undo = useUndoAction();
  const correctLabel = useCorrectLabel();
  const undoCorrect = useUndoLabelCorrect();
  const { data: me } = useMe();
  const [correctKey, setCorrectKey] = useState<string>("");
  // P1.2: Inline-Bestätigung statt window.confirm (Safari-Fokus + Wertigkeit).
  const [confirmCorrect, setConfirmCorrect] = useState(false);
  // P1.3: optimistisches "Aktuell gesetzt" je Mail (Session-Sicht, gewinnt über
  // den read-time-Wert des Backends, der die Korrektur nicht kennt).
  const [labelOverrides, setLabelOverrides] = useState<Record<string, { label: string | null; coreKey: string | null }>>({});
  // P1.4: Session-Undo — vor der Mutation gemerkter Alt-Zustand je Mail.
  const [sessionUndo, setSessionUndo] = useState<Record<string, { fromKey: string | null; fromLabel: string; toKey: string; toLabel: string; undone: boolean }>>({});
  const [selectedPriority, setSelectedPriority] = useState<string>("Alle");
  // Redesign Follow-up: ?item=<event_id> oeffnet das Detail direkt (Cmd-K-Suche).
  const [selectedEntry, setSelectedEntry] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item"));
  // Redesign Follow-up: ?q=<text> als Volltext-Filter (Betreff/Postfach/Kategorie).
  const [textQuery, setTextQuery] = useState<string>(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("q") ?? ""));
  // v4.43.0: Shadow-only Drill-down (von der Uebersicht-Kachel ?shadow=1).
  const [searchParams] = useSearchParams();
  const [shadowOnly, setShadowOnly] = useState(searchParams.get("shadow") === "1");

  const entries = auditData ?? [];

  // Beim Wechsel des Eintrags Auswahl + Inline-Bestätigung zurücksetzen.
  useEffect(() => {
    setCorrectKey("");
    setConfirmCorrect(false);
  }, [selectedEntry]);

  // Overlay-Panel: Escape schließt das Detail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedEntry(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = textQuery.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (selectedPriority !== "Alle" && entry.priority !== selectedPriority) return false;
    if (shadowOnly && !entry.shadow_decision) return false;
    if (q) {
      const hay = `${entry.subject ?? ""} ${entry.mailbox ?? ""} ${humanizeCategory(entry.category)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const detail = entries.find((e) => e.id === selectedEntry);
  const detailIsCorrection = !!detail && isCorrectionEntry(detail);

  // ── Anzeige-Helfer für Core-Keys (Displays aus /me, wie im Picker) ──────────
  const displayForKey = (key: string | null | undefined): string => {
    if (!key || key === "noise") return "kein UseEasy-Label";
    const c = (me?.core_labels ?? []).find((x) => x.core_key === key);
    return c?.display ?? key;
  };
  const corrToDisplay = (cd: CorrectionDetail): string => {
    const keys = cd.to_core_keys && cd.to_core_keys.length ? cd.to_core_keys : cd.to_core_key ? [cd.to_core_key] : [];
    if (!keys.length || keys[0] === "noise") return "kein UseEasy-Label";
    return keys.map((k) => displayForKey(k)).join(" + ");
  };

  // Jüngstes Korrektur-Ereignis zu einer Mail (Liste ist DESC sortiert).
  const latestCorrectionEntry = (target?: string): AuditLogEntry | undefined =>
    target ? entries.find((e) => isCorrectionEntry(e) && corrDetail(e).target_event_id === target) : undefined;

  // "Aktuell gesetzt" read-time herleiten: Session-Override gewinnt; sonst das
  // jüngste label_correct/-undo-Ereignis (überlebt Reload); sonst Backend-Wert.
  let appliedLabel: string | null = detail?.applied_label ?? null;
  let appliedCoreKey: string | null = detail?.applied_core_key ?? null;
  if (detail && !detailIsCorrection) {
    const corrEvt = latestCorrectionEntry(detail.id);
    if (corrEvt) {
      const cd = corrDetail(corrEvt);
      if (corrEvt.audit_action === "label_correct") {
        const keys = cd.to_core_keys && cd.to_core_keys.length ? cd.to_core_keys : cd.to_core_key ? [cd.to_core_key] : [];
        appliedCoreKey = keys.length && keys[0] !== "noise" ? keys[0] : null;
        appliedLabel = keys.length && keys[0] !== "noise" ? corrToDisplay(cd) : null;
      } else {
        appliedCoreKey = cd.restored_core_key ?? null;
        appliedLabel = cd.restored_core_key ? displayForKey(cd.restored_core_key) : null;
      }
    }
    const ov = labelOverrides[detail.id];
    if (ov !== undefined) {
      appliedLabel = ov.label;
      appliedCoreKey = ov.coreKey;
    }
  }

  // ── Fehlertexte (Briefing: sprechende Meldung statt stillem Fail) ───────────
  const mailboxErrorMessage = (e: unknown, action: "correct" | "undo"): string => {
    const base = action === "correct" ? "Korrektur nicht ausgeführt" : "Rückgängig nicht ausgeführt";
    const msg = e instanceof Error ? e.message : String(e ?? "");
    const status = e instanceof ApiError ? e.status : null;
    if (status === 502 || status === 500 || /token_refresh_failed|reauth|provider_unresolved|apply_.*failed|label_.*failed/i.test(msg))
      return `Postfach gerade nicht erreichbar - ${base}. Bitte die Postfach-Verbindung unter Datenquellen prüfen und erneut versuchen.`;
    if (/no_target_id/i.test(msg)) return `${base}: Diese E-Mail ist im Postfach nicht (mehr) auffindbar.`;
    if (/no_correction_found/i.test(msg)) return "Keine (weitere) Korrektur zu dieser E-Mail gefunden - vermutlich bereits rückgängig gemacht.";
    return `${base}: ${msg}`;
  };

  // ── Rückgängig (P1.4/P1.5): bevorzugt POST /label/correct/undo (v4.129.0,
  // markiert die Korrektur als reverted -> Lernschleife bleibt sauber). Kennt das
  // deployte Backend die Route noch nicht (404), Legacy-Weg: correctLabel mit dem
  // ALTEN core_key (Briefing P1.4 — funktioniert ohne Backend-Änderung). ─────────
  const applyUndoResult = (targetId: string, restoredKey: string | null, opts?: { migrationMissing?: boolean; legacy?: boolean }) => {
    const restoredLabel = restoredKey && restoredKey !== "noise" ? displayForKey(restoredKey) : null;
    setLabelOverrides((p) => ({ ...p, [targetId]: { label: restoredLabel, coreKey: restoredKey === "noise" ? null : restoredKey } }));
    setSessionUndo((p) => (p[targetId] ? { ...p, [targetId]: { ...p[targetId], undone: true } } : p));
    toast.success(restoredLabel ? `Vorheriges Label wiederhergestellt: ${restoredLabel}` : "UseEasy-Label entfernt - vorheriger Zustand wiederhergestellt.");
    if (opts?.migrationMissing) toast.info("Hinweis: Die Lern-Markierung (reverted) greift erst nach der DB-Migration.");
    else if (opts?.legacy) toast.info("Rückgängig über den Kompatibilitätsweg ausgeführt (Backend-Undo noch nicht aktiv) - zählt als neue Korrektur zum alten Label.");
  };

  const doUndo = (targetId: string, fallbackFromKey: string | null) => {
    undoCorrect.mutate({ event_id: targetId }, {
      onSuccess: (r) => applyUndoResult(targetId, r.restored_core_key ?? null, { migrationMissing: r.migration_missing }),
      onError: (e) => {
        if (e instanceof ApiError && e.status === 404) {
          const legacyKey = fallbackFromKey && fallbackFromKey !== "noise" ? fallbackFromKey : "noise";
          correctLabel.mutate({ event_id: targetId, to_core_key: legacyKey }, {
            onSuccess: () => applyUndoResult(targetId, legacyKey, { legacy: true }),
            onError: (e2) => toast.error(mailboxErrorMessage(e2, "undo")),
          });
          return;
        }
        toast.error(mailboxErrorMessage(e, "undo"));
      },
    });
  };

  // ── Korrektur absenden (nach Inline-Bestätigung) ────────────────────────────
  const submitCorrection = () => {
    if (!detail || !correctKey) return;
    const isNoise = correctKey === "noise";
    const chosen = (me?.core_labels ?? []).find((c) => c.core_key === correctKey);
    const newLabel = isNoise ? "kein UseEasy-Label" : (chosen?.display ?? correctKey);
    const fromKey = appliedCoreKey ?? null;
    const fromLabel = appliedLabel ?? "kein UseEasy-Label";
    correctLabel.mutate({ event_id: detail.id, to_core_key: correctKey }, {
      onSuccess: (r) => {
        toast.success(isNoise ? "UseEasy-Label entfernt." : `Label gesetzt: ${r.applied ?? newLabel}`);
        setLabelOverrides((p) => ({ ...p, [detail.id]: { label: isNoise ? null : newLabel, coreKey: isNoise ? null : correctKey } }));
        setSessionUndo((p) => ({ ...p, [detail.id]: { fromKey, fromLabel, toKey: correctKey, toLabel: newLabel, undone: false } }));
        setCorrectKey("");
        setConfirmCorrect(false);
      },
      onError: (e) => {
        setConfirmCorrect(false);
        toast.error(mailboxErrorMessage(e, "correct"));
      },
    });
  };

  // Redesign Follow-up: der Export-Button war bisher ohne Funktion — client-seitiger
  // CSV-Export der GEFILTERTEN Liste (BOM + Semikolon fuer deutsches Excel).
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Zeitpunkt", "Betreff", "Postfach", "Priorität", "Kategorie", "Entscheidung", "Grund", "Konfidenz", "Aktion", "Akteur"];
    const lines = filtered.map((e) => [
      e.timestamp, e.subject, e.mailbox, e.priority, humanizeCategory(e.category),
      humanizeDecision(e.decision), humanizeReason(e.reason), humanizeConfidence(e.confidence),
      ACTION_LABELS[e.user_action] || e.user_action, humanizeActor(e.actor),
    ].map(esc).join(";"));
    const csv = "\uFEFF" + [header.map(esc).join(";"), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `useeasy-verlauf_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} Einträge als CSV exportiert.`);
  };

  const anyCorrectPending = correctLabel.isPending || undoCorrect.isPending;

  return (
    <div className="space-y-6">
      <div data-tour="audit-header">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">Vollständige Dokumentation aller UseEasy-Entscheidungen.</p>
      </div>

      {/* Filter bar */}
      <div data-tour="audit-filter" className="flex flex-wrap items-center gap-3">
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
        <label className="relative inline-flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
          <input
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            placeholder="Betreff, Absender, Kategorie …"
            className="pl-8 pr-3 py-1.5 rounded-md text-xs bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
          />
        </label>
        <button
          onClick={() => setShadowOnly((v) => !v)}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            shadowOnly
              ? "bg-sky-500/15 text-sky-500 border border-sky-500/30"
              : "text-muted-foreground hover:text-foreground border border-border hover:bg-muted/30"
          }`}
          title="Nur Mails zeigen, für die der Autopilot einen Vorschlag hätte"
        >
          <Bot className="w-3 h-3" /> Nur Autopilot-Vorschläge
        </button>
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
            {filtered.map((entry) => {
              // P1.5: Label-Korrektur-/Rückgängig-Einträge als eigene Zeile mit
              // Von -> Zu + direktem Rückgängig-Button (div statt button, weil ein
              // Button nicht in einem Button stehen darf).
              if (isCorrectionEntry(entry)) {
                const cd = corrDetail(entry);
                const isUndoRow = entry.audit_action === "label_correct_undo";
                const target = entries.find((e) => e.id === cd.target_event_id);
                const latest = latestCorrectionEntry(cd.target_event_id);
                const canUndo = !isUndoRow && !!cd.target_event_id && latest?.id === entry.id && !sessionUndo[cd.target_event_id ?? ""]?.undone;
                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEntry(entry.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedEntry(entry.id); } }}
                    className={`w-full text-left glass-card-hover p-4 transition-all cursor-pointer ${
                      selectedEntry === entry.id ? "border-primary/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {isUndoRow ? <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> : <Tag className="w-3.5 h-3.5 text-primary" />}
                          <span className="text-xs font-medium text-muted-foreground">
                            {isUndoRow ? "Korrektur rückgängig gemacht" : "Label-Korrektur"}
                          </span>
                        </div>
                        <p className="text-sm">
                          {isUndoRow ? (
                            <>Wieder auf <span className="font-medium">{displayForKey(cd.restored_core_key ?? null)}</span> gesetzt</>
                          ) : (
                            <>
                              <span className="text-muted-foreground">{displayForKey(cd.from_core_key ?? null)}</span>
                              <ArrowRight className="w-3.5 h-3.5 inline mx-1 text-muted-foreground" />
                              <span className="font-medium">{corrToDisplay(cd)}</span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {target ? target.subject : "E-Mail"} · {entry.timestamp}
                        </p>
                      </div>
                      {canUndo && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={anyCorrectPending}
                          onClick={(ev) => { ev.stopPropagation(); doUndo(cd.target_event_id as string, cd.from_core_key ?? null); }}
                        >
                          {undoCorrect.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                          Rückgängig
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }
              return (
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
                      {spamRescueAction(entry.audit_action) && (
                        <SpamRescueBadge action={spamRescueAction(entry.audit_action)!} />
                      )}
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
              );
            })}
          </div>

          {/* Detail drawer — FIXES Overlay-Panel über die volle Fensterhöhe:
              Inhalt scrollt innen, die Label-Korrektur ist als Footer IMMER ohne
              Scrollen sichtbar — unabhängig davon, wie viel Banner/Titel/Filter
              über der Liste stehen und wie weit die Seite gescrollt ist (P1.1).
              Vorher (sticky in-flow + max-h) begann die Leiste unter dem roten
              Postfach-Banner und ragte unter den Viewport -> Button erst nach
              Scrollen ans Seitenende sichtbar (Leon-Screenshot 21.07., 17:01).
              Der leere Spacer hält die Listenbreite wie bisher (Layout stabil).
              z-50 liegt bewusst ÜBER dem Jana-FAB (z-40), damit der FAB nicht
              den Footer-Button überdeckt. */}
          {detail && (
            <>
              <div className="hidden lg:block w-96 flex-shrink-0" aria-hidden="true" />
              <div
                role="dialog"
                aria-label="Verlauf-Detail"
                className="fixed inset-y-0 right-0 z-50 w-96 max-w-[94vw] flex flex-col overflow-hidden bg-card border-l border-border shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
              >
              <div className="p-6 pb-3 space-y-4 overflow-y-auto min-h-0 flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">{detailIsCorrection ? "Label-Korrektur" : "Details"}</h2>
                  <button
                    onClick={() => setSelectedEntry(null)}
                    aria-label="Detail-Ansicht schließen"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {detailIsCorrection ? (
                  (() => {
                    const cd = corrDetail(detail);
                    const isUndoRow = detail.audit_action === "label_correct_undo";
                    const target = entries.find((e) => e.id === cd.target_event_id);
                    return (
                      <div className="space-y-3">
                        <div className="rounded-md border border-border p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">{isUndoRow ? "Rückgängig gemacht" : "Korrigiert"}</p>
                          <p className="text-sm">
                            {isUndoRow ? (
                              <>Wieder auf <span className="font-medium">{displayForKey(cd.restored_core_key ?? null)}</span> gesetzt</>
                            ) : (
                              <>
                                <span className="text-muted-foreground">{displayForKey(cd.from_core_key ?? null)}</span>
                                <ArrowRight className="w-3.5 h-3.5 inline mx-1 text-muted-foreground" />
                                <span className="font-medium">{corrToDisplay(cd)}</span>
                              </>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">Zeitpunkt: {detail.timestamp}</p>
                        </div>
                        {target && (
                          <div className="rounded-md border border-border p-3 space-y-1.5">
                            <p className="text-xs text-muted-foreground">Betroffene E-Mail</p>
                            <p className="text-sm font-medium">{target.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">{target.mailbox}</p>
                            <button
                              onClick={() => setSelectedEntry(target.id)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Zur E-Mail
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {isUndoRow
                            ? "Diese Korrektur wurde zurückgenommen und fließt nicht mehr als Lernsignal in Regel-Vorschläge oder die KI-Einordnung ein."
                            : "Die Korrektur wurde im Postfach ausgeführt und als Lernsignal gespeichert. UseEasy schlägt bei wiederholten Korrekturen eine feste Regel vor."}
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-1">
                      <span className="truncate">{detail.mailbox}</span>
                      {/* Redesign Follow-up: Kontakt-Dossier auch aus dem Verlauf heraus */}
                      <ContactDossier sender={detail.mailbox} />
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

                        {spamRescueAction(detail.audit_action) && (
                          <div>
                            <span className="text-muted-foreground">Spam-Schutz:</span>
                            <div className="mt-1"><SpamRescueBadge action={spamRescueAction(detail.audit_action)!} /></div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {spamRescueAction(detail.audit_action) === "spam_rescue"
                                ? "Diese E-Mail lag im Spam-Ordner. UseEasy hat sie geprüft (kein Phishing-Signal) und automatisch in den Posteingang zurückgeholt."
                                : "Phishing-/Betrugs-Signal erkannt — die E-Mail wurde bewusst NICHT aus dem Spam geholt."}
                            </p>
                          </div>
                        )}

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

                    {/* v4.57.0 (J4): Warum dieses Label? — gleiche Backend-Quelle wie MiniUI/Review-Queue */}
                    {detail.label_reason && (
                      <div className="pt-3 border-t border-border space-y-1">
                        <p className="text-xs text-muted-foreground">Warum dieses Label?</p>
                        <LabelReasonLine
                          text={detail.label_reason}
                          kind={detail.label_reason_kind}
                          source={detail.label_reason_source}
                          confidencePct={detail.label_reason_confidence_pct}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="pt-3 border-t border-border">
                  {plan.exportEnabled ? (
                    <button onClick={exportCsv} className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full justify-center">
                      <Download className="w-4 h-4" /> Exportieren (CSV, {filtered.length})
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

              {/* ── Footer: immer sichtbar, scrollt NICHT mit (P1.1) ── */}
              {detailIsCorrection ? (
                (() => {
                  const cd = corrDetail(detail);
                  const isUndoRow = detail.audit_action === "label_correct_undo";
                  const latest = latestCorrectionEntry(cd.target_event_id);
                  const canUndo = !isUndoRow && !!cd.target_event_id && latest?.id === detail.id && !sessionUndo[cd.target_event_id ?? ""]?.undone;
                  return (
                    <div className="px-6 py-4 border-t border-border shrink-0 space-y-2">
                      {canUndo ? (
                        <>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Stellt das vorherige Label im Postfach wieder her; eigene Labels bleiben unberührt.
                          </p>
                          <Button size="sm" variant="outline" className="w-full justify-center"
                            disabled={anyCorrectPending}
                            onClick={() => doUndo(cd.target_event_id as string, cd.from_core_key ?? null)}>
                            {undoCorrect.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                            Korrektur rückgängig machen
                          </Button>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {isUndoRow
                            ? "Diese Korrektur wurde bereits rückgängig gemacht."
                            : "Nicht mehr rückgängig machbar - es gibt bereits eine neuere Aktion zu dieser E-Mail."}
                        </p>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="px-6 py-4 border-t border-border shrink-0 space-y-2">
                  <p className="text-xs text-muted-foreground">Postfach-Label korrigieren</p>
                  <p className="text-xs">
                    Aktuell gesetzt: <span className="font-medium text-foreground">{appliedLabel ?? "kein UseEasy-Label"}</span>
                  </p>
                  <select
                    className="w-full text-sm rounded-md border border-border bg-background text-foreground px-2 py-1.5 disabled:opacity-60"
                    value={correctKey}
                    onChange={(e) => { setCorrectKey(e.target.value); setConfirmCorrect(false); }}
                    disabled={correctLabel.isPending}
                  >
                    <option value="">Kategorie wählen …</option>
                    {(me?.core_labels ?? []).map((c) => (
                      <option key={c.core_key} value={c.core_key}>
                        {c.display}{c.core_key === appliedCoreKey ? " (aktuell)" : ""}
                      </option>
                    ))}
                    <option value="noise">Kein passendes Label (nur entfernen)</option>
                  </select>
                  {!confirmCorrect ? (
                    <Button size="sm" variant="outline" className="w-full justify-center"
                      disabled={correctLabel.isPending || !correctKey}
                      onClick={() => setConfirmCorrect(true)}>
                      {correctLabel.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Tag className="w-3.5 h-3.5 mr-1" />}
                      Richtiges Label setzen
                    </Button>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs leading-snug">
                        Wirklich ersetzen? Das aktuelle UseEasy-Label wird durch{" "}
                        <span className="font-medium">
                          {correctKey === "noise" ? "kein UseEasy-Label (entfernen)" : displayForKey(correctKey)}
                        </span>{" "}
                        ersetzt; eigene Labels bleiben unberührt.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 justify-center" disabled={correctLabel.isPending} onClick={submitCorrection}>
                          {correctLabel.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                          Ja, ersetzen
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 justify-center" disabled={correctLabel.isPending}
                          onClick={() => setConfirmCorrect(false)}>
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  )}
                  {sessionUndo[detail.id] && !sessionUndo[detail.id].undone && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5">
                      <p className="text-xs min-w-0 truncate">
                        Korrigiert: <span className="text-muted-foreground">{sessionUndo[detail.id].fromLabel}</span>
                        <ArrowRight className="w-3 h-3 inline mx-1 text-muted-foreground" />
                        <span className="font-medium">{sessionUndo[detail.id].toLabel}</span>
                      </p>
                      <button
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0"
                        disabled={anyCorrectPending}
                        onClick={() => doUndo(detail.id, sessionUndo[detail.id].fromKey)}
                      >
                        Rückgängig
                      </button>
                    </div>
                  )}
                  {sessionUndo[detail.id]?.undone && (
                    <p className="text-[11px] text-muted-foreground">
                      Rückgängig gemacht - {sessionUndo[detail.id].fromLabel} wiederhergestellt.
                    </p>
                  )}
                </div>
              )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
