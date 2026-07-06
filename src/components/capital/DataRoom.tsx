// ─────────────────────────────────────────────────────────────────────────────
// DataRoom.tsx — Investor Data-Room (M2). Portfolio-Screening über das sichtbare
// Universe (external ODER consent). Freitext-Frage an Jana + strukturierte
// DD-Schnellfilter → deterministisch gerankte Ergebnis-Tabelle (Score/Trend/
// Tier/Freshness/Alerts) + belegte Jana-Erklärung + Drilldown + Export.
// Deterministik-first: die Rangliste kommt aus der DB; das LLM formuliert nur
// und darf nur Firmen aus der Liste per slug zitieren (Zitat-Validierung).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Sparkles, ShieldCheck, Info, Globe, TrendingDown, TrendingUp, Minus,
  AlertTriangle, ArrowRight, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvestorPortfolio } from "@/hooks/use-capital";
import {
  verticalLabelDe, scoreColor, worstFreshnessLabel, PORTFOLIO_FILTERS,
  type PortfolioFilterKey, type PortfolioHit, type InvestorPortfolioResponse,
} from "@/lib/capital";
import { ScoreBadge, VerificationBadge, IllustrativeBadge } from "@/components/capital/CapitalBits";
import { PortfolioReportButton } from "@/components/capital/PortfolioReport";

const STARTERS = [
  "Welche Firmen haben in 4 Wochen einen fallenden Antwort-Index?",
  "Welche Firma hat die meisten offenen kritischen Signale?",
  "Bei welchen Firmen ist die Datenlage am dünnsten?",
];

function TrendCell({ hit }: { hit: PortfolioHit }) {
  const { risk_dir: d, slope6: s } = hit;
  const meta =
    d === "falling" ? { c: "#C0392B", Icon: TrendingDown, l: "Fallend" } :
    d === "rising" ? { c: "#10b981", Icon: TrendingUp, l: "Steigend" } :
    d === "stable" ? { c: "#E8A33D", Icon: Minus, l: "Stabil" } :
    { c: "#5A6473", Icon: Minus, l: "—" };
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: meta.c }}>
      <meta.Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{s != null ? `${s > 0 ? "+" : ""}${s.toFixed(1)}` : meta.l}</span>
    </span>
  );
}

function FreshCell({ w }: { w: PortfolioHit["worst_freshness"] }) {
  const tone = w === "dead" ? "text-red-500" : w === "stale" ? "text-amber-500" : "text-muted-foreground";
  return <span className={cn("text-xs", tone)}>{worstFreshnessLabel(w)}</span>;
}

