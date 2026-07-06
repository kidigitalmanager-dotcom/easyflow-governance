import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalAccountingStatus,
  useConnectCapitalAccounting,
  useCapitalAccountingCallback,
  useSyncCapitalAccounting,
  useDisconnectCapitalAccounting,
} from "@/hooks/use-capital";
import type { CapitalAccountingSyncResponse } from "@/lib/api-client";
import { BookOpenCheck, ShieldCheck, Loader2, CheckCircle2, RefreshCw, AlertTriangle, RotateCw, Unlink } from "lucide-react";

// Capital-Layer Schicht 2: „Buchhaltung verbinden" (Maesn Unified-API, DATEV-zertifiziert).
// Self-Service OAuth; speichert/zeigt nur aggregierte 0–100-Indizes — keine Konten/Belege/Namen.
const FIN_LABEL: Record<string, string> = {
  fin_ar_aging: "Forderungs-Alter",
  fin_dso: "DSO (Forderungslaufzeit)",
  fin_gross_margin: "Bruttomarge",
  fin_working_capital: "Working Capital",
  fin_cash_conversion: "Cash Conversion Cycle",
};
// Maesn-Zielsysteme (Connect-Identifier). DATEV-zertifiziert + Cloud-Accounting.
const TARGETS: { value: string; label: string }[] = [
  { value: "datev-uo", label: "DATEV Unternehmen Online" },
  { value: "datev-rewe", label: "DATEV Rechnungswesen" },
  { value: "lexware-office", label: "Lexware Office" },
  { value: "sevdesk", label: "sevDesk" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "xero", label: "Xero" },
  { value: "businesscentral", label: "Microsoft Business Central" },
  { value: "sage-active-de", label: "Sage Active (DE)" },
  { value: "exact-de", label: "Exact Online (DE)" },
];
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

