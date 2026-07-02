import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, Layers, BellRing, BarChart3 } from "lucide-react";
import {
  useHealthSeries, useCategorySeries, useMetricValues, useCapCatalog,
  useAccountAlerts, useHealthBenchmark, useFreshness,
} from "@/hooks/use-capital";
import {
  ScoreBadge, IllustrativeBadge, CoverageBadge, HealthTimeline, CategoryBars, KpiTable, ProvenancePanel,
} from "@/components/capital/CapitalBits";
import { RiskBadge, TieredAlertFeed, BenchmarkBand, NoBenchmarkHint } from "@/components/capital/CapitalAlerts";
import { DataFreshnessBadge, SignalBasisBadge } from "@/components/capital/CapitalFreshness";
import {
  fmtMonth, trailingSlope,
  type CapAccount, type MetricValue, type HealthPoint, type CategoryPoint, type CapAlert, type FreshnessRow,
} from "@/lib/capital";

function monthsBetween(aIso: string, bIso: string): number {
  const [ay, am] = aIso.slice(0, 7).split("-").map(Number);
  const [by, bm] = bIso.slice(0, 7).split("-").map(Number);
  return (ay - by) * 12 + (am - bm);
}

// Injected data comes from the authenticated my-signals edge function (own-tenant path).
// When omitted, the component reads via the anon client as before (demo / investor path).
export type AccountDashboardData = {
  health: HealthPoint[];
  categories: CategoryPoint[];
  values: MetricValue[];
  alerts: CapAlert[];
  freshness?: FreshnessRow[];
};

