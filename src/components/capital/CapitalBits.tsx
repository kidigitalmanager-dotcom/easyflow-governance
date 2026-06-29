import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceLine, Tooltip as RTooltip, LineChart, Line,
} from "recharts";
import { ShieldCheck, TrendingUp, FlaskConical, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  RED_THRESHOLD, scoreColor, scoreLabel, fmtMonth, fmtPct,
  type CapCategory, type CapMetric, type HealthPoint, type MetricValue,
} from "@/lib/capital";

/* ---------- small badges ---------- */

export function ScoreBadge({ value, size = "md" }: { value: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const color = scoreColor(value);
  const sz = size === "lg" ? "text-4xl" : size === "sm" ? "text-base" : "text-2xl";
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={cn("font-bold tabular-nums leading-none", sz)} style={{ color }}>
        {value == null ? "–" : Math.round(value)}
      </span>
      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ color, backgroundColor: color + "1f", border: `1px solid ${color}33` }}>
        {scoreLabel(value)}
      </span>
    </span>
  );
}

export function IllustrativeBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
          <FlaskConical className="w-3 h-3" /> Illustrativ
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        Public-Proxy-Demo. Zeigt Mechanik & Vorlauf-Story auf bekannten Insolvenzen — keine echten Live-Messwerte.
      </TooltipContent>
    </Tooltip>
  );
}

export function CoverageBadge({ coverage }: { coverage: number | null | undefined }) {
  const pct = coverage == null ? 0 : Math.round(coverage * 100);
  const tone = pct >= 75 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-muted-foreground";
  return <span className={cn("text-xs tabular-nums", tone)}>Coverage {coverage == null ? "–" : pct + "%"}</span>;
}

/* ---------- health timeline ---------- */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold" style={{ color: scoreColor(v) }}>Health {v == null ? "–" : Math.round(v)} · {scoreLabel(v)}</div>
    </div>
  );
}

export function HealthTimeline({ data, failureMonth, height = 240 }: { data: HealthPoint[]; failureMonth?: string | null; height?: number }) {
  const rows = data.map((d) => ({ month: fmtMonth(d.period), score: d.health_score }));
  const failLabel = failureMonth ? fmtMonth(failureMonth) : null;
  const firstRed = rows.find((r) => r.score != null && (r.score as number) < RED_THRESHOLD)?.month;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="capHealth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={32} />
          <RTooltip content={<ChartTooltip />} />
          <ReferenceLine y={RED_THRESHOLD} stroke="#C0392B" strokeDasharray="4 4" label={{ value: "Rot-Schwelle", fontSize: 9, fill: "#C0392B", position: "insideTopRight" }} />
          {failLabel && <ReferenceLine x={failLabel} stroke="#C0392B" strokeWidth={1.5} label={{ value: "Ausfall", fontSize: 9, fill: "#C0392B", position: "top" }} />}
          {firstRed && <ReferenceLine x={firstRed} stroke="#2F6FED" strokeDasharray="2 2" label={{ value: "Signal", fontSize: 9, fill: "#2F6FED", position: "top" }} />}
          <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.4} fill="url(#capHealth)" connectNulls dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ data, height = 36 }: { data: { period: string; v: number | null }[]; height?: number }) {
  const rows = data.map((d) => ({ x: fmtMonth(d.period), v: d.v }));
  const last = rows.length ? rows[rows.length - 1].v : null;
  return (
    <div style={{ height, width: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <Line type="monotone" dataKey="v" stroke={scoreColor(last)} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- category breakdown ---------- */

export function CategoryBars({
  categories, scoreByKey, onSelect, selected,
}: {
  categories: CapCategory[];
  scoreByKey: Record<string, { score: number | null; coverage: number | null }>;
  onSelect?: (key: string) => void;
  selected?: string | null;
}) {
  return (
    <div className="space-y-2.5">
      {categories.map((c) => {
        const row = scoreByKey[c.key];
        const score = row?.score ?? null;
        const col = scoreColor(score);
        const isGauge = c.weight === 0;
        return (
          <button
            key={c.key}
            onClick={() => onSelect?.(c.key)}
            className={cn(
              "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
              selected === c.key ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40",
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color ?? col }} />
                {c.name}
                {isGauge && <span className="text-[10px] text-muted-foreground">(Gauge)</span>}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: col }}>
                {score == null ? "–" : Math.round(score)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, backgroundColor: col }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- KPI drill-down table ---------- */

export function KpiTable({ metrics, latestByMetric }: { metrics: CapMetric[]; latestByMetric: Record<string, MetricValue> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[44%]">KPI</TableHead>
          <TableHead>Wert</TableHead>
          <TableHead>Coverage</TableHead>
          <TableHead>Quellen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => {
          const v = latestByMetric[m.key];
          const val = v?.value ?? null;
          const used: string[] = v?.provenance?.sources_used ?? [];
          const planned = m.status === "planned" || !v;
          return (
            <TableRow key={m.key} className={planned ? "opacity-55" : ""}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{m.short_code ?? m.key}</span>
                  <span className="text-sm">{m.name}</span>
                  {m.is_predictive && (
                    <Tooltip>
                      <TooltipTrigger asChild><TrendingUp className="w-3.5 h-3.5 text-primary" /></TooltipTrigger>
                      <TooltipContent className="text-xs">Vorlaufend (Frühindikator{m.early_indicator_for ? `: ${m.early_indicator_for}` : ""})</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {m.measures && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{m.measures}</p>}
              </TableCell>
              <TableCell>
                {planned ? <span className="text-xs text-muted-foreground italic">geplant</span>
                  : <span className="font-semibold tabular-nums" style={{ color: scoreColor(val) }}>{val == null ? "–" : Math.round(val)}</span>}
              </TableCell>
              <TableCell><CoverageBadge coverage={v?.coverage} /></TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {used.length ? used.map((s) => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{s}</span>
                  )) : <span className="text-[11px] text-muted-foreground">–</span>}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/* ---------- provenance / transparency panel ---------- */

export function ProvenancePanel({ used, missing, illustrative }: { used: string[]; missing: string[]; illustrative: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Datenquellen genutzt</p>
        <div className="flex flex-wrap gap-1.5">
          {used.length ? used.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" /> {s}
            </span>
          )) : <span className="text-xs text-muted-foreground">keine</span>}
        </div>
      </div>
      {missing.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Fehlt / geplant</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border">
                <AlertCircle className="w-3 h-3" /> {s}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
        Jeder Indexwert ist bis zur pseudonymisierten Quell-Mail rückführbar. Nur aggregierte 0–100-Werte verlassen das System (EU/Frankfurt, PII-Minimierung).
        {illustrative && " Demo-Daten sind als illustrativ gekennzeichnet."}
      </p>
    </div>
  );
}
