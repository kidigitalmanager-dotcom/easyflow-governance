import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PiggyBank, Sparkles, ChevronDown, Info, RotateCcw, FileText, Inbox, CheckCircle2, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStats, useDashboardRoi } from "@/hooks/use-api";
import {
  computeRoi, computeRoiFromCounts, computeM5Hook, loadAssumptions, saveAssumptions, sanitizeAssumptions,
  formatHoursRange, formatEuroRange, formatMinutes, periodLabel,
  ASSUMPTION_BOUNDS, DEFAULT_ASSUMPTIONS,
  type RoiAssumptions, type RoiPeriod, type RoiResult,
} from "@/lib/roi";

// V2-Kachel "Was Jana dir gespart hat" — macht den unsichtbaren Nutzen von Jana
// sichtbar (vorbereitete Entwuerfe, eingeordnete E-Mails, gefangene Fristen →
// geschaetzte Zeit/Euro). Bevorzugt den gemessenen /v1/dashboard/roi-Endpoint
// (echte Wochen- UND Monatszahlen); faellt sonst auf /v1/dashboard/stats zurueck
// (Woche gemessen, Monat hochgerechnet). Ehrlichkeit: konservative Schaetzung,
// sichtbare Methode, Bandbreite, ehrlicher "zu wenig Aktivitaet"-Fall.

function StatChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/40 px-2.5 py-1">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value.toLocaleString("de-DE")}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function AssumptionField({
  label, suffix, value, min, max, step, onChange,
}: {
  label: string; suffix: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-foreground">{label}</span>
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = e.currentTarget.valueAsNumber;
            if (Number.isFinite(v)) onChange(v);
          }}
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label={label}
        />
        <span className="text-muted-foreground w-14">{suffix}</span>
      </span>
    </label>
  );
}

