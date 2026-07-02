import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, ShieldCheck, Star, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCapAccounts, useHealthSeries, useAlerts, useVerificationTiers } from "@/hooks/use-capital";
import { AccountDashboard } from "@/components/capital/AccountDashboard";
import { ScoreBadge, Sparkline, IllustrativeBadge, CoverageBadge, VerificationBadge } from "@/components/capital/CapitalBits";
import { RiskBadge, WatchButton, TieredAlertFeed, FeedHeader } from "@/components/capital/CapitalAlerts";
import { useWatchlist, syncWatchlistFromServer } from "@/lib/watchlist";
import { trailingSlope, verticalLabelDe, type CapAccount } from "@/lib/capital";

function AccountCard({ account, active, onClick, tier }: { account: CapAccount; active: boolean; onClick: () => void; tier?: string | null }) {
  const health = useHealthSeries(account.id);
  const series = health.data ?? [];
  const latest = series.length ? series[series.length - 1] : null;
  const slope = trailingSlope(series.map((s) => s.health_score));
  const isExternal = account.account_type === "external";
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{account.name}</span>
            {latest?.is_illustrative && <IllustrativeBadge />}
            <VerificationBadge tier={tier as any} />
            {isExternal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    <Globe className="w-2.5 h-2.5" /> Öffentliche Signale
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Markt-Index: aus öffentlichen Signalen abgeleitet — ohne Zutun der Firma, keine Datenfreigabe. Nur aggregierte 0–100-Werte, kein PII.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {account.domain ?? "—"}{account.vertical ? ` · ${verticalLabelDe(account.vertical)}` : ""}
          </p>
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs font-medium rounded-lg border px-2.5 py-1 transition-colors",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40",
      )}
    >
      {children}
    </button>
  );
}

function FirmGrid({ accounts, selectedId, onSelect, tierMap }: { accounts: CapAccount[]; selectedId: string | null; onSelect: (id: string) => void; tierMap: Record<string, { verification_tier: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => (
        <AccountCard key={a.id} account={a} active={selectedId === a.id} onClick={() => onSelect(a.id)} tier={tierMap[a.id]?.verification_tier ?? null} />
      ))}
    </div>
  );
}

export default function Investoren() {
  const accounts = useCapAccounts({ consentedOnly: true });
  const externals = useCapAccounts({ type: "external" });
  const alerts = useAlerts({ openOnly: true });
  const { watched, count: watchCount } = useWatchlist();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [watchOnly, setWatchOnly] = useState(false);
  const [marketVertical, setMarketVertical] = useState<string | null>(null);
  const tiers = useVerificationTiers();
  const tierMap = (tiers.data ?? {}) as Record<string, { verification_tier: string }>;

  // one-time cross-device merge (logged-in investors); anon → localStorage only
  useEffect(() => { void syncWatchlistFromServer(); }, []);

  const consentedList = accounts.data ?? [];
  const externalList = externals.data ?? [];

  const visibleConsented = useMemo(
    () => (watchOnly ? consentedList.filter((a) => watched.includes(a.slug)) : consentedList),
    [consentedList, watchOnly, watched],
  );
  const marketVerticals = useMemo(
    () => Array.from(new Set(externalList.map((a) => a.vertical).filter((v): v is string => !!v))).sort(),
    [externalList],
  );
  const visibleExternal = useMemo(() => {
    let l = externalList;
    if (watchOnly) l = l.filter((a) => watched.includes(a.slug));
    if (marketVertical) l = l.filter((a) => a.vertical === marketVertical);
    return l;
  }, [externalList, watchOnly, watched, marketVertical]);

  const feed = useMemo(() => {
    const all = alerts.data ?? [];
    return watchOnly ? all.filter((a) => a.account_slug && watched.includes(a.account_slug)) : all;
  }, [alerts.data, watchOnly, watched]);
  const criticalCount = feed.filter((a) => a.severity === "critical").length;

  const selected = useMemo(
    () => [...consentedList, ...externalList].find((a) => a.id === selectedId) ?? null,
    [consentedList, externalList, selectedId],
  );

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
            Verifizierte Frühwarn-Signale — Firmen mit Datenfreigabe plus öffentlicher Markt-Index.
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

      {/* Frühwarn-Alert-Feed (Datenfreigabe-Firmen + Markt-Index) */}
      <section className="space-y-3">
        <FeedHeader count={criticalCount} />
        <TieredAlertFeed alerts={feed} loading={alerts.isLoading} max={8} />
      </section>

      {/* Firmen mit Datenfreigabe */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{watchOnly ? "Beobachtete Firmen (Datenfreigabe)" : "Firmen mit Datenfreigabe"}</h2>
        {accounts.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : visibleConsented.length === 0 ? (
          <Card className="glass-card"><CardContent className="py-8 text-center text-sm text-muted-foreground">
            {watchOnly ? "Keine beobachteten Firmen mit Datenfreigabe." : "Noch keine Firmen mit Datenfreigabe."}
          </CardContent></Card>
        ) : (
          <FirmGrid accounts={visibleConsented} selectedId={selectedId} onSelect={setSelectedId} tierMap={tierMap} />
        )}
      </section>

      {/* Markt-Index · Externe Firmen (öffentliche Signale, keine Datenfreigabe) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Markt-Index · Externe Firmen
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Aus öffentlichen Signalen abgeleitet (Web-Präsenz, Such-Nachfrage, Nachrichten, Hiring …) — ohne Zutun der Firma, keine Datenfreigabe. Aggregierte 0–100-Indizes, kein PII.
          </p>
        </div>
        {marketVerticals.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={marketVertical === null} onClick={() => setMarketVertical(null)}>Alle</FilterChip>
            {marketVerticals.map((v) => (
              <FilterChip key={v} active={marketVertical === v} onClick={() => setMarketVertical(v)}>{verticalLabelDe(v)}</FilterChip>
            ))}
          </div>
        )}
        {externals.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : visibleExternal.length === 0 ? (
          <Card className="glass-card"><CardContent className="py-8 text-center text-sm text-muted-foreground">
            {watchOnly ? "Keine beobachteten Firmen im Markt-Index." : "Noch keine externen Firmen im Markt-Index."}
          </CardContent></Card>
        ) : (
          <FirmGrid accounts={visibleExternal} selectedId={selectedId} onSelect={setSelectedId} tierMap={tierMap} />
        )}
      </section>

      {selected ? (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">Detailprofil · {selected.name}</h2>
          <AccountDashboard account={selected} />
        </section>
      ) : (visibleConsented.length > 0 || visibleExternal.length > 0) ? (
        <p className="text-sm text-muted-foreground text-center py-6">Eine Firma auswählen, um das verifizierte Detailprofil zu öffnen.</p>
      ) : null}
    </div>
  );
}
