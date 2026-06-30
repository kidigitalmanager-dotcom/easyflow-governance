import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCapAccounts, useHealthSeries, useAlerts } from "@/hooks/use-capital";
import { AccountDashboard } from "@/components/capital/AccountDashboard";
import { ScoreBadge, Sparkline, IllustrativeBadge, CoverageBadge } from "@/components/capital/CapitalBits";
import { RiskBadge, WatchButton, AlertFeed, FeedHeader } from "@/components/capital/CapitalAlerts";
import { useWatchlist, syncWatchlistFromServer } from "@/lib/watchlist";
import { trailingSlope, type CapAccount } from "@/lib/capital";

function AccountCard({ account, active, onClick }: { account: CapAccount; active: boolean; onClick: () => void }) {
  const health = useHealthSeries(account.id);
  const series = health.data ?? [];
  const latest = series.length ? series[series.length - 1] : null;
  const slope = trailingSlope(series.map((s) => s.health_score));
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-colors w-full",
        active ? "border-primary/40 bg-primary/5" : "border-border glass-card-hover",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">{account.name}</span>
            {latest?.is_illustrative && <IllustrativeBadge />}
          </div>
          <p className="text-[11px] text-muted-foreground">{account.domain ?? account.vertical ?? "—"}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <WatchButton slug={account.slug} />
          <ScoreBadge value={latest?.health_score} size="sm" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {health.isLoading ? <Skeleton className="h-9 w-28" /> : <Sparkline data={series.map((s) => ({ period: s.period, v: s.health_score }))} />}
        <div className="flex items-center gap-2">
          <RiskBadge slope={slope} points={series.length} />
          <CoverageBadge coverage={latest?.coverage} />
        </div>
      </div>
    </button>
  );
}

export default function Investoren() {
  const accounts = useCapAccounts({ consentedOnly: true });
  const alerts = useAlerts({ openOnly: true });
  const { watched, count: watchCount } = useWatchlist();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [watchOnly, setWatchOnly] = useState(false);

  // one-time cross-device merge (logged-in investors); anon → localStorage only
  useEffect(() => { void syncWatchlistFromServer(); }, []);

  const list = accounts.data ?? [];
  const visibleList = useMemo(
    () => (watchOnly ? list.filter((a) => watched.includes(a.slug)) : list),
    [list, watchOnly, watched],
  );
  const feed = useMemo(() => {
    const all = alerts.data ?? [];
    return watchOnly ? all.filter((a) => a.account_slug && watched.includes(a.account_slug)) : all;
  }, [alerts.data, watchOnly, watched]);
  const criticalCount = feed.filter((a) => a.severity === "critical").length;
  const selected = list.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Investoren-Sicht</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Verifizierte, vorlaufende Signale — nur Firmen mit aktiver Datenfreigabe.
          </p>
        </div>
        <button
          onClick={() => setWatchOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border px-3 py-1.5 transition-colors",
            watchOnly ? "border-amber-400/40 bg-amber-400/10 text-amber-400" : "border-border text-muted-foreground hover:bg-muted/40",
          )}
        >
          <Star className={cn("w-3.5 h-3.5", watchOnly && "fill-amber-400")} />
          Watchlist{watchCount > 0 ? ` (${watchCount})` : ""}
        </button>
      </header>

      {/* Frühwarn-Alert-Feed */}
      <section className="space-y-3">
        <FeedHeader count={criticalCount} />
        <AlertFeed
          alerts={feed}
          loading={alerts.isLoading}
          emptyText={watchOnly ? "Keine offenen Alerts in deiner Watchlist." : "Keine offenen Alerts — alle überwachten Firmen stabil."}
          max={8}
        />
        {(alerts.data?.length ?? 0) > 8 && !watchOnly && (
          <p className="text-[11px] text-muted-foreground text-center">Zeigt die 8 schwersten Alerts · Detailprofil je Firma unten.</p>
        )}
      </section>

      {/* Firmen */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{watchOnly ? "Beobachtete Firmen" : "Firmen mit Datenfreigabe"}</h2>
        {accounts.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : visibleList.length === 0 ? (
          <Card className="glass-card"><CardContent className="py-12 text-center text-sm text-muted-foreground">
            {watchOnly ? "Noch keine Firmen beobachtet — Stern auf einer Karte antippen." : "Noch keine Firmen mit Datenfreigabe."}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleList.map((a) => (
              <AccountCard key={a.id} account={a} active={selectedId === a.id} onClick={() => setSelectedId(a.id)} />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">Detailprofil · {selected.name}</h2>
          <AccountDashboard account={selected} />
        </section>
      ) : visibleList.length > 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Eine Firma auswählen, um das verifizierte Detailprofil zu öffnen.</p>
      ) : null}
    </div>
  );
}
