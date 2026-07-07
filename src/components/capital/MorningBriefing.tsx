import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sun, Moon, AlertTriangle, TrendingDown, TrendingUp, Minus, Zap, ShieldAlert, Activity, CheckCircle2, Sparkles, ChevronDown, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMorningBriefing } from "@/hooks/use-capital";
import { severityColor, ALERT_KIND_LABEL, fmtMonth, type WeeklyPriority, type AlertKind } from "@/lib/capital";

function KindIcon({ kind }: { kind: string }) {
  const cls = "w-4 h-4";
  if (kind === "distress_risk") return <ShieldAlert className={cls} />;
  if (kind === "threshold_breach") return <AlertTriangle className={cls} />;
  if (kind === "trend_down") return <TrendingDown className={cls} />;
  if (kind === "anomaly") return <Zap className={cls} />;
  return <Activity className={cls} />;
}

// Kompakter Health-Trend-Chip: aktueller Wert + Pfeil (now vs prev), bandfarbig.
function HealthTrendChip({ now, prev, band }: { now: number; prev: number | null; band: string }) {
  const color = band === "kritisch" ? "#C0392B" : band === "beobachten" ? "#E8A33D" : "#3FA96A";
  const delta = prev != null ? now - prev : 0;
  const Arrow = delta > 0.5 ? TrendingUp : delta < -0.5 ? TrendingDown : Minus;
  const deltaTxt = prev != null && Math.abs(delta) >= 0.5 ? ` ${delta > 0 ? "+" : ""}${Math.round(delta)}` : "";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border tabular-nums shrink-0"
      style={{ color, borderColor: color + "40", backgroundColor: color + "14" }}
      title="Antwort-Index (Health) + Veränderung zum Vormonat"
    >
      Health {Math.round(now)}
      <Arrow className="w-3 h-3" />{deltaTxt}
    </span>
  );
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

// "Heute" — das tägliche 30-Sekunden-Morgen-Ritual (V1 Jana Morning-Briefing).
// Deterministisch aus cap_alerts (morning-briefing Edge-Function, KEIN LLM):
// Top-3 heute + Nacht-Delta (neu/eskaliert/gelöst seit gestern) + Datenstand-
// Ehrlichkeit + ein "Soll ich vorbereiten?"-Vorschlag (read-only Seed).
export function MorningBriefing() {
  const q = useMorningBriefing();
  const [prepOpen, setPrepOpen] = useState(false);
  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  const data = q.data;
  if (!data || !data.has_own_account) return null;

  const top = data.top_priorities ?? [];
  const delta = data.night_delta;
  const empty = !!data.empty_case;
  const sug = data.suggestion ?? null;
  const health = data.health ?? null;
  const fresh = data.data_freshness ?? null;
  const changed = !!delta && (delta.new > 0 || delta.resolved > 0 || (delta.escalated ?? 0) > 0);

  return (
    <Card className={cn("glass-card", empty ? "border-border" : "border-primary/20")}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-none">Heute · Dein Morgen-Briefing</p>
            <h3 className="text-sm font-semibold text-foreground leading-tight mt-0.5">{data.headline || "Dein Tagesüberblick"}</h3>
          </div>
          {health && health.now != null && (
            <HealthTrendChip now={health.now} prev={health.prev} band={health.band} />
          )}
        </div>

        {/* Nacht-Delta (ehrlich: zeigt auch "keine Veränderung"; Eskalation steckt in der note) */}
        {delta && (
          <div className={cn(
            "flex items-center gap-2 text-xs rounded-lg border px-2.5 py-1.5 mb-2",
            changed ? "border-primary/20 bg-primary/5 text-foreground" : "border-border bg-muted/30 text-muted-foreground",
          )}>
            <Moon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="leading-snug">{delta.note}</span>
          </div>
        )}

        {/* Datenstand-Ehrlichkeit (nur wenn es etwas zu sagen gibt) */}
        {fresh && fresh.note && (
          <div className={cn(
            "flex items-center gap-1.5 text-[11px] mb-3 leading-snug",
            fresh.level === "limited" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
          )}>
            <Database className="w-3 h-3 shrink-0" />
            <span>{fresh.note}</span>
          </div>
        )}

        {empty ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            {data.headline || "Heute nichts Dringendes — keine offenen Warnsignale."}
          </div>
        ) : (
          <>
            <ol className="space-y-2.5">
              {top.map((p) => <PriorityRow key={p.alert_id} p={p} />)}
            </ol>

            {/* "Soll ich vorbereiten?"-Vorschlag (CTA-Seed, read-only) */}
            {sug && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
                <button
                  onClick={() => setPrepOpen((v) => !v)}
                  aria-expanded={prepOpen}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                >
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground">
                    {sug.cta_label}
                    {sug.kpi ? <span className="text-muted-foreground font-normal"> · {sug.kpi.toUpperCase()}</span> : null}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", prepOpen && "rotate-180")} />
                </button>
                {prepOpen && (
                  <div className="px-3 pb-3 border-t border-primary/10">
                    <p className="text-xs text-foreground leading-relaxed mt-2">{sug.prep}</p>
                    <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                      Vorschlag zur Vorbereitung — read-only. Das Handeln-Modul greift das später als konkreten Schritt auf.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
