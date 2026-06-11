// Paket 2 (2026-06-11): Echter Postfach-Reconnect im Integrationen-Tab.
// Vorher lief der MailboxHealthBanner-Link auf /einstellungen?tab=integrations ins Leere
// (kein Gmail-Reconnect-Button vorhanden). Jetzt: pro verbundenem Postfach (mailbox_health[]
// aus /v1/dashboard/me) ein "Neu verbinden"-Button. Die OAuth-URL baut der api-router
// (GET /v1/dashboard/reconnect/{provider}, v4.58.2) aus den AKTUELLEN DB-Tenant-Werten —
// damit kann der OAuth-Callback domain/active_pack_keys/plan NICHT zurücksetzen (Footgun
// real passiert 29.05. + 11.06. bei help_useeasy).
// Gmail ist bis zur GCP-Billing-Zahlung degradiert (Google-Client disabled → "Zugriff blockiert").
import { useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/hooks/use-api";
import { fetchReconnectUrl, ApiError, type MailboxHealth } from "@/lib/api-client";

// 2026-06-11: GCP-Billing offen (~200 €) → Google-OAuth-Client disabled. Nach Zahlung
// (Leon, ~nächste Woche) auf false stellen + publishen.
const GMAIL_OAUTH_DEGRADED = true;

const PROVIDER_LABEL: Record<string, string> = { gmail: "Gmail", outlook: "Outlook / Microsoft 365" };

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "ok" ? "bg-emerald-500" : status === "error" ? "bg-destructive" : "bg-amber-500";
  const label = status === "ok" ? "aktiv" : status === "error" ? "Fehler" : "kein aktueller Abruf";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${cls}`} aria-hidden />
      {label}
    </span>
  );
}

export function MailboxReconnectCard() {
  const { data: me } = useMe();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const health = (me?.mailbox_health ?? []) as MailboxHealth[];

  const onReconnect = async (provider: "gmail" | "outlook") => {
    setBusy(provider);
    try {
      const r = await fetchReconnectUrl(provider);
      if (r?.oauth_url) {
        window.location.href = r.oauth_url;
        return;
      }
      throw new Error("Antwort ohne oauth_url");
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 404
          ? "Reconnect-Endpoint nicht verfügbar — Backend-Update (v4.58.2) noch nicht deployt."
          : e instanceof Error
          ? e.message
          : "Unbekannter Fehler";
      toast({ title: "Neu verbinden fehlgeschlagen", description: msg, variant: "destructive" });
      setBusy(null);
    }
  };

  if (health.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" /> Verbundene Postfächer
        </CardTitle>
        <CardDescription>
          Wenn ein Postfach „Fehler" oder „kein aktueller Abruf" zeigt (z.&nbsp;B. nach
          Passwort-Änderung oder abgelaufener Freigabe), stellt „Neu verbinden" den Zugriff
          per OAuth wieder her. Deine Branchen-Einstellungen (Pack/Domain) bleiben dabei
          unverändert — die Verbindung wird serverseitig mit deinen aktuellen Werten gebaut.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {health.map((m) => {
          const isGmail = m.provider === "gmail";
          const degraded = isGmail && GMAIL_OAUTH_DEGRADED;
          return (
            <div
              key={`${m.provider}:${m.email ?? ""}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {PROVIDER_LABEL[m.provider] ?? m.provider}
                  {m.email ? <span className="text-muted-foreground font-normal"> · {m.email}</span> : null}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <StatusDot status={m.status} />
                  {m.status === "error" && m.last_error ? (
                    <span className="truncate text-xs text-destructive/80" title={m.last_error}>
                      {m.last_error}
                    </span>
                  ) : null}
                </div>
                {degraded ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Google-Anmeldung derzeit gestört — Neu-Verbinden ist vorübergehend nicht
                    möglich. Wir arbeiten daran.
                  </p>
                ) : null}
              </div>
              <Button
                variant={m.status === "ok" ? "outline" : "default"}
                size="sm"
                disabled={degraded || busy !== null}
                onClick={() => onReconnect(m.provider as "gmail" | "outlook")}
              >
                {busy === m.provider ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : m.status === "ok" ? (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Neu verbinden
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default MailboxReconnectCard;
