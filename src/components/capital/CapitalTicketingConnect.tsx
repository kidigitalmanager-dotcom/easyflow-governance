import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCapitalTicketingStatus,
  useConnectCapitalTicketing,
  useSyncCapitalTicketing,
} from "@/hooks/use-capital";
import type { CapitalTicketingSyncResponse, CapitalTicketingConnectInput } from "@/lib/api-client";
import { LifeBuoy, ShieldCheck, Loader2, CheckCircle2, RefreshCw } from "lucide-react";

// Capital-Layer: „Ticketing verbinden" (HubSpot Service Hub / Zendesk / Freshdesk).
// Direct-Connect (kein OAuth-Redirect). Speichert/zeigt nur aggregierte 0–100-Indizes —
// keine Ticket-Texte, keine Kundennamen.
const TK_LABEL: Record<string, string> = {
  risk_warranty: "Gewährleistung/Reklamation",
  risk_compliance: "Compliance/Datenschutz",
  risk_dispute: "Streit/Chargeback",
  cust_csat: "Support-CSAT",
  ops_ttr: "Time-to-Resolution",
  ops_backlog: "Ticket-Backlog",
  ops_sla: "SLA-Erfüllung",
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
const PROVIDERS: { value: "hubspot" | "zendesk" | "freshdesk"; label: string }[] = [
  { value: "hubspot", label: "HubSpot Service Hub" },
  { value: "zendesk", label: "Zendesk" },
  { value: "freshdesk", label: "Freshdesk" },
];

export function CapitalTicketingConnect() {
  const { toast } = useToast();
  const status = useCapitalTicketingStatus();
  const connect = useConnectCapitalTicketing();
  const sync = useSyncCapitalTicketing();
  const [syncResult, setSyncResult] = useState<CapitalTicketingSyncResponse | null>(null);
  const [provider, setProvider] = useState<"hubspot" | "zendesk" | "freshdesk">("hubspot");
  const [subdomain, setSubdomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [domain, setDomain] = useState("");
  const [apiKey, setApiKey] = useState("");

  const st = status.data;
  const busy = connect.isPending || sync.isPending;
  const sInfo = STATUS_LABEL[st?.status || "not_connected"] || STATUS_LABEL.not_connected;
  const hubspotAvailable = st?.hubspot_available !== false;

  const doConnect = () => {
    const input: CapitalTicketingConnectInput = { provider };
    if (provider === "zendesk") Object.assign(input, { subdomain, email, api_token: apiToken });
    if (provider === "freshdesk") Object.assign(input, { domain, api_key: apiKey });
    connect.mutate(input, {
      onSuccess: (d) => {
        status.refetch();
        if (d.ok && d.status === "connected") {
          toast({ title: "Ticketing verbunden", description: "Support-Kennzahlen werden ausgewertet — nur aggregierte Indizes." });
          if (d.sync) setSyncResult(d.sync);
        } else {
          toast({ title: "Verbindung fehlgeschlagen", description: d.hint || d.error || "Unbekannt", variant: "destructive" });
        }
      },
      onError: (e: any) => toast({ title: "Verbindung fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });
  };

  const doSync = () =>
    sync.mutate(undefined, {
      onSuccess: (d) => { setSyncResult(d); status.refetch(); toast({ title: "Aktualisiert", description: `${(d.metrics || []).length} Kennzahl(en) berechnet.` }); },
      onError: (e: any) => toast({ title: "Sync fehlgeschlagen", description: e?.message, variant: "destructive" }),
    });

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Ticketing verbinden (HubSpot, Zendesk, Freshdesk)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Einmal verbinden — daraus entstehen Support-Risiko-Indizes (Gewährleistung, Compliance,
              Streitfälle), Support-CSAT und operative Kennzahlen (Bearbeitungszeit, Backlog).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-muted-foreground shrink-0">Status:</span>
            <span className={`font-medium ${sInfo.c}`}>{status.isLoading ? "…" : sInfo.t}</span>
            {st?.provider && st?.connected && <span className="text-[11px] text-muted-foreground truncate">· {st.provider}</span>}
            {st?.last_sync_at && <span className="text-[11px] text-muted-foreground truncate">· letzter Abgleich {new Date(st.last_sync_at).toLocaleDateString("de-DE")}</span>}
          </div>
          {st?.connected && (
            <Button size="sm" variant="outline" onClick={doSync} disabled={busy}>
              {sync.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">Aktualisieren</span>
            </Button>
          )}
        </div>

        {/* Provider-Auswahl + Direct-Connect */}
        <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">System:</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              disabled={busy}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              aria-label="Ticketing-System wählen"
            >
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {provider === "hubspot" && (
            <p className="text-xs text-muted-foreground">
              {hubspotAvailable
                ? "Nutzt deine bestehende HubSpot-Verbindung (Integrationen-Tab). Hinweis: Kategorie-Risiken brauchen die HubSpot-Ticket-Kategorie (Service Hub Enterprise)."
                : "HubSpot ist noch nicht verbunden — zuerst unter Einstellungen → Integrationen verbinden."}
            </p>
          )}
          {provider === "zendesk" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="Subdomain (z. B. acme)" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Agent-E-Mail" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              <input value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="API-Token" type="password" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
          )}
          {provider === "freshdesk" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Domain (z. B. acme)" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API-Key" type="password" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={doConnect} disabled={busy || (provider === "hubspot" && !hubspotAvailable)}>
              {connect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LifeBuoy className="w-4 h-4" />}
              <span className="ml-1">{st?.connected ? "Neu verbinden" : "Verbinden"}</span>
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Read-only &amp; DSGVO: gespeichert werden ausschließlich aggregierte Ticket-Zähler nach
            Kategorie/Status + CSAT (0–100) — <span className="text-foreground">kein Ticket-Text, keine
            Kundennamen</span>. Deine Zugangsdaten liegen verschlüsselt; wir lesen nur Kennzahlen.
          </p>
        </div>

        {syncResult && syncResult.metrics && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-foreground">
                {syncResult.tickets ?? 0} Tickets{syncResult.period ? ` · Stand ${syncResult.period}` : ""}
                {syncResult.csat_ratings ? ` · ${syncResult.csat_ratings} CSAT-Ratings` : ""}
              </span>
            </div>
            {syncResult.metrics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {syncResult.metrics.map((m) => (
                  <div key={m.metric_key} className="rounded-md bg-background/40 border border-border px-3 py-2">
                    <div className="text-[11px] text-muted-foreground truncate">{TK_LABEL[m.metric_key] || m.metric_key}</div>
                    <div className={`text-lg font-semibold ${scoreColor(m.value)}`}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Noch keine Kennzahl berechenbar — mind. {10} Tickets mit Kategorie/Tags nötig
                (Risiko-Indizes) bzw. genug CSAT-Ratings.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
