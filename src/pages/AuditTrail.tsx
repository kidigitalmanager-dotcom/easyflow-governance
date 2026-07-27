import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ResponseTypeBadge } from "@/components/ResponseTypeBadge";
import { SpamRescueBadge, spamRescueAction } from "@/components/SpamRescueBadge"; // v4.122.0
import { useAuditLog, useUndoAction, useCorrectLabel, useUndoLabelCorrect, useMe } from "@/hooks/use-api";
import { ApiError, type AuditLogEntry } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { toast } from "sonner";
import { getCurrentPlan } from "@/data/plan";
import { Download, X, Check, Send, Clock, ArrowRightLeft, User, Inbox, Loader2, RotateCcw, Ban, Tag, Bot, Search, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizePlaybook, humanizeDecision, humanizeCategory, humanizeReason, humanizeActor, humanizeConfidence, responseLabel, responseType, prettyRedaction } from "@/data/humanize";
import DecisionStory from "@/components/DecisionStory";
import { ContactDossier } from "@/components/ContactDossier";
import { LabelReasonLine } from "@/components/LabelReasonLine";
import { PageHeader, SectionCard, Chip, EmptyState, Dot } from "@/components/ue/primitives";
import { cn } from "@/lib/utils";

/* Verlauf (Navigation: „Verlauf", Route /audit) — Redesign 27.07.2026.
 *
 * Die Liste liest sich jetzt als Tabelle Zeit · Akteur · Aktion · Objekt ·
 * Ergebnis. Uebersetzt wird ausschliesslich mit den Helfern aus
 * @/data/humanize — die Console haelt KEINE zweite Uebersetzungstabelle, sonst
 * driften Verlauf und Freigaben auseinander.
 *
 * Grundregeln: Fehler != leer (QueryErrorNotice statt „Noch keine Eintraege"),
 * keine erfundenen Werte, Farben nur aus den Tokens.
 */

const priorities = ["Alle", "P0", "P1", "P2", "P3"] as const;

/* Zeitraum als Chip-Reihe (Design-Briefing). Default 7 Tage: der Verlauf waechst
   taeglich, und „alles seit Beginn" ist beim Reinschauen selten die Frage.
   days === null heisst „ohne Grenze". */
