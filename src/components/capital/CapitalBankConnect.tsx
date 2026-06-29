import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalBankStatus,
  useConnectCapitalBank,
  useCapitalBankCallback,
  useSyncCapitalBank,
} from "@/hooks/use-capital";
import type { CapitalBankSyncResponse } from "@/lib/api-client";
import { Landmark, ShieldCheck, Loader2, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";

// Capital-Layer F3: „Bank verbinden" (finAPI, AISP). Self-Service OAuth + SCA.
// Speichert/zeigt nur aggregierte 0–100-Indizes — keine PII, kein Zahlungszugriff.
const FIN_LABEL: Record<string, string> = {
  fin_mrr: "Umsatz-Momentum",
  fin_burn: "Ausgaben-Last",
  fin_liquidity: "Liquidität",
  fin_runway: "Runway",
  fin_ar_aging: "Forderungs-Alter",
  fin_dso: "DSO (Forderungslaufzeit)",
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
  aborted: { t: "Abgebrochen", c: "text-muted-foreground" },
  error: { t: "Fehler", c: "text-red-400" },
};

export function CapitalBankConnect() {
  const { toast } = useToast();
  const status = useCapitalBankStatus();
  const connect = useConnectCapitalBank();
  const callback = useCapitalBankCallback();
  const sync = useSyncCapitalBank();
  const [syncResult, setSyncResult] = useState<CapitalBankSyncResponse | null>(null);
  const handled = useRef(false);

  // Nach dem finAPI-SCA-Redirect: /signale?capital_bank=callback&state=… → Backend-Callback fahren.
  useEffect(() => {
    if (handled.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_bank") !== "callback") return;
    handled.current = true;
    const state = sp.get("state") || "";
    // URL bereinigen, damit ein Reload den Callback nicht erneut auslöst
    window.history.replaceState({}, "", window.location.pathname);
    if (!state) return;
    callback.mutate(
      { state },
      {
        onSuccess: (d) => {
          status.refetch();
          if (d.status === "connected") {
            toast({ title: "Bank verbunden", description: "Salden & Buchungen werden ausgewertet — nur aggregierte Kennzahlen." });
            if (d.sync) setSyncResult(d.sync);
          } else if (d.status === "pending") {
            toast({ title: "Verbindung noch nicht abgeschlossen", description: "Bitte den Bank-Login zu Ende führen." });
          } else {
            toast({ title: "Verbindung nicht abgeschlossen", description: d.web_form_status || d.status || d.error, variant: "destructive" });
          }
        },
        onError: (e: any) => toast({ title: "Rückmeldung fehlgeschlagen", description: e?.message, variant: "destructive" }),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const st = status.data;
  const configured = st?.configured !== false; // bis bekannt: optimistisch
  const busy = connect.isPending || callback.isPending || sync.isPending;
  const sInfo = STATUS_LABEL[st?.status || "not_connected"] || STATUS_LABEL.not_connected;

  const startConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (d) => {
        if (d.ok && d.redirect_url) {
          try { localStorage.setItem("ue_capital_bank_state", d.state || ""); } catch { /* noop */ }
          window.location.href = d.redirect_url; // → finAPI Web Form (SCA)
        } else {
          toast({ title: "Konnte nicht starten", description: d.hint || d.error || "Unbekannt", variant: "destructive" });
        }
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

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Bank verbinden (automatisch, via finAPI)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden statt monatlich Dateien hochladen. Du autorisierst den Lesezugriff direkt bei deiner Bank (PSD2/SCA) —{" "}
              <span className="text-foreground">finAPI</span> (BaFin-lizenziert) liest Salden &amp; Buchungen, daraus entstehen
              Finanz-Indizes (Liquidität, Umsatz-Momentum, Runway).
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Die automatische Bank-Anbindung ist für deinen Account noch nicht freigeschaltet. Nutze solange den Datei-Upload unten.
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
                  {connect.isPending || callback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
                  <span className="ml-1">{st?.status === "reauth_required" ? "Neu verbinden" : "Bank verbinden"}</span>
                </Button>
              )}
            </div>

            {st?.status === "reauth_required" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Die PSD2-Freigabe deiner Bank ist abgelaufen (gesetzlich max. 90 Tage). Einmal neu verbinden, dann läuft der
                  Abgleich wieder automatisch.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read-only &amp; DSGVO: nur <span className="text-foreground">Lesezugriff</span>, keine Zahlungen. Gespeichert werden
                ausschließlich aggregierte Monats-Kennzahlen (0–100) — <span className="text-foreground">keine Buchungstexte,
                Gegenkonten oder IBANs</span>. Deine Bank-Zugangsdaten gibst du direkt bei finAPI ein; wir sehen sie nie.
              </p>
            </div>

            {syncResult && syncResult.metrics && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {syncResult.accounts ?? 0} Konto/Konten · {syncResult.txns ?? 0} Buchungen
                    {syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                  </span>
                </div>
                {syncResult.metrics.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {syncResult.metrics.map((m) => (
                      <div key={m.key} className="rounded-md bg-background/40 border border-border px-3 py-2">
                        <div className="text-[11px] text-muted-foreground truncate">{FIN_LABEL[m.key] || m.key}</div>
                        <div className={`text-lg font-semibold ${scoreColor(m.value)}`}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Noch keine Kennzahl berechenbar — Cashflow-Indizes brauchen ≥3 Monate Historie. Beim nächsten Abgleich
                    (oder sobald die Bank mehr Historie liefert) werden Trends sichtbar.
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
