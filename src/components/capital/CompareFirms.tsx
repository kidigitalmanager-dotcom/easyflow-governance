import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, X } from "lucide-react";
import {
  useHealthSeries, useCategorySeries, useFreshness, useAccountAlerts, useCapCatalog,
} from "@/hooks/use-capital";
import { ScoreBadge, Sparkline, CoverageBadge } from "@/components/capital/CapitalBits";
import { RiskBadge } from "@/components/capital/CapitalAlerts";
import { worstFreshness } from "@/components/capital/CapitalFreshness";
import { trailingSlope, scoreColor, verticalLabelDe, type CapAccount } from "@/lib/capital";

// ─────────────────────────────────────────────────────────────────────────────
// Firmen-Vergleich (Investor Follow-up): bis zu 3 Firmen nebeneinander —
// Score (ehrlich, freshness-gegated), Trend, Kategorien, kritische Alerts.
// Nur vorhandene Hooks/Views, read-only, kein PII.
// ─────────────────────────────────────────────────────────────────────────────

function FirmColumn({ account }: { account: CapAccount }) {
  const health = useHealthSeries(account.id);
  const cats = useCategorySeries(account.id);
  const fresh = useFreshness(account.id);
  const alerts = useAccountAlerts(account.id);
  const catalog = useCapCatalog();

  const series = health.data ?? [];
  const latest = series.length ? series[series.length - 1] : null;
  const slope = trailingSlope(series.map((s) => s.health_score));
  const worst = (worstFreshness(fresh.data ?? [])?.status ?? undefined) as
    "fresh" | "stale" | "dead" | "no_sla" | undefined;
  const critical = (alerts.data ?? []).filter((a) => a.severity === "critical").length;

  const latestPeriod = latest?.period ?? null;
  const catScores = new Map<string, number | null>();
  (cats.data ?? []).filter((c) => c.period === latestPeriod).forEach((c) => catScores.set(c.category_key, c.category_score));

  if (health.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3 min-w-0">
      <div>
        <p className="text-sm font-semibold truncate">{account.name}</p>
        <p className="text-[11px] text-muted-foreground">{account.vertical ? verticalLabelDe(account.vertical) : "—"}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ScoreBadge value={latest?.health_score} size="sm" quality={{ coverage: latest?.coverage, worstFreshness: worst }} />
        <Sparkline data={series.map((s) => ({ period: s.period, v: s.health_score }))} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <RiskBadge slope={slope} points={series.length} />
        <CoverageBadge coverage={latest?.coverage} />
        <span className={"text-[11px] font-semibold " + (critical > 0 ? "text-p0" : "text-muted-foreground")}>
          {critical > 0 ? `${critical} kritisch` : "0 kritisch"}
        </span>
      </div>
      <div className="space-y-1 pt-1 border-t border-border">
        {(catalog.data?.categories ?? []).map((c) => {
          const v = catScores.get(c.key);
          return (
            <div key={c.key} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground truncate">{c.name}</span>
              <span className="font-semibold tabular-nums" style={{ color: v != null ? scoreColor(v) : undefined }}>
                {v != null ? Math.round(v) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CompareFirms({ accounts }: { accounts: CapAccount[] }) {
  const [slugs, setSlugs] = useState<(string | null)[]>([null, null, null]);
  const chosen = slugs
    .map((s) => accounts.find((a) => a.slug === s) ?? null)
    .filter((a): a is CapAccount => !!a);

  const setSlot = (i: number, v: string) =>
    setSlugs((prev) => prev.map((s, j) => (j === i ? (v || null) : s)));

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Scale className="w-[18px] h-[18px] text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight">Firmen vergleichen</h3>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">Bis zu 3 Firmen nebeneinander: Score, Trend, Kategorien, kritische Signale.</p>
          </div>
          {chosen.length > 0 && (
            <button
              onClick={() => setSlugs([null, null, null])}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" /> Zurücksetzen
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <select
              key={i}
              value={slugs[i] ?? ""}
              onChange={(e) => setSlot(i, e.target.value)}
              className="text-xs rounded-lg border border-border bg-background text-foreground px-2 py-1.5 max-w-[220px]"
            >
              <option value="">{`Firma ${i + 1} wählen …`}</option>
              {accounts.map((a) => (
                <option key={a.slug} value={a.slug} disabled={slugs.includes(a.slug) && slugs[i] !== a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          ))}
        </div>

        {chosen.length >= 2 ? (
          <div className={"grid gap-3 " + (chosen.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
            {chosen.map((a) => <FirmColumn key={a.id} account={a} />)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Mindestens 2 Firmen wählen, um den Vergleich zu sehen.</p>
        )}
      </CardContent>
    </Card>
  );
}