export function AccountDashboard({ account, data, variant = "investor", onConnectSource }: {
  account: CapAccount; data?: AccountDashboardData;
  variant?: "tenant" | "investor";           // "tenant" = eigene /signale-Ansicht (Deep-Links aktiv)
  onConnectSource?: (source: string) => void; // springt in die Datenquellen-Sub-Sidebar
}) {
  const injected = !!data;
  const catalog = useCapCatalog();
  // Anon-client hooks can't read a consent=false tenant, so disable them when data is injected.
  const healthHook = useHealthSeries(injected ? undefined : account.id);
  const catsHook = useCategorySeries(injected ? undefined : account.id);
  const valuesHook = useMetricValues(injected ? undefined : account.id);
  const acctAlertsHook = useAccountAlerts(injected ? undefined : account.id);
  const benchmarks = useHealthBenchmark();
  const freshness = useFreshness(injected ? undefined : account.id);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const healthData: HealthPoint[] = data?.health ?? healthHook.data ?? [];
  const catsData: CategoryPoint[] = data?.categories ?? catsHook.data ?? [];
  const valuesData: MetricValue[] = data?.values ?? valuesHook.data ?? [];
  const alertsData: CapAlert[] = data?.alerts ?? acctAlertsHook.data ?? [];
  const alertsLoading = injected ? false : acctAlertsHook.isLoading;
  // Injected (my-signals) path carries its own freshness (anon client can't read a tenant); external/demo use the hook.
  const freshnessRows: FreshnessRow[] = injected ? (data?.freshness ?? []) : (freshness.data ?? []);

  const loading = catalog.isLoading || (!injected && (healthHook.isLoading || catsHook.isLoading || valuesHook.isLoading));

  const model = useMemo(() => {
    const hs = healthData;
    const latestPeriod = hs.length ? hs[hs.length - 1].period : null;
    const latestHealth = hs.length ? hs[hs.length - 1] : null;
    const slope = trailingSlope(hs.map((h) => h.health_score));
    const scoreByKey: Record<string, { score: number | null; coverage: number | null }> = {};
    catsData.filter((c) => c.period === latestPeriod).forEach((c) => {
      scoreByKey[c.category_key] = { score: c.category_score, coverage: c.coverage };
    });
    const latestByMetric: Record<string, MetricValue> = {};
    valuesData.filter((v) => v.period === latestPeriod).forEach((v) => { latestByMetric[v.metric_key] = v; });
    const used = new Set<string>();
    Object.values(latestByMetric).forEach((v) => (v.provenance?.sources_used ?? []).forEach((s: string) => used.add(s)));
    const usedArr = Array.from(used);
    const missing = (catalog.data?.sources ?? [])
      .filter((s) => !used.has(s.key) && ["comms_inbox", "stripe", "shopify", "insolvenz", "handelsregister", "bank_psp"].includes(s.key))
      .map((s) => s.name);
    let lead: number | null = null;
    let firstRed: string | null = null;
    if (account.failure_month) {
      const fr = hs.find((h) => h.health_score != null && (h.health_score as number) < 50);
      if (fr) { firstRed = fr.period; lead = monthsBetween(account.failure_month, fr.period); }
    }
    return { latestPeriod, latestHealth, slope, points: hs.length, scoreByKey, latestByMetric, usedArr, missing, lead, firstRed };
  }, [healthData, catsData, valuesData, catalog.data, account.failure_month]);

  const benchmark = useMemo(
    () => (benchmarks.data ?? []).find((b) => b.vertical === account.vertical) ?? null,
    [benchmarks.data, account.vertical],
  );

  if (loading) return <Skeleton className="h-72 w-full" />;

  const cat = (catalog.data?.categories ?? []);
  const metricsForCat = (catalog.data?.metrics ?? []).filter((m) => m.category_key === selectedCat);
  const sourceName = (k: string) => (catalog.data?.sources ?? []).find((s) => s.key === k)?.name ?? k;

  return (
    <div className="space-y-5">
      {/* Header score */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Health Score</span>
                {model.latestHealth?.is_illustrative && <IllustrativeBadge />}
              </div>
              <div className="mt-1 flex items-center gap-4">
                <ScoreBadge value={model.latestHealth?.health_score} size="lg" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Stand {fmtMonth(model.latestPeriod)}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CoverageBadge coverage={model.latestHealth?.coverage} />
                    <RiskBadge slope={model.slope} points={model.points} size="md" />
                    <DataFreshnessBadge rows={freshnessRows} loading={injected ? false : freshness.isLoading} />
                    <SignalBasisBadge values={valuesData} />
                  </div>
                </div>
              </div>
            </div>
            {model.lead != null && model.lead > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-[#2F6FED]/30 bg-[#2F6FED]/10 px-3 py-2 text-[#7aa7f5]">
                <TrendingDown className="w-4 h-4" />
                <span className="text-sm font-medium">Signal {model.lead} Monate vor Ausfall ({fmtMonth(account.failure_month)})</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Frühwarn-Alerts + Benchmark */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="glass-card lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BellRing className="w-4 h-4" /> Frühwarn-Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TieredAlertFeed alerts={alertsData} loading={alertsLoading} showAccount={false} />
          </CardContent>
        </Card>
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Sektor-Benchmark
            </CardTitle>
          </CardHeader>
          <CardContent>
            {benchmark && benchmark.n_accounts >= 2 ? (
              <BenchmarkBand
                value={model.latestHealth?.health_score ?? null}
                median={benchmark.median_health} p25={benchmark.p25_health} p75={benchmark.p75_health}
                n={benchmark.n_accounts} verticalLabel={account.vertical ?? undefined}
              />
            ) : <NoBenchmarkHint />}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Health-Verlauf (0–100, 100 = gesund)</CardTitle></CardHeader>
        <CardContent><HealthTimeline data={healthData} failureMonth={account.failure_month} /></CardContent>
      </Card>

      {/* Categories + drill-down */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Hauptkategorien</CardTitle></CardHeader>
          <CardContent>
            <CategoryBars categories={cat} scoreByKey={model.scoreByKey} onSelect={setSelectedCat} selected={selectedCat} />
            <p className="text-[11px] text-muted-foreground mt-3">Kategorie wählen für KPI-Drill-down ↓</p>
          </CardContent>
        </Card>

        <Card className="glass-card lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers className="w-4 h-4" />
              {selectedCat ? `KPIs · ${cat.find((c) => c.key === selectedCat)?.name}` : "KPIs (Kategorie wählen)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCat
              ? <KpiTable metrics={metricsForCat} latestByMetric={model.latestByMetric} sourceName={sourceName} variant={variant} onConnect={onConnectSource} />
              : <p className="text-sm text-muted-foreground py-8 text-center">Links eine Kategorie anklicken, um die einzelnen KPIs und ihre Quellen zu sehen.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Provenance */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Provenance & Transparenz</CardTitle></CardHeader>
        <CardContent><ProvenancePanel used={model.usedArr} missing={model.missing} illustrative={!!model.latestHealth?.is_illustrative} /></CardContent>
      </Card>
    </div>
  );
}
