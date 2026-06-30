import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalShopifyStatus,
  useConnectCapitalShopify,
  useCapitalShopifyCallback,
  useSyncCapitalShopify,
} from "@/hooks/use-capital";
import type { CapitalShopifySyncResponse } from "@/lib/api-client";
import { ShoppingBag, ShieldCheck, Loader2, CheckCircle2, RefreshCw } from "lucide-react";

// Capital-Layer Step 3: „Shopify verbinden" (Public-App-OAuth, Scope read_orders).
// Speichert/zeigt nur aggregierte 0–100-Indizes — keine Kunden-/Bestelldetails.
const SHOPIFY_LABEL: Record<string, string> = {
  rev_gmv: "GMV-Momentum",
  rev_aov: "Ø Bestellwert",
};
function scoreColor(v: number): string {
  if (v >= 67) return "text-emerald-400";
  if (v >= 34) return "text-amber-400";
  return "text-red-400";
}
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  not_connected: { t: "Nicht verbunden", c: "text-muted-foreground" },
  pending: { t: "Verbindung läuft …", c: "text-amber-400" },
  connected: { t: "Verbunden", c: "text-emerald-400" },
  reauth_required: { t: "Erneute Freigabe nötig", c: "text-amber-400" },
  error: { t: "Fehler", c: "text-red-400" },
};

export function CapitalShopifyConnect() {
  const { toast } = useToast();
  const status = useCapitalShopifyStatus();
  const connect = useConnectCapitalShopify();
  const callback = useCapitalShopifyCallback();
  const sync = useSyncCapitalShopify();
  const [syncResult, setSyncResult] = useState<CapitalShopifySyncResponse | null>(null);
  const [shop, setShop] = useState("");
  const handled = useRef(false);

  // Nach dem Shopify-OAuth-Redirect: /signale?capital_shopify=callback&code=…&shop=…&state=…&hmac=… → ALLE Params durchreichen.
  useEffect(() => {
    if (handled.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_shopify") !== "callback") return;
    handled.current = true;
    const params: Record<string, string> = {};
    sp.forEach((v, k) => { params[k] = v; });
    window.history.replaceState({}, "", window.location.pathname);
    if (!params.state || !params.code) return;
    callback.mutate(
      { params },
      {
        onSuccess: (d) => {
          status.refetch();
          if (d.status === "connected") {
            toast({ title: "Shopify verbunden", description: "Bestellungen werden ausgewertet — nur aggregierte Kennzahlen." });
            if (d.sync) setSyncResult(d.sync);
          } else {
            toast({ title: "Verbindung nicht abgeschlossen", description: d.error || d.status, variant: "destructive" });
          }
        },
        onError: (e: any) => toast({ title: "Rückmeldung fehlgeschlagen", description: e?.message, variant: "destructive" }),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = status.data;
  const configured = st?.configured !== false;
  const busy = connect.isPending || callback.isPending || sync.isPending;
  const sInfo = STATUS_LABEL[st?.status || "not_connected"] || STATUS_LABEL.not_connected;

  const startConnect = () => {
    const s = shop.trim();
    if (!/\.myshopify\.com$/i.test(s.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) {
      toast({ title: "Shop-Adresse fehlt", description: "Bitte deine Shop-Adresse eingeben, z. B. mein-shop.myshopify.com", variant: "destructive" });
      return;
    }
    connect.mutate(
      { shop: s },
      {
        onSuccess: (d) => {
          if (d.ok && d.redirect_url) window.location.href = d.redirect_url; // → Shopify OAuth
          else toast({ title: "Konnte nicht starten", description: d.hint || d.error || "Unbekannt", variant: "destructive" });
        },
        onError: (e: any) => toast({ title: "Verbindung fehlgeschlagen", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const doSync = () =>
    sync.mutate(undefined, {
      onSuccess: (d) => {
        setSyncResult(d);
        status.refetch();
        toast({ title: "Aktualisiert", description: `${(d.metrics || []).length} Kennzahl(en) berechnet.` });
      },
      onError: (e: any) => toast({ title: "Sync fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Shopify verbinden (Bestellungen &amp; GMV)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden — du autorisierst den <span className="text-foreground">Lesezugriff</span> auf Bestellungen.
              Daraus entstehen Umsatz-Indizes (GMV-Momentum, Ø Bestellwert).
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Die Shopify-Anbindung ist für deinen Account noch nicht freigeschaltet.
          </div>
        ) : (
          <>
            {st?.connected ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2 text-sm min-w-0">
                  <span className="text-muted-foreground shrink-0">Status:</span>
                  <span className={`font-medium ${sInfo.c}`}>{sInfo.t}</span>
                  {st?.shop && <span className="text-[11px] text-muted-foreground truncate">· {st.shop}</span>}
                </div>
                <Button size="sm" variant="outline" onClick={doSync} disabled={busy}>
                  {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-1">Aktualisieren</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  placeholder="mein-shop.myshopify.com"
                  className="h-9 text-sm"
                  disabled={busy}
                />
                <Button size="sm" onClick={startConnect} disabled={busy}>
                  {connect.isPending || callback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
                  <span className="ml-1">Verbinden</span>
                </Button>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read-only &amp; DSGVO: nur <span className="text-foreground">Lesezugriff</span> auf Bestellungen. Gespeichert
                werden ausschließlich aggregierte Monats-Kennzahlen (0–100) — <span className="text-foreground">keine Kunden-,
                Adress- oder Artikeldetails</span>.
              </p>
            </div>

            {syncResult && syncResult.metrics && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {syncResult.orders ?? 0} Bestellung(en){syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                  </span>
                </div>
                {syncResult.metrics.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {syncResult.metrics.map((m) => (
                      <div key={m.metric_key} className="rounded-md bg-background/40 border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground truncate">{SHOPIFY_LABEL[m.metric_key] || m.metric_key}</div>
                        <div className={`text-lg font-semibold ${scoreColor(m.value)}`}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Noch keine Kennzahl berechenbar — Umsatz-Indizes brauchen ≥3 Monate Historie.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
