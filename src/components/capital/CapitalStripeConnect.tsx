import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalStripeStatus,
  useConnectCapitalStripe,
  useCapitalStripeCallback,
  useSyncCapitalStripe,
  useDisconnectCapitalStripe,
} from "@/hooks/use-capital";
import type { CapitalStripeSyncResponse } from "@/lib/api-client";
import { CreditCard, ShieldCheck, Loader2, CheckCircle2, RefreshCw, RotateCw, Unlink } from "lucide-react";

// Capital-Layer Step 3: „Stripe verbinden" (Connect-OAuth, Scope read_only).
// Speichert/zeigt nur aggregierte 0–100-Indizes — keine Kunden-/Zahlungsdetails.
const STRIPE_LABEL: Record<string, string> = {
  fin_mrr: "Umsatz-Momentum (MRR)",
  rev_growth: "Umsatzwachstum",
  risk_dunning: "Mahnstufen-Druck",
  cust_churn: "Kündigungsrate",
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

export function CapitalStripeConnect() {
  const { toast } = useToast();
  const status = useCapitalStripeStatus();
  const connect = useConnectCapitalStripe();
  const callback = useCapitalStripeCallback();
  const sync = useSyncCapitalStripe();
  const disconnect = useDisconnectCapitalStripe();
  const [syncResult, setSyncResult] = useState<CapitalStripeSyncResponse | null>(null);
  const [confirmDisc, setConfirmDisc] = useState(false);
  const handled = useRef(false);

  // Nach dem Stripe-Connect-Redirect: /signale?capital_stripe=callback&code=…&state=… → Backend-Callback.
  useEffect(() => {
    if (handled.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_stripe") !== "callback") return;
    handled.current = true;
    const code = sp.get("code") || "";
    const state = sp.get("state") || "";
    window.history.replaceState({}, "", window.location.pathname);
    if (!code || !state) return;
    callback.mutate(
      { code, state },
      {
        onSuccess: (d) => {
          status.refetch();
          if (d.status === "connected") {
            toast({ title: "Stripe verbunden", description: "Abos & Umsätze werden ausgewertet — nur aggregierte Kennzahlen." });
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
  const busy = connect.isPending || callback.isPending || sync.isPending || disconnect.isPending;
  const sInfo = STATUS_LABEL[st?.status || "not_connected"] || STATUS_LABEL.not_connected;

  const startConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (d) => {
        if (d.ok && d.redirect_url) window.location.href = d.redirect_url; // → Stripe OAuth
        else toast({ title: "Konnte nicht starten", description: d.hint || d.error || "Unbekannt", variant: "destructive" });
      },
      onError: (e: any) => toast({ title: "Verbindung fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });

  const doSync = () =>
    sync.mutate(undefined, {
      onSuccess: (d) => {
        setSyncResult(d);
        status.refetch();
        toast({ title: "Aktualisiert", description: `${(d.metrics || []).length} Kennzahl(en) berechnet.` });
      },
      onError: (e: any) => toast({ title: "Sync fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });

  const doDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: (d) => {
        setConfirmDisc(false);
        setSyncResult(null);
        status.refetch();
        if (d.ok) {
          toast({
            title: "Verbindung getrennt",
            description: d.revoked ? "Der Stripe-Zugriff wurde widerrufen." : "Verbindung entfernt.",
          });
        } else {
          toast({ title: "Trennen fehlgeschlagen", description: d.error || d.status, variant: "destructive" });
        }
      },
      onError: (e: any) => toast({ title: "Trennen fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Stripe verbinden (Abos &amp; Umsatz)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden — du autorisierst den <span className="text-foreground">Lesezugriff</span> direkt bei Stripe.
              Daraus entstehen Umsatz-Indizes (MRR-Momentum, Umsatzwachstum, Mahnstufen-Druck, Kündigungsrate).
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Die Stripe-Anbindung ist für deinen Account noch nicht freigeschaltet.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Status:</span>
                <span className={`font-medium ${sInfo.c}`}>{status.isLoading ? "…" : sInfo.t}</span>
                {st?.last_sync_at && (
                  <span className="text-[11px] text-muted-foreground truncate">· letzter Abgleich {new Date(st.last_sync_at).toLocaleDateString("de-DE")}</span>
                )}
              </div>
              {st?.connected ? (
                <Button size="sm" variant="outline" onClick={doSync} disabled={busy}>
                  {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-1">Aktualisieren</span>
                </Button>
              ) : (
                <Button size="sm" onClick={startConnect} disabled={busy}>
                  {connect.isPending || callback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  <span className="ml-1">{st?.status === "reauth_required" ? "Neu verbinden" : "Stripe verbinden"}</span>
                </Button>
              )}
            </div>

            {st?.connected && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={startConnect}
                  disabled={busy}
                  title="Ersetzt die aktuelle Verbindung."
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span className="ml-1">Anderes Konto verbinden</span>
                </Button>
                {!confirmDisc ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                    onClick={() => setConfirmDisc(true)}
                    disabled={busy}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span className="ml-1">Verbindung trennen</span>
                  </Button>
                ) : (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Wirklich trennen?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-xs"
                      onClick={doDisconnect}
                      disabled={disconnect.isPending}
                    >
                      {disconnect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span className={disconnect.isPending ? "ml-1" : ""}>Ja, trennen</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmDisc(false)}
                      disabled={disconnect.isPending}
                    >
                      Abbrechen
                    </Button>
                  </span>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read-only &amp; DSGVO: nur <span className="text-foreground">Lesezugriff</span>, keine Zahlungen. Gespeichert
                werden ausschließlich aggregierte Monats-Kennzahlen (0–100) — <span className="text-foreground">keine Kunden-,
                Karten- oder Rechnungsdetails</span>.
              </p>
            </div>

            {syncResult && syncResult.metrics && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {syncResult.subs ?? 0} Abo(s){syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                  </span>
                </div>
                {syncResult.metrics.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {syncResult.metrics.map((m) => (
                      <div key={m.metric_key} className="rounded-md bg-background/40 border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground truncate">{STRIPE_LABEL[m.metric_key] || m.metric_key}</div>
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
