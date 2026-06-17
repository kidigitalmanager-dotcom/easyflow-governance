import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Loader2, Plus, Minus, Check, Lock, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useBillingSummary, useBillingCheckout, useBillingPortal } from "@/hooks/use-api";
import type { BillingEntitlements } from "@/lib/api-client";

type Req = "base" | "voice" | null;
interface Item { key: string; label: string; price: string; unit: string; kind: "qty" | "flag" | "plan"; requires: Req; min?: number; max?: number; desc: string; }

const PLANS: Item[] = [
  { key: "ue2_email_starter_monthly", label: "E-Mail Starter", price: "49 €", unit: "/ Monat · Postfach", kind: "plan", requires: null, desc: "1 Postfach · 1.000 Mails/Monat" },
  { key: "ue2_email_pro_monthly", label: "E-Mail Pro", price: "99 €", unit: "/ Monat · Postfach", kind: "plan", requires: null, desc: "1 Postfach · 3.000 Mails/Monat" },
];
const ADDONS: Item[] = [
  { key: "ue2_extra_mailbox_monthly", label: "Zusatz-Postfach", price: "35 €", unit: "/ Monat · Postfach", kind: "qty", requires: "base", min: 1, max: 100, desc: "Weiteres Postfach am selben Workspace" },
  { key: "ue2_volume_pack_monthly", label: "Volumen-Paket", price: "99 €", unit: "/ Monat", kind: "qty", requires: "base", min: 1, max: 10, desc: "+3.000 Mails/Monat je Paket" },
  { key: "ue2_autopilot_monthly", label: "Autopilot", price: "99 €", unit: "/ Monat · Postfach", kind: "qty", requires: "base", min: 1, max: 100, desc: "Automatisches Senden mit Reife-Gate" },
  { key: "ue2_erp_sync_monthly", label: "Excel-/ERP-Live-Sync", price: "79 €", unit: "/ Monat", kind: "qty", requires: "base", min: 1, max: 20, desc: "Excel/OneDrive/SharePoint — Live-Abgleich" },
  { key: "ue2_branch_pack_monthly", label: "Branchen-Pack", price: "29 €", unit: "/ Monat", kind: "qty", requires: "base", min: 1, max: 13, desc: "Branchen-Labels + Antwort-Bausteine" },
  { key: "ue2_copilot_seat_monthly", label: "Sales Co-Pilot", price: "39 €", unit: "/ Monat · Sitz", kind: "qty", requires: null, min: 1, max: 100, desc: "Live-Transkript + Einwand-Hilfen" },
  { key: "ue2_voice_jana_monthly", label: "Voice „Jana“", price: "199 €", unit: "/ Monat", kind: "flag", requires: null, desc: "KI-Telefonassistenz · 1.000 Min inkl." },
  { key: "ue2_phone_local_monthly", label: "Lokale DE-Nummer", price: "2,99 €", unit: "/ Monat", kind: "qty", requires: "voice", min: 1, max: 100, desc: "Festnetz-Nummer für Voice" },
  { key: "ue2_phone_mobile_monthly", label: "Mobile DE-Nummer", price: "30 €", unit: "/ Monat", kind: "qty", requires: "voice", min: 1, max: 100, desc: "Mobile Nummer für Voice" },
];
const PLAN_LABEL: Record<string, string> = { starter: "E-Mail Starter", pro: "E-Mail Pro", hv_complete: "HV-Komplett", hv_voice: "HV-Komplett + Voice", fullstack: "Full-Stack" };

function hasBase(e?: BillingEntitlements | null) { return !!(e && e.base_plan); }
function gate(item: Item, e?: BillingEntitlements | null): { ok: boolean; hint?: string } {
  if (item.requires === "base") return hasBase(e) ? { ok: true } : { ok: false, hint: "Benötigt einen E-Mail-Plan" };
  if (item.requires === "voice") return e?.voice_enabled ? { ok: true } : { ok: false, hint: "Benötigt Voice „Jana“" };
  return { ok: true };
}

export default function BillingTab() {
  const { data, isLoading, refetch } = useBillingSummary();
  const checkout = useBillingCheckout();
  const portal = useBillingPortal();
  const ent = data?.entitlements;
  const derived = data?.derived;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("checkout");
    if (c === "success") { toast.success("Zahlung abgeschlossen — wird übernommen."); refetch(); }
    else if (c === "cancel") { toast("Vorgang abgebrochen."); }
    if (c) { p.delete("checkout"); const q = p.toString(); window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : "")); }
  }, [refetch]);

  const qOf = (it: Item) => qty[it.key] ?? (it.min ?? 1);
  const setQ = (it: Item, v: number) => setQty((s) => ({ ...s, [it.key]: Math.max(it.min ?? 1, Math.min(it.max ?? 999, v)) }));

  async function buy(it: Item) {
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
      if (/requires_base/.test(m)) toast.error("Benötigt einen E-Mail-Plan.");
      else if (/requires_voice/.test(m)) toast.error("Benötigt Voice „Jana“.");
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

  const planName = ent?.base_plan ? (PLAN_LABEL[ent.base_plan] ?? ent.base_plan) : "Kein Plan aktiv";
  const statusBad = ent?.billing_status === "past_due" || ent?.billing_status === "canceled";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="w-5 h-5" /> {planName}</CardTitle>
            <CardDescription className="mt-1">
              {derived ? `${derived.total_mailboxes} Postfach/Postfächer · ${derived.mail_quota_total.toLocaleString("de-DE")} Mails/Monat` : "—"}
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
                  <span className="text-sm"><b>{it.price}</b> <span className="text-muted-foreground">{it.unit}</span></span>
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
            const flagActive = isFlag && it.key === "ue2_voice_jana_monthly" && !!ent?.voice_enabled;
            return (
              <div key={it.key} className="rounded-lg border p-4 flex flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">{it.label}</span>
                  <span className="text-xs whitespace-nowrap"><b>{it.price}</b> <span className="text-muted-foreground">{it.unit}</span></span>
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
