import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Loader2, Plus, Minus, Check, Lock, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useBillingSummary, useBillingCheckout, useBillingPortal } from "@/hooks/use-api";
import { isUnlimitedLimit, planLabel } from "@/lib/api-client";
import { ADDONS, PLANS, gate, isBooked, priceLabel, type ConsoleItem } from "@/lib/consoleCatalog";

/**
 * Abo & Zusatz.
 *
 * Umbau 05.08.2026 (Upsell-Schnitt): die Preisliste liegt nicht mehr hier,
 * sondern in `src/lib/consoleCatalog.ts` — die "Entdecken"-Gruppe der
 * Seitenleiste braucht dieselben Daten, und zwei Listen waeren zwei Wahrheiten
 * (im Gesamtsystem waere es die vierte: Server, Website, Console, Sidebar).
 *
 * Dabei sind vier Kacheln dazugekommen, die serverseitig laengst kaufbar waren
 * und auf useeasy.ai/pricing verkauft werden, im Abo-Tab aber nie standen:
 * Buchhaltung, Zeiterfassung, Beleg-Paket, Compliance-Radar. Neu ist damit auch
 * die dritte Kauf-Bedingung `requires: "accounting"`.
 */

/**
 * Postfach-Zeile der Plan-Karte. (v4.153.0)
 *
 * Vorher stand hier `${derived.total_mailboxes} Postfach/Postfächer` — bei
 * unbegrenzten Postfaechern (Team) haette das "-1 Postfach/Postfächer" ergeben.
 */
function mailboxText(d: { total_mailboxes: number; total_mailboxes_unlimited?: boolean }): string {
  if (isUnlimitedLimit(d.total_mailboxes, d.total_mailboxes_unlimited)) return "Unbegrenzt viele Postfächer";
  return d.total_mailboxes === 1 ? "1 Postfach" : `${d.total_mailboxes} Postfächer`;
}

