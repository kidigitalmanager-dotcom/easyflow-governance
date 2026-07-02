// ─────────────────────────────────────────────────────────────────────────────
// Datenstand-Badge (Freshness-SLA, advisory) + Signal-Basis-Badge (Coverage-Gate)
// Quelle: View cap_freshness (Seriositäts-Mechanik 2026-07-03; rein informativ,
// es wird KEIN Wert und KEINE Confidence mutiert — ehrliche Anzeige).
// ─────────────────────────────────────────────────────────────────────────────
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Database, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FreshnessRow, MetricValue } from "@/lib/capital";

const STATUS_RANK: Record<string, number> = { dead: 3, stale: 2, no_sla: 1, fresh: 0 };

export function worstFreshness(rows: FreshnessRow[]): FreshnessRow | null {
  if (!rows.length) return null;
  return rows.reduce((worst, r) => (STATUS_RANK[r.status] > STATUS_RANK[worst.status] ? r : worst), rows[0]);
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "unbekannt";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 35) return `vor ${days} Tagen`;
  return `vor ${Math.round(days / 30.44)} Monaten`;
}

export function DataFreshnessBadge({ rows, loading }: { rows: FreshnessRow[]; loading?: boolean }) {
  if (loading || !rows.length) return null;
  const worst = worstFreshness(rows)!;
  const cfg =
    worst.status === "fresh"
      ? { label: "Datenstand aktuell", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" }
      : worst.status === "stale"
        ? { label: "Datenstand veraltet", cls: "bg-amber-400/10 text-amber-500 border-amber-400/25" }
        : worst.status === "dead"
          ? { label: "Quelle liefert nicht mehr", cls: "bg-[#C0392B]/10 text-[#C0392B] border-[#C0392B]/25" }
          : { label: "Datenstand ohne SLA", cls: "bg-muted text-muted-foreground border-border" };
  // je Quelle die schlechteste Zeile für den Tooltip
  const bySource = new Map<string, FreshnessRow>();
  for (const r of rows) {
    const prev = bySource.get(r.source_key);
    if (!prev || STATUS_RANK[r.status] > STATUS_RANK[prev.status]) bySource.set(r.source_key, r);
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", cfg.cls)}>
          <Clock className="w-3 h-3" /> {cfg.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[20rem] space-y-1">
        <p className="font-medium">Aktualität je Quelle (SLA-überwacht):</p>
        {Array.from(bySource.values()).map((r) => (
          <p key={r.source_key} className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px]">{r.source_key}</span>
            <span>
              {r.status === "fresh" ? "aktuell" : r.status === "stale" ? "veraltet" : r.status === "dead" ? "liefert nicht" : "kein SLA"} · {fmtAgo(r.last_observed_at)}
            </span>
          </p>
        ))}
        <p className="text-muted-foreground pt-1">Rein informativ — Werte und Konfidenzen werden dadurch nicht verändert.</p>
      </TooltipContent>
    </Tooltip>
  );
}

/* Signal-Basis: wie viele unabhängige Signale tragen die Bewertung (Coverage-Gate-Anzeige).
   Backtest-Befund: unter 2 Signalen mit >=12 Monaten Historie sind Score-Alarme nicht belastbar
   ("nicht bewertbar" statt raten). Junge Accounts zeigen ehrlich "Historie im Aufbau". */
export function signalBasis(values: MetricValue[]): { nSignals12: number; nSignals: number; maxMonths: number } {
  const byMetric = new Map<string, Set<string>>();
  for (const v of values) {
    if (v.value == null) continue;
    if (!byMetric.has(v.metric_key)) byMetric.set(v.metric_key, new Set());
    byMetric.get(v.metric_key)!.add(String(v.period).slice(0, 7));
  }
  let nSignals12 = 0, maxMonths = 0;
  for (const months of byMetric.values()) {
    if (months.size >= 12) nSignals12++;
    if (months.size > maxMonths) maxMonths = months.size;
  }
  return { nSignals12, nSignals: byMetric.size, maxMonths };
}

export function SignalBasisBadge({ values }: { values: MetricValue[] }) {
  if (!values.length) return null;
  const { nSignals12, nSignals, maxMonths } = signalBasis(values);
  const solid = nSignals12 >= 2;
  const young = !solid && maxMonths < 12;
  const cfg = solid
    ? { label: `Signal-Basis: ${nSignals12} Quellen ≥12 Mo`, cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25", icon: Database }
    : young
      ? { label: `Historie im Aufbau (${maxMonths} Mo · ${nSignals} Signale)`, cls: "bg-muted text-muted-foreground border-border", icon: Database }
      : { label: "Eingeschränkt bewertbar", cls: "bg-amber-400/10 text-amber-500 border-amber-400/25", icon: AlertTriangle };
  const Icon = cfg.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", cfg.cls)}>
          <Icon className="w-3 h-3" /> {cfg.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[20rem]">
        {solid
          ? `Bewertung stützt sich auf ${nSignals12} unabhängige Signale mit mindestens 12 Monaten Historie (${nSignals} Signale gesamt).`
          : young
            ? `Dieses Profil sammelt noch Historie (längste Reihe ${maxMonths} Monate, ${nSignals} Signale). Alarme werden konservativ behandelt, bis mindestens 2 Signale 12 Monate Historie haben.`
            : `Weniger als 2 Signale mit ausreichender Historie — Score-Alarme sind hier nicht belastbar (Backtest-Befund). Das System weist das ehrlich aus, statt zu raten.`}
      </TooltipContent>
    </Tooltip>
  );
}