const RANGES = [
  { key: "7", label: "7 Tage", days: 7 },
  { key: "30", label: "30 Tage", days: 30 },
  { key: "all", label: "Alle", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

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

/* Der Server liefert `timestamp` als ISO-String (so liest ihn auch LiveActivity).
   Bisher stand er ROH in der Liste — hier deutsch formatiert. Laesst er sich
   nicht parsen, bleibt der Rohwert stehen: lieber unschoen als eine erfundene
   Zeit. */
function fmtWhen(raw?: string): string {
  const t = Date.parse(String(raw ?? ""));
  if (!Number.isFinite(t)) return String(raw ?? "–");
  return new Date(t).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/* Zeitraum-Test. Nicht parsebare Zeitstempel bleiben SICHTBAR — eine Zeile zu
   viel ist harmlos, eine still verschwundene waere ein Datenverlust im Beleg. */
function inRange(raw: string | undefined, days: number | null, now: number): boolean {
  if (days === null) return true;
  const t = Date.parse(String(raw ?? ""));
  if (!Number.isFinite(t)) return true;
  return t >= now - days * 86_400_000;
}

export default function AuditTrail() {
  const plan = getCurrentPlan();
  const { data: auditData, isLoading, isError, refetch, isFetching } = useAuditLog();
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
  /* Zeitraum. Ausnahme vom Default: kommt die Seite ueber einen Deep-Link
     (?item= oder ?q=), starten wir bei „Alle" — sonst landet eine Cmd-K-Suche
     nach einem aelteren Vorgang auf einer scheinbar leeren Liste. */
  const [range, setRange] = useState<RangeKey>(() => {
    if (typeof window === "undefined") return "7";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("item") || sp.get("q") ? "all" : "7";
  });

  const entries = useMemo(() => auditData ?? [], [auditData]);

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
  const activeRange = RANGES.find((r) => r.key === range);
  const rangeDays = activeRange?.days ?? null;
  /* Der CSV-Export schreibt die GEFILTERTE Liste — beim Default „7 Tage" also
     nur eine Woche. Der Umfang gehoert deshalb sichtbar an den Knopf, sonst
     haelt jemand den Teil-Export fuer den vollstaendigen Beleg. */
  const rangeLabel = activeRange?.label ?? "Alle";

  /* Ein Durchlauf, mehrere Sichten: die Chip-Zaehler zeigen jeweils, was die
     ANDEREN Filter uebrig lassen. Sonst stuende hinter „30 Tage" die Zahl des
     gerade aktiven 7-Tage-Filters — eine irrefuehrende Zahl. */
  const { filtered, rangeCounts, prioCounts, olderHidden } = useMemo(() => {
    const now = Date.now();
    const marked = entries.map((e) => ({
      e,
      prioOk: selectedPriority === "Alle" || e.priority === selectedPriority,
      shadowOk: !shadowOnly || !!e.shadow_decision,
      qOk: !q || `${e.subject ?? ""} ${e.mailbox ?? ""} ${humanizeCategory(e.category)}`.toLowerCase().includes(q),
      rangeOk: inRange(e.timestamp, rangeDays, now),
    }));
    const exceptRange = marked.filter((m) => m.prioOk && m.shadowOk && m.qOk);
    const visible = exceptRange.filter((m) => m.rangeOk);
    return {
      filtered: visible.map((m) => m.e),
      olderHidden: exceptRange.length - visible.length,
      rangeCounts: Object.fromEntries(
        RANGES.map((r) => [r.key, exceptRange.filter((m) => inRange(m.e.timestamp, r.days, now)).length]),
      ) as Record<RangeKey, number>,
      prioCounts: Object.fromEntries(
        priorities.map((p) => [
          p,
          marked.filter((m) => m.shadowOk && m.qOk && m.rangeOk && (p === "Alle" || m.e.priority === p)).length,
        ]),
      ) as Record<string, number>,
    };
  }, [entries, selectedPriority, shadowOnly, q, rangeDays]);

  const filtersActive = selectedPriority !== "Alle" || shadowOnly || q.length > 0;

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

  /* Redesign Follow-up: der Export-Button war bisher ohne Funktion — client-seitiger
     CSV-Export der GEFILTERTEN Liste (BOM + Semikolon fuer deutsches Excel).
     Spalten fuehren mit Zeit · Akteur · Aktion · Objekt · Ergebnis (Briefing);
     die uebrigen Felder bleiben dahinter erhalten, damit der Export nichts
     verliert. Der Anker muss im DOM haengen — sonst loest Firefox den Download
     nicht aus; revoke erst danach, sonst bricht Safari ihn ab. */
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Zeit", "Akteur", "Aktion", "Objekt", "Ergebnis",
      "Postfach", "Priorität", "Kategorie", "Grund", "Konfidenz", "Zeitstempel (ISO)",
    ];
    const lines = filtered.map((e) => [
      fmtWhen(e.timestamp),
      humanizeActor(e.actor),
      humanizeDecision(e.decision),
      prettyRedaction(e.subject),
      ACTION_LABELS[e.user_action] || e.user_action,
      e.mailbox,
      e.priority,
      humanizeCategory(e.category),
      humanizeReason(e.reason),
      humanizeConfidence(e.confidence),
      e.timestamp,
    ].map(esc).join(";"));
    const csv = "﻿" + [header.map(esc).join(";"), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `useeasy-verlauf_${new Date().toISOString().slice(0, 10)}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${filtered.length} Einträge als CSV exportiert.`);
  };

  const anyCorrectPending = correctLabel.isPending || undoCorrect.isPending;

  return (
    <div className="space-y-6">
      <div data-tour="audit-header">
        <PageHeader
          kicker="Verlauf"
          title="Jede Entscheidung, nachvollziehbar"
          subtitle="Zeit, Akteur, Aktion, Objekt und Ergebnis — vollständige Dokumentation aller UseEasy-Entscheidungen. Klick eine Zeile an, um Begründung und gesetztes Label zu sehen."
          actions={
            plan.exportEnabled ? (
              /* Fehler != leer: ohne geladenen Verlauf waere `filtered` leer — der
                 Knopf haette "(0)" angeboten, eine Datei mit nur der Kopfzeile
                 geschrieben und "0 Eintraege exportiert" gemeldet. Genau dieser
                 Beleg darf nicht falsch entwarnen. */
              /* Kein stiller Umfang: Beschriftung und Titel nennen den aktiven
                 Zeitraum, daneben steht bei gesetzter Zeitgrenze der Hinweis auf
                 die sichtbaren Zeilen. Vorher stand am Knopf nur "CSV-Export" —
                 der Default-Zeitraum schnitt den Beleg unbemerkt auf 7 Tage. */
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={isLoading || isError}
                  title={
                    isError
                      ? "Der Verlauf konnte nicht geladen werden — ein Export wäre unvollständig."
                      : `CSV-Export · Zeitraum ${rangeLabel}${filtersActive ? " · aktive Filter" : ""} — exportiert werden genau die sichtbaren Zeilen.`
                  }
                >
                  <Download className="h-4 w-4" /> CSV-Export · {rangeLabel}
                  {isLoading || isError ? "" : ` (${filtered.length})`}
                </Button>
                {rangeDays !== null && !isLoading && !isError && (
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    Nur die sichtbaren Zeilen (letzte {rangeDays} Tage).
                  </span>
                )}
              </div>
            ) : (
              <Button variant="outline" size="sm" disabled title="Der CSV-Export ist ab dem Scale-Plan enthalten.">
                <Download className="h-4 w-4" /> Export (ab Scale-Plan)
              </Button>
            )
          }
        />
      </div>

      {/* ── Filter: Zeitraum · Priorität · Autopilot · Volltext ───────────── */}
      <div data-tour="audit-filter" className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ue-kicker mr-0.5">Zeitraum</span>
          {RANGES.map((r) => (
            /* Kein erfundener Zaehler: ohne Daten (laedt/Fehler) steht am Chip gar
               nichts statt einer 0 — sonst behaupteten acht Nullen ueber der
               Fehlermeldung, es gebe schlicht keine Eintraege. */
            <Chip
              key={r.key}
              active={range === r.key}
              count={isLoading || isError ? undefined : rangeCounts[r.key]}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ue-kicker mr-0.5">Priorität</span>
          {priorities.map((p) => (
            <Chip
              key={p}
              active={selectedPriority === p}
              count={isLoading || isError ? undefined : prioCounts[p]}
              onClick={() => setSelectedPriority(p)}
            >
              {p}
            </Chip>
          ))}
        </div>

        <span title="Nur Mails zeigen, für die der Autopilot einen Vorschlag hätte">
          <Chip active={shadowOnly} onClick={() => setShadowOnly((v) => !v)}>
            <Bot className="h-3 w-3" /> Nur Autopilot-Vorschläge
          </Chip>
        </span>

        <label className="relative inline-flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            aria-label="Verlauf durchsuchen"
            placeholder="Betreff, Absender, Kategorie …"
            className="w-56 rounded-full border border-border bg-muted py-1 pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary/35 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <SectionCard
            title="Entscheidungen"
            subtitle={
              isLoading || isError
                ? undefined
                : `${filtered.length} ${filtered.length === 1 ? "Eintrag" : "Einträge"}${
                    rangeDays === null ? " insgesamt" : ` in den letzten ${rangeDays} Tagen`
                  }`
            }
            bodyClassName="p-0"
          >
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              /* Fehler != leer: ein kaputter Verlauf darf nicht wie „noch nichts
                 passiert" aussehen — gerade hier, wo es um den Beleg geht. */
              <div className="p-4">
                <QueryErrorNotice
                  label="Der Verlauf konnte nicht geladen werden."
                  onRetry={() => refetch()}
                  retrying={isFetching}
                />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-7 w-7" />}
                title={
                  olderHidden > 0
                    ? "Nichts im gewählten Zeitraum"
                    : filtersActive
                      ? "Keine Treffer"
                      : "Noch keine Einträge"
                }
                description={
                  olderHidden > 0
                    ? `${olderHidden} ${olderHidden === 1 ? "älterer Eintrag liegt" : "ältere Einträge liegen"} außerhalb der letzten ${rangeDays} Tage.`
                    : filtersActive
                      ? "Kein Eintrag passt zu den gesetzten Filtern."
                      : "Sobald E-Mails verarbeitet werden, erscheinen sie hier."
                }
                action={
                  olderHidden > 0 ? (
                    <Button variant="outline" size="sm" onClick={() => setRange("all")}>
                      Alle anzeigen
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
                    <colgroup>
                      <col className="w-[128px]" />
                      <col className="w-[152px]" />
                      <col className="w-[196px]" />
                      <col />
                      <col className="w-[176px]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-line-soft">
                        {["Zeit", "Akteur", "Aktion", "Objekt", "Ergebnis"].map((h) => (
                          <th key={h} scope="col" className="ue-kicker px-4 py-2.5 text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {filtered.map((entry) => {
                        const isSelected = selectedEntry === entry.id;
                        const rowClass = cn(
                          "cursor-pointer align-top transition-colors hover:bg-surface-hover",
                          isSelected && "bg-surface-hover",
                        );

                        // P1.5: Label-Korrektur-/Rückgängig-Einträge als eigene Zeile mit
                        // Von -> Zu + direktem Rückgängig-Button. In der Tabelle ist der
                        // Button unproblematisch (kein Button im Button mehr).
                        if (isCorrectionEntry(entry)) {
                          const cd = corrDetail(entry);
                          const isUndoRow = entry.audit_action === "label_correct_undo";
                          const target = entries.find((e) => e.id === cd.target_event_id);
                          const latest = latestCorrectionEntry(cd.target_event_id);
                          const canUndo = !isUndoRow && !!cd.target_event_id && latest?.id === entry.id && !sessionUndo[cd.target_event_id ?? ""]?.undone;
                          return (
                            <tr key={entry.id} className={rowClass} onClick={() => setSelectedEntry(entry.id)}>
                              <td className="tabular px-4 py-2.5 text-[11.5px] text-muted-foreground">
                                {fmtWhen(entry.timestamp)}
                              </td>
                              <td className="truncate px-4 py-2.5 text-[12px] text-tx-secondary">
                                {humanizeActor(entry.actor)}
                              </td>
                              <td className="px-4 py-2.5 text-[12px]">
                                <span className="flex items-center gap-1.5">
                                  {isUndoRow ? (
                                    <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <Tag className="h-3.5 w-3.5 shrink-0 text-primary" />
                                  )}
                                  <span className="truncate">
                                    {isUndoRow ? "Korrektur rückgängig gemacht" : "Label-Korrektur"}
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntry(entry.id)}
                                  className="block w-full truncate text-left text-[13px] font-medium transition-colors hover:text-primary"
                                >
                                  {target ? prettyRedaction(target.subject) : "E-Mail"}
                                </button>
                                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                  {isUndoRow ? (
                                    <span className="truncate">
                                      wieder auf {displayForKey(cd.restored_core_key ?? null)} gesetzt
                                    </span>
                                  ) : (
                                    <>
                                      <span className="truncate">{displayForKey(cd.from_core_key ?? null)}</span>
                                      <ArrowRight className="h-3 w-3 shrink-0" />
                                      <span className="truncate text-tx-secondary">{corrToDisplay(cd)}</span>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="block truncate text-[12px]">
                                  {isUndoRow ? displayForKey(cd.restored_core_key ?? null) : corrToDisplay(cd)}
                                </span>
                                {canUndo && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-1.5 h-7 px-2 text-[11.5px]"
                                    disabled={anyCorrectPending}
                                    onClick={(ev) => { ev.stopPropagation(); doUndo(cd.target_event_id as string, cd.from_core_key ?? null); }}
                                  >
                                    {undoCorrect.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
                                    Rückgängig
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={entry.id} className={rowClass} onClick={() => setSelectedEntry(entry.id)}>
                            <td className="tabular px-4 py-2.5 text-[11.5px] text-muted-foreground">
                              {fmtWhen(entry.timestamp)}
                            </td>
                            <td className="truncate px-4 py-2.5 text-[12px] text-tx-secondary">
                              {humanizeActor(entry.actor)}
                            </td>
                            <td className="px-4 py-2.5 text-[12px]">
                              <span className="block truncate">{humanizeDecision(entry.decision)}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="shrink-0"><PriorityBadge priority={entry.priority} /></span>
                                <span className="shrink-0"><ResponseTypeBadge type={responseType(entry)} /></span>
                                {spamRescueAction(entry.audit_action) && (
                                  <span className="shrink-0">
                                    <SpamRescueBadge action={spamRescueAction(entry.audit_action)!} />
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedEntry(entry.id)}
                                  className="min-w-0 flex-1 truncate text-left text-[13px] font-medium transition-colors hover:text-primary"
                                >
                                  {prettyRedaction(entry.subject) || "Vorgang"}
                                </button>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {entry.mailbox} · {humanizeCategory(entry.category)}
                              </p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center gap-1.5 text-[12px]">
                                <span className="shrink-0">
                                  {actionIcons[entry.user_action] ?? <Dot tone="muted" />}
                                </span>
                                <span className="truncate">
                                  {ACTION_LABELS[entry.user_action] || entry.user_action}
                                </span>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {olderHidden > 0 && (
                  <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] text-muted-foreground">
                    <span className="tabular">{olderHidden}</span>{" "}
                    {olderHidden === 1 ? "älterer Eintrag ist" : "ältere Einträge sind"} durch den Zeitraum
                    ausgeblendet.{" "}
                    <button type="button" onClick={() => setRange("all")} className="font-medium text-primary hover:underline">
                      Alle anzeigen
                    </button>
                  </p>
                )}
              </>
            )}
          </SectionCard>
        </div>

        {/* Der Spacer haelt die Listenbreite, solange das Detail offen ist. */}
        {detail && <div className="hidden w-96 flex-shrink-0 lg:block" aria-hidden="true" />}
      </div>

      {/* Detail drawer — FIXES Overlay-Panel über die volle Fensterhöhe:
          Inhalt scrollt innen, die Label-Korrektur ist als Footer IMMER ohne
          Scrollen sichtbar — unabhängig davon, wie viel Banner/Titel/Filter
          über der Liste stehen und wie weit die Seite gescrollt ist (P1.1).
          Vorher (sticky in-flow + max-h) begann die Leiste unter dem roten
          Postfach-Banner und ragte unter den Viewport -> Button erst nach
          Scrollen ans Seitenende sichtbar (Leon-Screenshot 21.07., 17:01).
          z-50 liegt bewusst ÜBER dem Jana-FAB (z-40), damit der FAB nicht
          den Footer-Button überdeckt.
          Redesign 27.07.2026: haengt bewusst NICHT mehr am Zustand der Liste —
          ein Deep-Link (?item=) muss das Detail auch dann oeffnen, wenn der
          Eintrag durch Zeitraum oder Filter gerade nicht in der Liste steht. */}
      {detail && (
        <div
          role="dialog"
          aria-label="Verlauf-Detail"
          className="fixed inset-y-0 right-0 z-50 flex w-96 max-w-[94vw] flex-col overflow-hidden border-l border-border bg-card shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6 pb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{detailIsCorrection ? "Label-Korrektur" : "Details"}</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                aria-label="Detail-Ansicht schließen"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailIsCorrection ? (
              (() => {
                const cd = corrDetail(detail);
                const isUndoRow = detail.audit_action === "label_correct_undo";
                const target = entries.find((e) => e.id === cd.target_event_id);
                return (
                  <div className="space-y-3">
                    <div className="ue-surface space-y-2 p-3">
                      <p className="text-xs text-muted-foreground">{isUndoRow ? "Rückgängig gemacht" : "Korrigiert"}</p>
                      <p className="text-sm">
                        {isUndoRow ? (
                          <>Wieder auf <span className="font-medium">{displayForKey(cd.restored_core_key ?? null)}</span> gesetzt</>
                        ) : (
                          <>
                            <span className="text-muted-foreground">{displayForKey(cd.from_core_key ?? null)}</span>
                            <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium">{corrToDisplay(cd)}</span>
                          </>
                        )}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">Zeitpunkt: {fmtWhen(detail.timestamp)}</p>
                    </div>
                    {target && (
                      <div className="ue-surface space-y-1.5 p-3">
                        <p className="text-xs text-muted-foreground">Betroffene E-Mail</p>
                        <p className="text-sm font-medium">{prettyRedaction(target.subject)}</p>
                        <p className="truncate text-xs text-muted-foreground">{target.mailbox}</p>
                        <button
                          onClick={() => setSelectedEntry(target.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Zur E-Mail
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {isUndoRow
                        ? "Diese Korrektur wurde zurückgenommen und fließt nicht mehr als Lernsignal in Regel-Vorschläge oder die KI-Einordnung ein."
                        : "Die Korrektur wurde im Postfach ausgeführt und als Lernsignal gespeichert. UseEasy schlägt bei wiederholten Korrekturen eine feste Regel vor."}
                    </p>
                  </div>
                );
              })()
            ) : (
              <>
                <div className="-mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{detail.mailbox}</span>
                  {/* Redesign Follow-up: Kontakt-Dossier auch aus dem Verlauf heraus */}
                  <ContactDossier sender={detail.mailbox} />
                </div>

                <DecisionStory entry={detail} />

                <details className="rounded-md border border-border">
                  <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Technische Details</summary>
                  <div className="space-y-3 p-3 pt-0 text-sm">
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
                      <p className="tabular mt-0.5 font-medium">{humanizeConfidence(detail.confidence)}</p>
                    </div>

                    <div>
                      <span className="text-muted-foreground">Evidenz:</span>
                      <ul className="mt-1 space-y-1">
                        {(detail.evidence ?? []).slice(0, 5).map((e, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-0.5 text-primary">·</span> {e}
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
                              <span className="mt-0.5 text-primary">•</span> {ph}
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
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{humanizeActor(detail.actor)}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground">Aktion:</span>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {actionIcons[detail.user_action]}
                        <span className="font-medium">
                          {ACTION_LABELS[detail.user_action] || detail.user_action}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground">Zeitpunkt:</span>
                      <p className="tabular mt-0.5 font-medium">{fmtWhen(detail.timestamp)}</p>
                    </div>
                  </div>
                </details>

                {(detail.user_action === "dismissed" || detail.user_action === "rejected" || detail.user_action === "autopilot_approved") && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">Rückgängig</p>
                    {(detail.user_action === "dismissed" || detail.user_action === "rejected") && (
                      <Button size="sm" variant="outline" className="w-full justify-center" disabled={undo.isPending}
                        onClick={() => undo.mutate({ event_id: detail.id, undo_type: "reopen" }, {
                          onSuccess: () => toast.success("Wieder in die Queue geholt."),
                          onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                        })}>
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Wieder öffnen
                      </Button>
                    )}
                    {detail.user_action === "autopilot_approved" && (
                      <Button size="sm" variant="destructive" className="w-full justify-center" disabled={undo.isPending}
                        onClick={() => undo.mutate({ event_id: detail.id, undo_type: "cancel_send" }, {
                          onSuccess: () => toast.success("Autonomer Versand abgebrochen."),
                          onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
                        })}>
                        <Ban className="mr-1 h-3.5 w-3.5" /> Autonomen Versand abbrechen
                      </Button>
                    )}
                  </div>
                )}

                {/* v4.57.0 (J4): Warum dieses Label? — gleiche Backend-Quelle wie MiniUI/Review-Queue */}
                {detail.label_reason && (
                  <div className="space-y-1 border-t border-border pt-3">
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
          </div>

          {/* ── Footer: immer sichtbar, scrollt NICHT mit (P1.1) ── */}
          {detailIsCorrection ? (
            (() => {
              const cd = corrDetail(detail);
              const isUndoRow = detail.audit_action === "label_correct_undo";
              const latest = latestCorrectionEntry(cd.target_event_id);
              const canUndo = !isUndoRow && !!cd.target_event_id && latest?.id === detail.id && !sessionUndo[cd.target_event_id ?? ""]?.undone;
              return (
                <div className="shrink-0 space-y-2 border-t border-border px-6 py-4">
                  {canUndo ? (
                    <>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Stellt das vorherige Label im Postfach wieder her; eigene Labels bleiben unberührt.
                      </p>
                      <Button size="sm" variant="outline" className="w-full justify-center"
                        disabled={anyCorrectPending}
                        onClick={() => doUndo(cd.target_event_id as string, cd.from_core_key ?? null)}>
                        {undoCorrect.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
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
            <div className="shrink-0 space-y-2 border-t border-border px-6 py-4">
              <p className="text-xs text-muted-foreground">Postfach-Label korrigieren</p>
              <p className="text-xs">
                Aktuell gesetzt: <span className="font-medium text-foreground">{appliedLabel ?? "kein UseEasy-Label"}</span>
              </p>
              <select
                className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                value={correctKey}
                onChange={(e) => { setCorrectKey(e.target.value); setConfirmCorrect(false); }}
                disabled={correctLabel.isPending}
                aria-label="Postfach-Label korrigieren"
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
                  {correctLabel.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Tag className="mr-1 h-3.5 w-3.5" />}
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
                      {correctLabel.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
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
                  <p className="min-w-0 truncate text-xs">
                    Korrigiert: <span className="text-muted-foreground">{sessionUndo[detail.id].fromLabel}</span>
                    <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{sessionUndo[detail.id].toLabel}</span>
                  </p>
                  <button
                    className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
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
      )}
    </div>
  );
}