export default function BillingTab() {
  const { data, isLoading, refetch } = useBillingSummary();
  const checkout = useBillingCheckout();
  const portal = useBillingPortal();
  const ent = data?.entitlements;
  const derived = data?.derived;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Deep-Link aus der Seitenleiste: ?addon=<lookup_key> hebt die Kachel kurz hervor.
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("checkout");
    if (c === "success") { toast.success("Zahlung abgeschlossen — wird übernommen."); refetch(); }
    else if (c === "cancel") { toast("Vorgang abgebrochen."); }
    if (c) { p.delete("checkout"); const q = p.toString(); window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : "")); }
  }, [refetch]);

  /**
   * ?addon=<lookup_key> — kommt aus der Entdecken-Gruppe der Seitenleiste.
   *
   * Gewartet wird auf das Ende von `isLoading`, weil die Kacheln vorher nicht im
   * DOM stehen und scrollIntoView ins Leere liefe. Der Parameter bleibt bewusst
   * in der URL: ein Reload soll dieselbe Kachel wieder zeigen.
   */
  useEffect(() => {
    if (isLoading) return;
    const want = new URLSearchParams(window.location.search).get("addon");
    if (!want) return;
    const el = tileRefs.current[want];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setSpotlight(want);
    const t = setTimeout(() => setSpotlight(null), 2400);
    return () => clearTimeout(t);
  }, [isLoading]);

  const qOf = (it: ConsoleItem) => qty[it.key] ?? (it.min ?? 1);
  const setQ = (it: ConsoleItem, v: number) => setQty((s) => ({ ...s, [it.key]: Math.max(it.min ?? 1, Math.min(it.max ?? 999, v)) }));

  async function buy(it: ConsoleItem) {
    const g = gate(it, ent);
    if (!g.ok) { toast.error(g.hint ?? "Nicht verfügbar"); return; }
    setBusy(it.key);
    try {
      const quantity = it.kind === "qty" ? qOf(it) : 1;
      const res = await checkout.mutateAsync({ lookup_key: it.key, quantity });
      if (res.mode === "checkout" && res.url) { window.location.href = res.url; return; }
      if (res.mode === "plan_changed") toast.success("Plan geändert — anteilig auf der nächsten Rechnung.");
      else toast.success("Dazugebucht — anteilig auf der nächsten Rechnung.");
      refetch();
    } catch (e) {
      const m = (e as Error)?.message || "";
      // Die Gruende kommen wortgleich aus billing_catalog.canPurchase():
      // requires_base_plan | requires_voice | requires_accounting | unknown_key.
      if (/requires_accounting/.test(m)) toast.error("Benötigt die Buchhaltung.");
      else if (/requires_base/.test(m)) toast.error("Benötigt einen E-Mail-Plan.");
      else if (/requires_voice/.test(m)) toast.error("Benötigt Voice „Jana“.");
      else if (/price_not_found/.test(m)) toast.error("Für diese Leistung ist gerade kein Preis hinterlegt. Bitte melde dich kurz bei uns.");
      else toast.error("Konnte nicht buchen: " + m);
    } finally { setBusy(null); }
  }

  async function manage() {
    setBusy("__portal__");
    try {
      const res = await portal.mutateAsync();
      if (res?.url) { window.location.href = res.url; return; }
      toast("Kundenportal ist noch nicht aktiviert (Stripe-Setup ausstehend).");
    } catch {
      toast("Kundenportal ist noch nicht aktiviert (Stripe-Setup ausstehend).");
    } finally { setBusy(null); }
  }

  if (isLoading) return (<div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>);

  const planName = planLabel(ent?.base_plan, true); // true = aus entitlements.base_plan
  const statusBad = ent?.billing_status === "past_due" || ent?.billing_status === "canceled";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="w-5 h-5" /> {planName}</CardTitle>
            <CardDescription className="mt-1">
              {derived ? `${mailboxText(derived)} · ${derived.mail_quota_total.toLocaleString("de-DE")} Mails/Monat` : "—"}
              {ent?.voice_enabled ? " · Voice aktiv" : ""}
              {ent?.copilot_seats ? ` · ${ent.copilot_seats} Co-Pilot-Sitz(e)` : ""}
            </CardDescription>
            {statusBad && <Badge variant="destructive" className="mt-2">{ent?.billing_status === "past_due" ? "Zahlung überfällig" : "Gekündigt"}</Badge>}
          </div>
          <Button variant="outline" size="sm" onClick={manage} disabled={busy === "__portal__"}>
            {busy === "__portal__" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
            <span className="ml-1.5">Verwalten / Kündigen</span>
          </Button>
        </CardHeader>
      </Card>

      <div>
        <h3 className="text-sm font-medium mb-2">E-Mail-Plan</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((it) => {
            const active = ent?.base_plan === (it.key === "ue2_email_pro_monthly" ? "pro" : "starter");
            return (
              <div key={it.key} className="rounded-lg border p-4 flex flex-col">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{it.label}</span>
                  <span className="text-sm"><b>{priceLabel(it.price_eur)}</b> <span className="text-muted-foreground">{it.unit}</span></span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{it.desc}</p>
                <Button className="mt-3" size="sm" variant={active ? "secondary" : "default"} disabled={active || busy === it.key} onClick={() => buy(it)}>
                  {busy === it.key ? <Loader2 className="w-4 h-4 animate-spin" /> : active ? <><Check className="w-4 h-4 mr-1" /> Aktiv</> : "Wählen"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Zusatzleistungen dazubuchen</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADDONS.map((it) => {
            const g = gate(it, ent);
            const isFlag = it.kind === "flag";
            // Flag-Leistungen sind entweder an oder aus. Mengen-Leistungen bleiben
            // buchbar, auch wenn schon eine Einheit da ist (zweites Postfach).
            const flagActive = isFlag && isBooked(it, ent);
            const on = spotlight === it.key;
            return (
              <div
                key={it.key}
                ref={(el) => { tileRefs.current[it.key] = el; }}
                className={
                  "rounded-lg border p-4 flex flex-col transition-shadow duration-300"
                  + (on ? " ring-2 ring-primary ring-offset-2 ring-offset-background" : "")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">{it.label}</span>
                  <span className="text-xs whitespace-nowrap"><b>{priceLabel(it.price_eur)}</b> <span className="text-muted-foreground">{it.unit}</span></span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex-1">{it.desc}</p>
                {!g.ok && <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600"><Lock className="w-3 h-3" /> {g.hint}</div>}
                <div className="mt-3 flex items-center gap-2">
                  {it.kind === "qty" && g.ok && !flagActive && (
                    <div className="flex items-center border rounded-md">
                      <button type="button" className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setQ(it, qOf(it) - 1)} aria-label="weniger"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-8 text-center text-sm tabular-nums">{qOf(it)}</span>
                      <button type="button" className="px-2 py-1 text-muted-foreground hover:text-foreground" onClick={() => setQ(it, qOf(it) + 1)} aria-label="mehr"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <Button size="sm" className="ml-auto" disabled={!g.ok || flagActive || busy === it.key} onClick={() => buy(it)}>
                    {busy === it.key ? <Loader2 className="w-4 h-4 animate-spin" /> : flagActive ? <><Check className="w-4 h-4 mr-1" /> Aktiv</> : isFlag ? "Aktivieren" : "Dazubuchen"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Zusatzbuchungen landen anteilig auf deiner nächsten Rechnung (eine konsolidierte Abrechnung). Preise netto.</p>
      </div>
    </div>
  );
}