export function RoiSavingsCard() {
  const roiQuery = useDashboardRoi();
  const statsQuery = useDashboardStats();
  const roi = roiQuery.data;
  const stats = statsQuery.data;

  const [period, setPeriod] = useState<RoiPeriod>("week");
  const [methodOpen, setMethodOpen] = useState(false);
  const [assumptions, setAssumptions] = useState<RoiAssumptions>(() => loadAssumptions());

  useEffect(() => {
    saveAssumptions(assumptions);
  }, [assumptions]);

  const result: RoiResult | null = useMemo(() => {
    if (roi) {
      return computeRoiFromCounts(period === "week" ? roi.week : roi.month, assumptions, { period, measured: true });
    }
    if (stats) return computeRoi(stats, assumptions, period);
    return null;
  }, [roi, stats, assumptions, period]);

  const m5 = useMemo(() => (result ? computeM5Hook(result) : { minutes: 0 }), [result]);

  const setField = (key: keyof RoiAssumptions, v: number) =>
    setAssumptions((prev) => sanitizeAssumptions({ ...prev, [key]: v }));

  if (roiQuery.isLoading && statsQuery.isLoading) {
    return (
      <Card className="glass-card border-primary/20">
        <CardContent className="pt-4 pb-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!result) return null;

  const windowNote = result.measured
    ? period === "week" ? "letzte 7 Tage · gemessen" : "letzte 30 Tage · gemessen"
    : period === "week" ? "letzte 7 Tage · gemessen" : "aus 7-Tage-Schnitt hochgerechnet";

  return (
    <Card className={cn("glass-card", result.thin ? "border-border" : "border-primary/20")}>
      <CardContent className="pt-4 pb-4">
        {/* ── Kopf: Titel + Zeitraum-Umschalter ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <PiggyBank className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-none">Wert von Jana</p>
              <h3 className="text-sm font-semibold text-foreground leading-tight mt-0.5">Was Jana dir gespart hat</h3>
            </div>
          </div>
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 shrink-0">
            {(["week", "month"] as RoiPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-md transition-colors",
                  period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p === "week" ? "Woche" : "Monat"}
              </button>
            ))}
          </div>
        </div>

        {result.thin ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground">
              Noch zu wenig Aktivität {periodLabel(period)} für eine belastbare Schätzung.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sobald Jana Entwürfe vorbereitet und E-Mails einordnet, erscheint hier deine geschätzte Zeitersparnis.
            </p>
          </div>
        ) : (
          <>
            {/* ── Grosse Bandbreiten-Zahl ── */}
            <div className="mt-4 flex items-end gap-2 flex-wrap">
              <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                ≈ {formatHoursRange(result.minutesLow, result.minutesHigh)}
              </span>
              <span className="text-sm text-muted-foreground pb-1">geschätzt gespart · {periodLabel(period)}</span>
              {result.projected && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 mb-1.5">
                  hochgerechnet
                </span>
              )}
            </div>
            {result.projected && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Monatswert aus dem 7-Tage-Schnitt hochgerechnet — nicht gemessen.
              </p>
            )}
            {result.triageOnly && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Aktuell ohne vorbereitete Entwürfe {periodLabel(period)} — nur aus eingeordneten E-Mails{result.deadlines > 0 ? " und erfassten Fristen" : ""}.
              </p>
            )}

            {/* ── Aufschlüsselung (Chips) ── */}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatChip icon={<FileText className="w-3.5 h-3.5" />} value={result.drafts} label="Entwürfe vorbereitet" />
              <StatChip icon={<Inbox className="w-3.5 h-3.5" />} value={result.emails} label="E-Mails eingeordnet" />
              <StatChip icon={<CheckCircle2 className="w-3.5 h-3.5" />} value={result.resolved} label="freigegeben & gesendet" />
              {result.deadlines > 0 && (
                <StatChip icon={<CalendarClock className="w-3.5 h-3.5" />} value={result.deadlines} label="Fristen erfasst" />
              )}
            </div>

            {/* ── M5-Upsell-Hook (Platzhalter) ── */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-primary/25 bg-primary/5 px-3 py-2">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-foreground/90 flex-1 leading-snug">
                Mit der nächsten Autopilot-Stufe wären es geschätzt{" "}
                <span className="font-medium">+{formatMinutes(m5.minutes)}</span> {periodLabel(period)}.
              </p>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-primary/25 bg-primary/10 text-primary shrink-0">
                Vorschau
              </span>
            </div>
          </>
        )}

        {/* ── Methode sichtbar (Aufklapper) — immer verfügbar ── */}
        <button
          onClick={() => setMethodOpen((o) => !o)}
          aria-expanded={methodOpen}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Info className="w-3.5 h-3.5" /> Wie wird das berechnet?
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", methodOpen && "rotate-180")} />
        </button>

        {methodOpen && (
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              Grundlage sind reale Zähler aus deinem Postfach ({windowNote}). Wir rechnen sie mit den unten
              sichtbaren, konservativen Zeit-Annahmen in gesparte Zeit um:
            </p>
            <ul className="space-y-1">
              <li className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="text-foreground font-medium tabular-nums">{result.drafts.toLocaleString("de-DE")}</span> vorbereitete
                  Entwürfe × {assumptions.draftMinutes} Min Schreibzeit
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Inbox className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="text-foreground font-medium tabular-nums">{result.emails.toLocaleString("de-DE")}</span> eingeordnete
                  E-Mails × {assumptions.triageMinutes} Min Sortierzeit
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="text-foreground font-medium tabular-nums">{result.deadlines.toLocaleString("de-DE")}</span> erfasste
                  Fristen/Termine × {assumptions.deadlineMinutes} Min
                </span>
              </li>
            </ul>
            <p>
              Die <span className="text-foreground font-medium tabular-nums">{result.resolved.toLocaleString("de-DE")}</span>{" "}
              freigegebenen &amp; gesendeten Entwürfe sind Teil der vorbereiteten Entwürfe und werden nicht doppelt gezählt.
            </p>

            {/* Justierbare Annahmen (lokal gespeichert, nicht serverseitig) */}
            <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Annahmen (anpassbar)</span>
                <button
                  onClick={() => setAssumptions({ ...DEFAULT_ASSUMPTIONS })}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-3 h-3" /> Zurücksetzen
                </button>
              </div>
              <AssumptionField label="Zeit je Entwurf" suffix="Min" value={assumptions.draftMinutes}
                min={ASSUMPTION_BOUNDS.draftMinutes.min} max={ASSUMPTION_BOUNDS.draftMinutes.max} step={1}
                onChange={(v) => setField("draftMinutes", v)} />
              <AssumptionField label="Zeit je E-Mail" suffix="Min" value={assumptions.triageMinutes}
                min={ASSUMPTION_BOUNDS.triageMinutes.min} max={ASSUMPTION_BOUNDS.triageMinutes.max} step={0.5}
                onChange={(v) => setField("triageMinutes", v)} />
              <AssumptionField label="Zeit je Frist" suffix="Min" value={assumptions.deadlineMinutes}
                min={ASSUMPTION_BOUNDS.deadlineMinutes.min} max={ASSUMPTION_BOUNDS.deadlineMinutes.max} step={1}
                onChange={(v) => setField("deadlineMinutes", v)} />
              <AssumptionField label="Stundensatz" suffix="€/Std" value={assumptions.hourlyRate}
                min={ASSUMPTION_BOUNDS.hourlyRate.min} max={ASSUMPTION_BOUNDS.hourlyRate.max} step={5}
                onChange={(v) => setField("hourlyRate", v)} />
              <p className="text-muted-foreground pt-0.5">Diese Annahmen gelten nur für dich (lokal gespeichert).</p>
            </div>

            {!result.thin && (
              <p>
                Als Euro: <span className="text-foreground font-medium tabular-nums">≈ {formatEuroRange(result.euroLow, result.euroHigh)}</span>{" "}
                {periodLabel(period)} (bei {assumptions.hourlyRate} €/Std).
              </p>
            )}

            <p>
              Wir zeigen eine <span className="text-foreground font-medium">Bandbreite (±25 %)</span>, weil die tatsächliche
              Ersparnis je Fall schwankt — nie einen exakten Wert.
              {result.projected && " Der Monatswert ist aus dem 7-Tage-Schnitt hochgerechnet, nicht gemessen."}
            </p>
            <p className="text-[11px]">
              Konservative Schätzung. Weitere von Jana übernommene Aktionen sind hier noch nicht vollständig enthalten —
              der reale Nutzen liegt eher darüber.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RoiSavingsCard;
