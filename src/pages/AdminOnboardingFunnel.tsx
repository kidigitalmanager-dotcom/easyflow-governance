import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/hooks/use-api";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/ue/primitives";
import { ShieldAlert, Loader2, RefreshCw, PlugZap } from "lucide-react";

// v4.64: Onboarding-Funnel (Super-Admin). Zeigt für Self-Serve-Käufer:
// gekauft → Connect-Link verschickt → Postfach verbunden, plus eine Liste der
// „hängenden" Käufer (gekauft, aber nicht verbunden). Proaktive Sicht, bevor ein
// Ticket kommt. Defense-in-Depth: useMe-Gate hier + Backend-403 am Endpoint.
//
// Redesign 27.07.2026: KPIs als StatCard (Count-up, „–" wenn der Server nichts
// liefert), Fehler als QueryErrorNotice — ein Ausfall darf nicht wie „noch keine
// Käufe" aussehen.
const FUNNEL_API = "https://api.useeasy.ai/v1/admin/ops/onboarding-funnel";

type Funnel = {
  purchased: number; link_sent: number; connected: number;
  not_connected: number; connect_rate: number;
};
type Stuck = {
  tenant_id: string; company: string | null; email: string | null;
  hours_since: number; reminded: boolean;
};
/** Antwort des Ops-Endpoints — bewusst eng typisiert statt `any`. */
type FunnelResponse = { ok?: boolean; error?: string; funnel?: Funnel; stuck?: Stuck[] };

export default function AdminOnboardingFunnel() {
  const meQ = useMe();
  const me = meQ.data;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [stuck, setStuck] = useState<Stuck[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(FUNNEL_API, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as FunnelResponse;
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setFunnel(j.funnel ?? null);
      setStuck(Array.isArray(j.stuck) ? j.stuck : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Netzwerk-Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  const isSuperAdmin = !!me?.user?.is_super_admin;
  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  if (meQ.isLoading) return <Skeleton className="h-8 w-56" />;
  // /me-Fehler ist kein „Kein Zugriff" — der Gate bleibt trotzdem zu.
  if (meQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Admin" title="Onboarding-Funnel" />
        <QueryErrorNotice
          label="Deine Berechtigung konnte nicht geprüft werden."
          onRetry={() => meQ.refetch()}
          retrying={meQ.isFetching}
        />
      </div>
    );
  }
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg space-y-2">
        <div className="flex items-center gap-2 text-danger">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
        </div>
        <p className="text-sm text-muted-foreground">Dieser Bereich ist nur für Super-Admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Onboarding-Funnel"
        subtitle="Wo stehen die Self-Serve-Käufer — gekauft, Link verschickt, Postfach verbunden."
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-muted px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-primary/35 disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Aktualisieren
          </button>
        }
      />

      {/* Fehler ≠ leer: ohne diesen Hinweis sähe ein Ausfall wie „keine Käufe" aus. */}
      {err ? (
        <QueryErrorNotice
          label={`Der Funnel konnte nicht geladen werden (${err}).`}
          onRetry={load}
          retrying={loading}
        />
      ) : loading && !funnel ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-[var(--radius)]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Gekauft"
            value={funnel ? funnel.purchased : null}
            glow
            hint="Self-Serve-Käufe gesamt"
            className="stagger-1 animate-fade-up"
          />
          <StatCard
            label="Link verschickt"
            value={funnel ? funnel.link_sent : null}
            hint="Connect-Link/Mail erzeugt"
            className="stagger-2 animate-fade-up"
          />
          <StatCard
            label="Postfach verbunden"
            value={funnel ? funnel.connected : null}
            hint={funnel ? `Verbindungsrate ${funnel.connect_rate} %` : "Verbindungsrate –"}
            className="stagger-3 animate-fade-up"
          />
          <StatCard
            label="Noch offen"
            value={funnel ? funnel.not_connected : null}
            tone={funnel && funnel.not_connected > 0 ? "amber" : "emerald"}
            hint="gekauft, aber nicht verbunden"
            className="stagger-4 animate-fade-up"
          />
        </div>
      )}

      <SectionCard
        title={`Hängende Käufer${err ? "" : ` (${stuck.length})`}`}
        subtitle="gekauft, Postfach noch nicht verbunden"
        bodyClassName={stuck.length > 0 && !err ? "p-0" : undefined}
      >
        {err ? (
          <QueryErrorNotice label="Die Liste der hängenden Käufer ist nicht aktuell." onRetry={load} retrying={loading} />
        ) : loading && stuck.length === 0 ? (
          <Skeleton className="h-20 w-full rounded-[10px]" />
        ) : stuck.length === 0 ? (
          <EmptyState
            icon={<PlugZap className="h-7 w-7" />}
            title="Keine offenen Fälle."
            description="Alle Self-Serve-Käufer haben ihr Postfach verbunden."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line-soft text-tx-weak">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em]">Firma / Tenant</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em]">E-Mail</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">seit Kauf</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em]">erinnert?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {stuck.map((s) => (
                  <tr key={s.tenant_id} className="transition-colors hover:bg-surface-hover">
                    <td className="px-4 py-2.5 text-tx-secondary">
                      {s.company || <span className="font-mono text-muted-foreground">{s.tenant_id}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.email || "—"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular">{s.hours_since} h</td>
                    <td className="px-4 py-2.5">
                      {s.reminded ? (
                        <span className="rounded-full border border-primary/30 bg-emerald-surface px-2 py-0.5 text-[11px] font-medium text-emerald-light">
                          erinnert
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber/30 bg-amber-surface px-2 py-0.5 text-[11px] font-medium text-amber">
                          noch nicht
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-tx-weak">
        Die Erinnerung läuft automatisch (48 h nach Kauf, einmalig). Diese Liste ist nur zur Übersicht.
      </p>
    </div>
  );
}
