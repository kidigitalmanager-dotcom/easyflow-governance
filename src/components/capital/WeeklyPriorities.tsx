import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, TrendingDown, Zap, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWeeklyPriorities } from "@/hooks/use-capital";
import { severityColor, ALERT_KIND_LABEL, fmtMonth, type WeeklyPriority, type AlertKind } from "@/lib/capital";

function KindIcon({ kind }: { kind: string }) {
  const cls = "w-4 h-4";
  if (kind === "distress_risk") return <ShieldAlert className={cls} />;
  if (kind === "threshold_breach") return <AlertTriangle className={cls} />;
  if (kind === "trend_down") return <TrendingDown className={cls} />;
  if (kind === "anomaly") return <Zap className={cls} />;
  return <Activity className={cls} />;
}

function PriorityRow({ p }: { p: WeeklyPriority }) {
  const color = severityColor(p.severity as any);
  const kindLabel = ALERT_KIND_LABEL[p.kind as AlertKind] ?? p.kind;
  const val = p.beleg.value != null ? `${Math.round(p.beleg.value)}/100` : null;
  const per = p.beleg.period ? fmtMonth(p.beleg.period) : null;
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground tabular-nums">{p.rank}</span>
        <span style={{ color }}><KindIcon kind={p.kind} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border" style={{ color, borderColor: color + "40", backgroundColor: color + "14" }}>{kindLabel}</span>
          {p.tier === "confirmed" && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">bestätigt</span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground mt-1 leading-snug">{p.title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.handlung}</p>
        {(p.beleg.kpi || val || p.beleg.sources.length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Beleg:</span>
            {p.beleg.kpi && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border bg-muted/60 text-foreground tabular-nums">
                {p.beleg.kpi.toUpperCase()}{val ? ` ${val}` : ""}{per ? ` · ${per}` : ""}
              </span>
            )}
            {p.beleg.sources.map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground">Quelle: {s}</span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// "Top-3 diese Woche" — deterministisch aus dem Alert-Feed (jana-chat, KEIN LLM).
// Jede Prioritaet traegt ihre Handlung + den Beleg (KPI + Wert + Quelle).
export function WeeklyPriorities() {
  const q = useWeeklyPriorities();
  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  const data = q.data;
  if (!data || !data.has_own_account) return null;
  const items = data.priorities ?? [];
  return (
    <Card className={cn("glass-card", items.length > 0 ? "border-primary/20" : "border-border")}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-none">Diese Woche</p>
            <h3 className="text-sm font-semibold text-foreground leading-tight mt-0.5">Deine Top-Prioritäten</h3>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            Keine offenen Warnsignale — aktuell nichts Dringendes zu tun.
          </div>
        ) : (
          <ol className="space-y-2.5">
            {items.map((p) => <PriorityRow key={p.alert_id} p={p} />)}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