export function CapitalAccountingConnect() {
  const { toast } = useToast();
  const status = useCapitalAccountingStatus();
  const connect = useConnectCapitalAccounting();
  const callback = useCapitalAccountingCallback();
  const sync = useSyncCapitalAccounting();
  const disconnect = useDisconnectCapitalAccounting();
  const [syncResult, setSyncResult] = useState<CapitalAccountingSyncResponse | null>(null);
  const [target, setTarget] = useState<string>(TARGETS[0].value);
  const [confirmDisc, setConfirmDisc] = useState(false);
  const [reconnect, setReconnect] = useState(false);
  const handled = useRef(false);

  // Nach dem Aggregator-Redirect: /signale?capital_acct=callback&state=…&accountKey=…&ts=…&maesn_signature=…
  useEffect(() => {
    if (handled.current) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("capital_acct") !== "callback") return;
    handled.current = true;
    const state = sp.get("state") || "";
    const account_key = sp.get("accountKey") || sp.get("account_key") || "";
    const ts = sp.get("ts") || "";
    const signature = sp.get("maesn_signature") || sp.get("signature") || "";
    window.history.replaceState({}, "", window.location.pathname); // verhindert Re-Trigger beim Reload
    if (!state) return;
    callback.mutate(
      { state, account_key, ts, signature },
      {
        onSuccess: (d) => {
          status.refetch();
          if (d.status === "connected") {
            toast({ title: "Buchhaltung verbunden", description: "Kennzahlen werden ausgewertet — nur aggregierte Indizes, keine Belege." });
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
  const configured = st?.configured !== false; // bis bekannt: optimistisch
  const busy = connect.isPending || callback.isPending || sync.isPending || disconnect.isPending;
  const sInfo = STATUS_LABEL[st?.status || "not_connected"] || STATUS_LABEL.not_connected;

  const startConnect = () =>
    connect.mutate(
      { target },
      {
        onSuccess: (d) => {
          if (d.ok && d.redirect_url) {
            try { localStorage.setItem("ue_capital_acct_state", d.state || ""); } catch { /* noop */ }
            window.location.href = d.redirect_url; // → Aggregator-Connect (Auth)
          } else {
            toast({ title: "Konnte nicht starten", description: d.hint || d.error || "Unbekannt", variant: "destructive" });
          }
        },
        onError: (e: any) => toast({ title: "Verbindung fehlgeschlagen", description: e?.message, variant: "destructive" }),
      },
    );

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
        setReconnect(false);
        setSyncResult(null);
        status.refetch();
        if (d.ok) {
          toast({ title: "Verbindung getrennt", description: d.revoked ? "Der Zugriff wurde widerrufen." : "Verbindung entfernt." });
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
            <BookOpenCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Buchhaltung verbinden (DATEV, Lexware, sevDesk, QuickBooks, Xero …)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden statt monatlich Exporte hochladen. Du autorisierst den Lesezugriff direkt bei deiner
              Buchhaltung — <span className="text-foreground">Maesn</span> (DATEV-zertifiziert) liest Kennzahlen, daraus
              entstehen Finanz-Indizes (Forderungs-Alter, DSO, Bruttomarge, Working Capital, Cash-Conversion).
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Die automatische Buchhaltungs-Anbindung ist für deinen Account noch nicht freigeschaltet. Nutze solange den
            Datei-Upload unten.
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-muted-foreground shrink-0">Status:</span>
                <span className={`font-medium ${sInfo.c}`}>{status.isLoading ? "…" : sInfo.t}</span>
                {st?.target_system && st?.connected && (
                  <span className="text-[11px] text-muted-foreground truncate">· {st.target_system}</span>
                )}
                {st?.last_sync_at && (
                  <span className="text-[11px] text-muted-foreground truncate">· letzter Abgleich {new Date(st.last_sync_at).toLocaleDateString("de-DE")}</span>
                )}
              </div>
              {(st?.connected && !reconnect) ? (
                <Button size="sm" variant="outline" onClick={doSync} disabled={busy}>
                  {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-1">Aktualisieren</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={busy}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    aria-label="Buchhaltungssystem wählen"
                  >
                    {TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={startConnect} disabled={busy}>
                    {connect.isPending || callback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpenCheck className="w-4 h-4" />}
                    <span className="ml-1">{st?.status === "reauth_required" ? "Neu verbinden" : "Verbinden"}</span>
                  </Button>
                  {reconnect && (
                    <Button size="sm" variant="ghost" onClick={() => setReconnect(false)} disabled={busy}>Abbrechen</Button>
                  )}
                </div>
              )}
            </div>

            {st?.connected && !reconnect && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setReconnect(true)} disabled={busy} title="Ersetzt die aktuelle Verbindung.">
                  <RotateCw className="w-3.5 h-3.5" /><span className="ml-1">Anderes Konto verbinden</span>
                </Button>
                {!confirmDisc ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400 hover:text-red-300" onClick={() => setConfirmDisc(true)} disabled={busy}>
                    <Unlink className="w-3.5 h-3.5" /><span className="ml-1">Verbindung trennen</span>
                  </Button>
                ) : (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Wirklich trennen?</span>
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={doDisconnect} disabled={disconnect.isPending}>
                      {disconnect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      <span className={disconnect.isPending ? "ml-1" : ""}>Ja, trennen</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmDisc(false)} disabled={disconnect.isPending}>Abbrechen</Button>
                  </span>
                )}
              </div>
            )}

            {st?.status === "reauth_required" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Die Freigabe deiner Buchhaltung ist abgelaufen. Einmal neu verbinden, dann läuft der Abgleich wieder automatisch.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read-only &amp; DSGVO: nur <span className="text-foreground">Lesezugriff</span>. Gespeichert werden ausschließlich
                aggregierte Kennzahlen (0–100) — <span className="text-foreground">keine Konten, Rechnungen, Beträge oder
                Kundennamen</span>. Deine Zugangsdaten gibst du direkt beim Aggregator ein; wir sehen sie nie.
              </p>
            </div>

            {syncResult && syncResult.metrics && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-foreground">
                    {syncResult.accounts ?? 0} Konten ausgewertet
                    {syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                    {typeof syncResult.classified_share === "number" ? ` · ${Math.round(syncResult.classified_share * 100)}% Konten erkannt` : ""}
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
                    Noch keine Kennzahl berechenbar — es konnten zu wenige Konten eindeutig zugeordnet werden. Beim nächsten
                    Abgleich (oder mit vollständigerem Kontenrahmen) werden die Kennzahlen sichtbar.
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
