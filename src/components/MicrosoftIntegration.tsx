// v4.39.0 — Microsoft 365 / OneDrive verbinden (Integrationen-Tab).
// Startet den bestehenden Confidential-OAuth-Flow (/v1/outlook/oauth/start) — derselbe
// Endpunkt wie der Postfach-Reconnect, jetzt inkl. Files.ReadWrite-Scope (buildScopeString).
// Nach Zustimmung trägt der gespeicherte Outlook-Token die OneDrive-Berechtigung →
// "Aus OneDrive verbinden" (Excel Live-Sync) funktioniert für diesen Tenant.
import { useEffect, useState } from "react";
import { useMe } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cloud, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

const API_ROOT = "https://api.useeasy.ai";

function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

export default function MicrosoftIntegration() {
  const { data: me } = useMe();
  const tenantId =
    ((me as { tenant?: { tenant_id?: string }; user?: { tenant_id?: string } })?.tenant?.tenant_id) ||
    ((me as { tenant?: { tenant_id?: string }; user?: { tenant_id?: string } })?.user?.tenant_id) ||
    "";

  const [mailbox, setMailbox] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  // Rücksprung vom OAuth-Callback (?outlook=connected|error) — Toast + URL säubern.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ol = params.get("outlook");
    if (!ol) return;
    if (ol === "connected") {
      const mb = params.get("mailbox");
      toast.success(mb ? `Microsoft verbunden (${mb})` : "Microsoft erfolgreich verbunden");
    } else if (ol === "error") {
      const reason = params.get("reason") || "unbekannt";
      const got = params.get("got");
      toast.error(
        reason === "account_mismatch" && got
          ? `Falsches Konto angemeldet (${got}). Bitte mit der angegebenen Adresse anmelden.`
          : `Microsoft-Verbindung fehlgeschlagen: ${reason}`,
      );
    }
    ["outlook", "mailbox", "tenant", "reason", "got", "expected"].forEach((k) => params.delete(k));
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  }, []);

  const handleConnect = () => {
    if (!tenantId) {
      toast.error("Tenant-ID nicht verfügbar.");
      return;
    }
    if (!looksLikeEmail(mailbox)) {
      toast.error("Bitte eine gültige Microsoft-/Outlook-Adresse eingeben.");
      return;
    }
    setRedirecting(true);
    window.location.href =
      `${API_ROOT}/v1/outlook/oauth/start?tenant_id=${encodeURIComponent(tenantId)}` +
      `&mailbox=${encodeURIComponent(mailbox.trim())}`;
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0">
          <Cloud className="w-5 h-5 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Microsoft 365 / OneDrive</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verbinde dein Outlook-/Microsoft-Postfach für OneDrive- & SharePoint-Live-Sync —
            Excel-Dateien werden dann direkt in der Microsoft-Cloud aktualisiert (kein
            manueller Download mehr).
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              type="email"
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConnect(); }}
              placeholder="z. B. help.useeasy@outlook.de"
              className="h-9 sm:max-w-xs"
              autoComplete="email"
            />
            <Button type="button" size="sm" className="gap-2 shrink-0" disabled={redirecting} onClick={handleConnect}>
              {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              Mit Microsoft verbinden
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/70 mt-3">
            Melde dich im Microsoft-Fenster mit genau dieser Adresse an und bestätige die
            Datei-Berechtigung. Der bestehende Postfach-Zugang (E-Mail-Klassifikation) bleibt
            unverändert — es kommt nur die OneDrive-Freigabe hinzu. Microsoft ist ein
            Drittland-Dienst.
          </p>
        </div>
      </div>
    </div>
  );
}
