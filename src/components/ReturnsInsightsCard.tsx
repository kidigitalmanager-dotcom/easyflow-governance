import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Undo2, Info, ChevronDown, ShoppingBag, Mail, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReturnsInsights } from "@/hooks/use-api";

// Retouren-Grund-Intelligenz — zeigt, WARUM Kunden zurueckschicken (7 feste Buckets),
// aus Shopify strukturiert (Ruecksendeportal-Codes) + E-Mail-Fallback fuer eigene Shops.
// Doppelnutzen: Dashboard-Insight UND Underwriting-Signal fuers Factoring.
// Ehrlich: duenne-Daten-Fall, Quellen-Herkunft, "Stand"-Freshness, keine Fake-Zahlen.

// Fixe Farb-Zuordnung je Bucket (inline-style -> kein Tailwind-Purge-Risiko).
const REASON_COLOR: Record<string, string> = {
  "Größe/Passform": "#6366f1",
  "Defekt/Qualität": "#ef4444",
  "Falscher Artikel": "#f59e0b",
  "Gefällt nicht/Meinung geändert": "#8b5cf6",
  "Zu spät geliefert": "#14b8a6",
  "Doppelbestellung": "#64748b",
  "Sonstiges": "#94a3b8",
};
// Diese zwei Buckets hat Shopify NICHT als Grund-Enum -> kommen nur aus E-Mail/anderen Tools.
const SHOPIFY_BLIND = new Set(["Zu spät geliefert", "Doppelbestellung"]);

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "vor einem Monat" : `vor ${months} Monaten`;
}

export function ReturnsInsightsCard() {
  const q = useReturnsInsights();
  const data = q.data;
  const [methodOpen, setMethodOpen] = useState(false);

  const monthlyTrend = useMemo(() => {
    const m = (data?.monthly || []).slice(-6);
    const max = Math.max(1, ...m.map((x) => x.total || 0));
    return { rows: m, max };
  }, [data]);

  if (q.isLoading) {
    return (
      <Card className="glass-card border-primary/20">
        <CardContent className="pt-4 pb-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }
  // Endpoint noch nicht deployt / kein Ergebnis -> Karte ausblenden (retry:false).
  if (!data) return null;

  const total = data.total || 0;
  const hasData = !!data.has_data && total > 0;
  const sources = data.sources || [];
  const hasShopify = sources.some((s) => s.source === "shopify" && s.count > 0);
  const hasLlm = sources.some((s) => s.source === "llm" && s.count > 0);
  const stand = relTime(data.last_updated);

  const Header = (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        <Undo2 className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground leading-none">Retouren-Gründe</p>
        <h3 className="text-sm font-semibold text-foreground leading-tight mt-0.5">Warum Kunden zurückschicken</h3>
      </div>
    </div>
  );

  if (!hasData) {
    return (
      <Card className="glass-card border-border">
        <CardContent className="pt-4 pb-4">
          {Header}
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground">Noch keine Retouren-Gründe erfasst.</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Verbinde deinen Shopify-Shop (mit der Berechtigung <span className="font-medium">read_returns</span>), dann
              ziehen wir die im Rücksende­portal angekreuzten Gründe strukturiert. Für eigene Shops ohne Shopify-Rücksende­portal
              werten wir stattdessen die als Rückgabe eingeordneten E-Mails aus.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Plug className="w-3.5 h-3.5" /> Quelle noch nicht verbunden
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Verteilung nach Anzahl absteigend; nur Buckets mit count>0 als Balken.
  const dist = [...(data.distribution || [])].filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  const top = dist[0];
  const topShare = top ? Math.round((top.count / total) * 100) : 0;

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          {Header}
          <div className="text-right shrink-0">
            <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums leading-none">
              {total.toLocaleString("de-DE")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Retouren · letzte 12 Mon.</p>
          </div>
        </div>

        {/* Top-Grund-Zeile */}
        {top && (
          <p className="mt-3 text-sm text-foreground">
            Häufigster Grund:{" "}
            <span className="font-semibold" style={{ color: REASON_COLOR[top.reason] || undefined }}>
              {top.reason}
            </span>{" "}
            <span className="text-muted-foreground">({topShare}%)</span>
          </p>
        )}

        {/* Balken-Verteilung der Gründe */}
        <div className="mt-3 space-y-2">
          {dist.map((d) => {
            const share = Math.round((d.count / total) * 100);
            return (
              <div key={d.reason}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-foreground truncate pr-2">{d.reason}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {d.count.toLocaleString("de-DE")} · {share}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, share)}%`, backgroundColor: REASON_COLOR[d.reason] || "#94a3b8" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Monats-Trend (Gesamt-Retouren je Monat, letzte 6) */}
        {monthlyTrend.rows.length >= 2 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Verlauf</p>
            <div className="flex items-end gap-1.5 h-16">
              {monthlyTrend.rows.map((m) => {
                const h = Math.round(((m.total || 0) / monthlyTrend.max) * 100);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex items-end justify-center" style={{ height: "48px" }}>
                      <div
                        className="w-full max-w-[28px] rounded-t bg-primary/70"
                        style={{ height: `${Math.max(4, h)}%` }}
                        title={`${m.month}: ${m.total}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums truncate w-full text-center">
                      {m.month.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quellen-Herkunft + Stand */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          {hasShopify && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/40 px-2 py-0.5 text-muted-foreground">
              <ShoppingBag className="w-3 h-3" /> Shopify
            </span>
          )}
          {hasLlm && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/40 px-2 py-0.5 text-muted-foreground">
              <Mail className="w-3 h-3" /> E-Mail-Analyse
            </span>
          )}
          {stand && <span className="text-muted-foreground">· Stand: {stand}</span>}
        </div>

        {/* Methode/Ehrlichkeit (Aufklapper) */}
        <button
          onClick={() => setMethodOpen((o) => !o)}
          aria-expanded={methodOpen}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Info className="w-3.5 h-3.5" /> Wie entsteht das?
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", methodOpen && "rotate-180")} />
        </button>
        {methodOpen && (
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-4 space-y-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              <span className="inline-flex items-center gap-1 text-foreground font-medium"><ShoppingBag className="w-3.5 h-3.5" /> Shopify</span>{" "}
              liefert die im Rücksende­portal angekreuzten Gründe strukturiert (10 Codes → 7 Buckets). Nur Aggregate,
              keine Kundendaten.
            </p>
            <p>
              <span className="inline-flex items-center gap-1 text-foreground font-medium"><Mail className="w-3.5 h-3.5" /> E-Mail-Analyse</span>{" "}
              ist der Fallback für eigene Shops ohne Rücksende­portal: als Rückgabe eingeordnete E-Mails werden
              pseudonymisiert einem Grund zugeordnet (sekundär, weniger präzise).
            </p>
            {hasShopify && !hasLlm && (
              <p>
                Hinweis: Shopify kennt keine Grund-Codes für <span className="text-foreground">„Zu spät geliefert"</span> und{" "}
                <span className="text-foreground">„Doppelbestellung"</span> — diese erscheinen nur über die E-Mail-Analyse oder
                andere Retouren-Tools.
              </p>
            )}
            <p className="text-[11px]">Zeitraum: letzte 12 Monate. Grundlage für das Retouren-Signal im Factoring-Antrag.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReturnsInsightsCard;
