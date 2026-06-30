import { TrendingDown, TrendingUp, Minus, Star, BellRing, Activity, AlertTriangle, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IllustrativeBadge } from "@/components/capital/CapitalBits";
import { useWatchlist } from "@/lib/watchlist";
import {
  riskFromSlope, severityColor, scoreColor, fmtMonth, ALERT_KIND_LABEL,
  type CapAlert, type AlertSeverity,
} from "@/lib/capital";

/* ── Risiko-Badge (Slope → steigend / stabil / fallend) ── */
export function RiskBadge({ slope, points, size = "sm" }: { slope: number | null; points?: number; size?: "sm" | "md" }) {
  const r = riskFromSlope(slope, points ?? 99);
  const Icon = r.dir === "falling" ? TrendingDown : r.dir === "rising" ? TrendingUp : Minus;
  const txt = size === "md" ? "text-xs" : "text-[10px]";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-full", txt)}
          style={{ color: r.color, backgroundColor: r.color + "1f", border: `1px solid ${r.color}33` }}>
          <Icon className="w-3 h-3" /> {r.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-[15rem]">
        Trend der letzten Monate{slope != null ? ` (≈ ${Math.round(slope * 10) / 10} Punkte/Monat)` : ""}. „Fallend“ = Health sinkt, ein Frühwarnsignal.
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Alert-Kind-Pille ── */
export function AlertKindBadge({ kind, severity }: { kind: CapAlert["kind"]; severity: AlertSeverity }) {
  const c = severityColor(severity);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
      style={{ color: c, backgroundColor: c + "1a", border: `1px solid ${c}33` }}>
      {ALERT_KIND_LABEL[kind]}
    </span>
  );
}

/* ── Watchlist-Stern ── */
export function WatchButton({ slug, className }: { slug: string; className?: string }) {
  const { isWatched, toggle } = useWatchlist();
  const on = isWatched(slug);
  return (
    <button
      type="button"
      aria-label={on ? "Aus Watchlist entfernen" : "Zur Watchlist hinzufügen"}
      onClick={(e) => { e.stopPropagation(); toggle(slug); }}
      className={cn("inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-muted/60", className)}
    >
      <Star className={cn("w-4 h-4", on ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
    </button>
  );
}

/* ── Projektion ── */
export function ProjectionNote({ projection }: { projection: CapAlert["projection"] }) {
  if (!projection || projection.months_to_cross == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[#C0392B]">
      <ArrowDownRight className="w-3 h-3" />
      Projektion: voraussichtlich &lt;{projection.cross_level ?? 50} in ~{projection.months_to_cross} Monaten
    </span>
  );
}

/* ── eine Alert-Zeile ── */
export function AlertRow({ alert, showAccount = true }: { alert: CapAlert; showAccount?: boolean }) {
  const c = severityColor(alert.severity);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 bg-card/40">
      <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {showAccount && <span className="text-sm font-semibold text-foreground">{alert.account_name ?? alert.account_slug}</span>}
          <AlertKindBadge kind={alert.kind} severity={alert.severity} />
          {alert.scope === "metric" && <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground">{alert.subject_key}</span>}
          {alert.is_illustrative && <IllustrativeBadge />}
        </div>
        <p className="text-[13px] text-muted-foreground mt-0.5">{alert.message}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-muted-foreground/70">Stand {fmtMonth(alert.period)}</span>
          <ProjectionNote projection={alert.projection} />
        </div>
      </div>
      {alert.value_now != null && (
        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: scoreColor(alert.value_now) }}>
          {Math.round(alert.value_now)}
        </span>
      )}
    </div>
  );
}

/* ── Alert-Feed ── */
export function AlertFeed({
  alerts, loading, showAccount = true, emptyText = "Keine offenen Alerts.", max,
}: { alerts: CapAlert[]; loading?: boolean; showAccount?: boolean; emptyText?: string; max?: number }) {
  if (loading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  const rows = max ? alerts.slice(0, max) : alerts;
  if (!rows.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-sm text-emerald-400">
        <Activity className="w-4 h-4" /> {emptyText}
      </div>
    );
  }
  return <div className="space-y-2">{rows.map((a) => <AlertRow key={a.id} alert={a} showAccount={showAccount} />)}</div>;
}

/* ── Benchmark-Band (Account vs. Sektor-Median) ── */
export function BenchmarkBand({
  value, median, p25, p75, n, verticalLabel,
}: { value: number | null; median: number | null; p25: number | null; p75: number | null; n: number; verticalLabel?: string }) {
  if (median == null || value == null) return null;
  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  const lo = clamp(p25 ?? median), hi = clamp(p75 ?? median);
  const delta = Math.round((value - median) * 10) / 10;
  const above = value >= median;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{verticalLabel ? `Sektor: ${verticalLabel}` : "Sektor"} · Median {Math.round(median)} · n={n}</span>
        <span className="font-medium" style={{ color: above ? "#10b981" : "#C0392B" }}>
          {above ? "+" : ""}{delta} ggü. Median
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-muted overflow-visible">
        {/* p25–p75 band */}
        <div className="absolute top-0 h-full rounded-full bg-primary/20" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
        {/* median marker */}
        <div className="absolute -top-0.5 h-4 w-0.5 bg-muted-foreground" style={{ left: `${clamp(median)}%` }} />
        {/* account marker */}
        <div className="absolute -top-1 w-2.5 h-5 rounded-sm shadow" style={{ left: `calc(${clamp(value)}% - 5px)`, backgroundColor: scoreColor(value) }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>0</span><span>50</span><span>100</span></div>
    </div>
  );
}

export function NoBenchmarkHint() {
  return (
    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
      <AlertTriangle className="w-3 h-3" /> Zu wenige sichtbare Firmen im Sektor für einen belastbaren Vergleich.
    </p>
  );
}

export function FeedHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2">
      <BellRing className="w-4 h-4 text-primary" />
      <h2 className="text-sm font-medium text-foreground">Frühwarn-Alerts</h2>
      {count > 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-[#C0392B]/15 text-[#C0392B] border border-[#C0392B]/25">{count}</span>}
    </div>
  );
}
