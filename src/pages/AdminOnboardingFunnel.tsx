import { useEffect, useState } from "react";
import { useMe } from "@/hooks/use-api";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, RefreshCw, ShoppingCart, MailCheck, PlugZap, AlarmClock } from "lucide-react";

// v4.64: Onboarding-Funnel (Super-Admin). Zeigt für Self-Serve-Käufer:
// gekauft → Connect-Link verschickt → Postfach verbunden, plus eine Liste der
// „hängenden" Käufer (gekauft, aber nicht verbunden). Proaktive Sicht, bevor ein
// Ticket kommt. Defense-in-Depth: useMe-Gate hier + Backend-403 am Endpoint.
const FUNNEL_API = "https://api.useeasy.ai/v1/admin/ops/onboarding-funnel";

type Funnel = {
  purchased: number; link_sent: number; connected: number;
  not_connected: number; connect_rate: number;
};
type Stuck = {
  tenant_id: string; company: string | null; email: string | null;
  hours_since: number; reminded: boolean;
};

export default function AdminOnboardingFunnel() {
  const { data: me, isLoading } = useMe();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [stuck, setStuck] = useState<Stuck[]>([]);

  async function load() {
    setLoading(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(FUNNEL_API, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setFunnel(j.funnel as Funnel);
      setStuck(Array.isArray(j.stuck) ? j.stuck : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Netzwerk-Fehler");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (me?.user?.is_super_admin) load(); /* eslint-disable-next-line */ }, [me]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Dieser Bereich ist nur für Super-Admins.</p>
      </div>
    );
  }

  const cards = funnel ? [
    { icon: ShoppingCart, label: "Gekauft", value: funnel.purchased, hint: "Self-Serve-Käufe gesamt" },
    { icon: MailCheck, label: "Link verschickt", value: funnel.link_sent, hint: "Connect-Link/Mail erzeugt" },
    { icon: PlugZap, label: "Postfach verbunden", value: funnel.connected, hint: `Verbindungsrate ${funnel.connect_rate}%` },
    { icon: AlarmClock, label: "Noch offen", value: funnel.not_connected, hint: "gekauft, aber nicht verbunden" },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Onboarding-Funnel</h1>
          <p className="text-sm text-muted-foreground">Wo stehen die Self-Serve-Käufer — gekauft, Link verschickt, verbunden.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Aktualisieren
        </button>
      </div>

      {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Fehler: {err}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground"><c.icon size={16} /><span className="text-xs">{c.label}</span></div>
            <div className="mt-2 text-2xl font-semibold">{c.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
          </div>
        ))}
        {!funnel && !loading && <div className="text-sm text-muted-foreground col-span-full">Noch keine Self-Serve-Käufe.</div>}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Hängende Käufer ({stuck.length}) — gekauft, Postfach noch nicht verbunden</h2>
        {stuck.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine offenen Fälle — alle Käufer haben verbunden. 🎉</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Firma / Tenant</th>
                  <th className="text-left font-medium px-3 py-2">E-Mail</th>
                  <th className="text-right font-medium px-3 py-2">seit Kauf</th>
                  <th className="text-left font-medium px-3 py-2">erinnert?</th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((s) => (
                  <tr key={s.tenant_id} className="border-t">
                    <td className="px-3 py-2">{s.company || <span className="text-muted-foreground">{s.tenant_id}</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.email || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{s.hours_since} h</td>
                    <td className="px-3 py-2">
                      {s.reminded
                        ? <span className="text-xs rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5">erinnert</span>
                        : <span className="text-xs rounded-full bg-amber-500/10 text-amber-600 px-2 py-0.5">noch nicht</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Die Erinnerung läuft automatisch (48 h nach Kauf, einmalig). Diese Liste ist nur zur Übersicht.
        </p>
      </div>
    </div>
  );
}
