import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalMetaAdsStatus,
  useConnectCapitalMetaAds,
  useCapitalMetaAdsCallback,
  useSyncCapitalMetaAds,
} from "@/hooks/use-capital";
import type { CapitalMetaAdsSyncResponse } from "@/lib/api-client";
import { Megaphone, ShieldCheck, Loader2, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

// Capital-Layer: „Meta Ads verbinden" (Facebook Login for Business, Scope read-only ads_read).
// Speichert/zeigt nur aggregierte 0–100-Indizes — keine Zielgruppen/Creatives/Personendaten.
const META_LABEL: Record<string, string> = {
  sales_cac: "Akquise-Effizienz (CAC)",
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
function fmtCac(v: number | null | undefined, currency?: string | null): string {
  if (v == null) return "–";
  const cur = currency || "";
  return `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${cur ? " " + cur : ""}`;
}

export function CapitalMetaAdsConnect() {
  const { toast } = useToast();
  const status = useCapitalMetaAdsStatus();
  const connect = useConnectCapitalMetaAds();
  const callback = useCapitalMetaAdsCallback();
  const sync = useSyncCapitalMetaAds();
  const [syncResult, setSyncResult] = useState<CapitalMetaAdsSyncResponse | null>(null);
  const handled = useRef(false);

  // Nach dem Meta-Connect-Redirect: /signale?capital_meta_ads=callback&code=…&state=… → Backend-Callback.
  useEffect(() => {
    if (handled.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_meta_ads") !== "callback") return;
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
            toast({ title: "Meta Ads verbunden", description: "Ad-Spend & Ergebnisse werden ausgewertet — nur aggregierte Kennzahlen." });
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

  const startConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (d) => {
        if (d.ok && d.redirect_url) window.location.href = d.redirect_url; // → Meta OAuth
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

  const cac = syncResult?.metrics?.find((m) => m.metric_key === "sales_cac") || null;
  const basisLabel = syncResult?.cac_basis === "cross_source"
    ? `Neukunden aus ${syncResult?.cross_source === "stripe" ? "Stripe" : "CRM/HubSpot"}`
    : syncResult?.cac_basis === "self_contained" ? "Meta-attribuierte Ergebnisse" : null;

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Meta Ads verbinden (Facebook &amp; Instagram)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden — du autorisierst den <span className="text-foreground">Lesezugriff</span> direkt bei Meta.
              Daraus entsteht ein Akquise-Effizienz-Index (CAC): Werbeausgaben ins Verhältnis zu gewonnenen Kunden.
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Die Meta-Ads-Anbindung ist für deinen Account noch nicht freigeschaltet.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Status:</span>
                <span className={`font-medium ${sInfo.c}`}>{status.isLoading ? "…" : sInfo.t}</span>
                {st?.ad_account_name && st?.connected && (
                  <span className="text-[11px] text-muted-foreground truncate">· {st.ad_account_name}</span>
                )}
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
                  {connect.isPending || callback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                  <span className="ml-1">{st?.status === "reauth_required" ? "Neu verbinden" : "Meta Ads verbinden"}</span>
                </Button>
              )}
            </div>

            {st?.status === "reauth_required" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Die Meta-Freigabe ist abgelaufen (gilt ca. 60 Tage). Einmal neu verbinden, dann läuft der Abgleich wieder.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read-only &amp; DSGVO: nur <span className="text-foreground">Lesezugriff</span> auf aggregierte Werbe-Kennzahlen.
                Gespeichert wird ausschließlich der 0–100-Effizienz-Index — <span className="text-foreground">keine Zielgruppen,
                Creatives oder Personendaten</span>.
              </p>
            </div>

            {syncResult && syncResult.metrics && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {syncResult.spend_months ?? 0} Monat(e) mit Ausgaben
                    {syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                  </span>
                </div>
                {cac ? (
                  <>
                    <div className="rounded-md bg-background/40 border border-border px-3 py-2 inline-flex flex-col">
                      <div className="text-[11px] text-muted-foreground">{META_LABEL.sales_cac}{basisLabel ? ` · ${basisLabel}` : ""}</div>
                      <div className={`text-lg font-semibold ${scoreColor(cac.value)}`}>{cac.value}</div>
                    </div>
                    {/* Self-contained vs. cross-source CAC — als einzelne Werte informativ ausgewiesen. */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-background/40 border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground truncate">CAC (Meta-Ergebnisse)</div>
                        <div className="text-sm font-medium text-foreground">{fmtCac(syncResult.self_contained_cac, syncResult.currency)}</div>
                      </div>
                      <div className="rounded-md bg-background/40 border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground truncate">CAC (echte Neukunden)</div>
                        <div className="text-sm font-medium text-foreground">{fmtCac(syncResult.cross_source_cac, syncResult.currency)}</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Der Score nutzt die <span className="text-foreground">echte Neukunden-CAC</span> (Spend ÷ verbundene Neukunden),
                      sobald sie vorliegt — sonst die Meta-attribuierte CAC. Bewertet wird die Entwicklung relativ zur eigenen Historie.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Noch keine Kennzahl berechenbar — die Akquise-Effizienz braucht ≥3 Monate Historie
                    (Werbeausgaben + Ergebnisse bzw. verbundene Neukunden-Quelle).
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
