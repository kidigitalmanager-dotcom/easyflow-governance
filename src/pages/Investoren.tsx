import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCapAccounts, useHealthSeries } from "@/hooks/use-capital";
import { AccountDashboard } from "@/components/capital/AccountDashboard";
import { ScoreBadge, Sparkline, IllustrativeBadge, CoverageBadge } from "@/components/capital/CapitalBits";
import type { CapAccount } from "@/lib/capital";

function AccountCard({ account, active, onClick }: { account: CapAccount; active: boolean; onClick: () => void }) {
  const health = useHealthSeries(account.id);
  const series = health.data ?? [];
  const latest = series.length ? series[series.length - 1] : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-4 transition-colors w-full",
        active ? "border-primary/40 bg-primary/5" : "border-border glass-card-hover",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{account.name}</span>
            {latest?.is_illustrative && <IllustrativeBadge />}
          </div>
          <p className="text-[11px] text-muted-foreground">{account.domain ?? account.vertical ?? "—"}</p>
        </div>
        <ScoreBadge value={latest?.health_score} size="sm" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        {health.isLoading ? <Skeleton className="h-9 w-28" /> : <Sparkline data={series.map((s) => ({ period: s.period, v: s.health_score }))} />}
        <CoverageBadge coverage={latest?.coverage} />
      </div>
    </button>
  );
}

export default function Investoren() {
  const accounts = useCapAccounts({ consentedOnly: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = accounts.data ?? [];
  const selected = list.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Investoren-Sicht</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Verifizierte, vorlaufende Signale — nur Firmen mit aktiver Datenfreigabe.
        </p>
      </header>

      {accounts.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Noch keine Firmen mit Datenfreigabe.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <AccountCard key={a.id} account={a} active={selectedId === a.id} onClick={() => setSelectedId(a.id)} />
          ))}
        </div>
      )}

      {selected ? (
        <section className="space-y-3 pt-2">
          <h2 className="text-sm font-medium text-muted-foreground">Detailprofil · {selected.name}</h2>
          <AccountDashboard account={selected} />
        </section>
      ) : list.length > 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Eine Firma auswählen, um das verifizierte Detailprofil zu öffnen.</p>
      ) : null}
    </div>
  );
}