function AlertCell({ hit }: { hit: PortfolioHit }) {
  if (hit.critical_alerts === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
      <span className="font-semibold text-red-500">{hit.critical_alerts}</span>
      <span className="text-muted-foreground">kritisch</span>
      {hit.confirmed_alerts > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/25">
              {hit.confirmed_alerts}× bestätigt
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">Kritisch und über mehrere Monatsläufe stabil (Debounce) — nicht nur ein Einzel-Ausschlag.</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function ToneCell({ t }: { t: number | null }) {
  if (t == null) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-xs font-medium tabular-nums" style={{ color: scoreColor(t) }}>{Math.round(t)}</span>;
}

export function DataRoom({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const portfolio = useInvestorPortfolio();
  const [filter, setFilter] = useState<PortfolioFilterKey | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<InvestorPortfolioResponse | null>(null);
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  const run = (nextFilter: PortfolioFilterKey | null, message?: string) => {
    setError(null);
    setAskedQuestion(message?.trim() ? message.trim() : null);
    portfolio.mutate(
      { filter: nextFilter, message: message?.trim() || undefined, limit: 12 },
      { onSuccess: (r) => setResult(r), onError: (e) => setError(e.message) },
    );
  };

  // Erst-Aufruf: deterministische Rangliste (Top-Risiko) ohne LLM.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    run(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFilter = (f: PortfolioFilterKey | null) => { setFilter(f); setQuestion(""); run(f); };
  const ask = () => { const q = question.trim(); if (!q || portfolio.isPending) return; run(filter, q); };

  const hits = result?.hits ?? [];
  const answer = result?.answer ?? null;
  const citations = result?.citations ?? [];
  const citedSlugs = new Set(citations.map((c) => c.key));
  const activeFilterLabel = filter ? PORTFOLIO_FILTERS.find((f) => f.key === filter)?.label : "Höchstes Gesamtrisiko";

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Kopf */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Search className="w-[18px] h-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight">Data-Room · Portfolio-Screening</h3>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Frag über das gesamte Portfolio — jede genannte Firma mit Score + Quelle belegt.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border border-border bg-muted text-muted-foreground shrink-0">
            <ShieldCheck className="w-3 h-3" /> read-only
          </span>
        </div>

        {/* Schnellfilter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => pickFilter(null)}
            className={cn("text-xs font-medium rounded-lg border px-2.5 py-1 transition-colors",
              filter === null ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40")}
          >
            Höchstes Risiko
          </button>
          {PORTFOLIO_FILTERS.map((f) => (
            <Tooltip key={f.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => pickFilter(f.key)}
                  className={cn("text-xs font-medium rounded-lg border px-2.5 py-1 transition-colors",
                    filter === f.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40")}
                >
                  {f.label}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{f.hint}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Freitext-Frage */}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            rows={1}
            placeholder="Frag Jana über das Portfolio — z.B. „Welche Firma hat die meisten kritischen Signale?“"
            className="flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[42px] max-h-32"
          />
          <Button type="submit" disabled={!question.trim() || portfolio.isPending} className="h-[42px] px-4 gap-1.5 shrink-0">
            <Send className="w-4 h-4" /> Fragen
          </Button>
        </form>
        {!result?.answer && !askedQuestion && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => { setQuestion(s); run(filter, s); }}
                className="text-xs text-left px-3 py-1.5 rounded-full border border-border bg-card/60 text-foreground hover:bg-muted/60 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Jana-Antwort (belegt) */}
        {(portfolio.isPending && askedQuestion) && (
          <div className="rounded-xl border border-border bg-background/40 p-3"><Skeleton className="h-4 w-56" /></div>
        )}
        {answer && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
              <Sparkles className="w-3.5 h-3.5" /> Jana{askedQuestion ? "" : ""}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{answer}</p>
            {citations.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-border/60">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Belegte Firmen:</span>
                {citations.map((c) => {
                  const hit = hits.find((h) => h.slug === c.key);
                  return (
                    <button key={c.key} onClick={() => hit?.id && onSelect(hit.id)}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 transition-colors tabular-nums">
                      {c.label || c.key}{c.value != null ? ` · ${Math.round(c.value)}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {result?.llm_configured === false && askedQuestion && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Die Rangliste unten ist deterministisch belegt. Die Freitext-Antwort ist noch nicht scharfgeschaltet (LLM-Verbindung fehlt).
          </p>
        )}
        {result?.llm_error && askedQuestion && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Jana ist gerade nicht erreichbar — die Rangliste unten steht trotzdem.</p>
        )}
        {error && <p className="text-xs text-red-500 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}</p>}

        {/* Ergebnis-Tabelle */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {result ? <>Reihung: <span className="text-foreground font-medium">{activeFilterLabel}</span> · {hits.length} von {result.universe_size} Firmen im sichtbaren Universe</> : "…"}
            </p>
            {hits.length > 0 && (
              <PortfolioReportButton hits={hits} filter={filter} universeSize={result?.universe_size ?? hits.length} question={askedQuestion} answer={answer} citations={citations} />
            )}
          </div>

          {portfolio.isPending && !result ? (
            <Skeleton className="h-40 w-full" />
          ) : hits.length === 0 ? (
            <Card className="glass-card"><CardContent className="py-6 text-center text-sm text-muted-foreground">
              Für diesen Filter sind aktuell keine Firmen im sichtbaren Universe vorhanden.
            </CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Firma</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Trend</TableHead>
                    <TableHead>Kritische Alerts</TableHead>
                    <TableHead>Daten</TableHead>
                    <TableHead>News-Ton</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hits.map((h, i) => (
                    <TableRow
                      key={h.slug}
                      className={cn("cursor-pointer", selectedId && h.id === selectedId && "bg-primary/5", citedSlugs.has(h.slug) && "bg-primary/[0.03]")}
                      onClick={() => h.id && onSelect(h.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{i + 1}.</span>
                          <span className="text-sm font-medium text-foreground truncate max-w-[160px]">{h.name}</span>
                          {h.is_illustrative && <IllustrativeBadge />}
                          <VerificationBadge tier={h.verification_tier} />
                          {h.account_type === "external" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center text-[10px] text-muted-foreground"><Globe className="w-2.5 h-2.5" /></span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">Markt-Index: aus öffentlichen Signalen abgeleitet, keine Datenfreigabe.</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {h.vertical && <p className="text-[11px] text-muted-foreground mt-0.5">{verticalLabelDe(h.vertical)}</p>}
                      </TableCell>
                      <TableCell><ScoreBadge value={h.health} size="sm" /></TableCell>
                      <TableCell><TrendCell hit={h} /></TableCell>
                      <TableCell><AlertCell hit={h} /></TableCell>
                      <TableCell><FreshCell w={h.worst_freshness} /></TableCell>
                      <TableCell><ToneCell t={h.news_tone} /></TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-0.5 text-xs text-primary/80">öffnen <ArrowRight className="w-3 h-3" /></span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
          Nur Firmen mit Datenfreigabe oder öffentlichem Markt-Index (extern). Illustrativ markierte Firmen sind Demonstrationsdaten. Aggregierte 0–100-Signale, kein PII, keine Anlageberatung.
        </p>
      </CardContent>
    </Card>
  );
}
