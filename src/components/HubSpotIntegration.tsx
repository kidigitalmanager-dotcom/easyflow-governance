import { useEffect, useState } from "react";
import { useMe } from "@/hooks/use-api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Link as LinkIcon, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const API_ROOT = "https://api.useeasy.ai";

// Backend /v1/tenant/integrations liefert state = connected | reauth_required | disconnected
type HubSpotConnectState = "connected" | "reauth_required" | "disconnected";

interface HubSpotStatus {
  connected: boolean;
  state?: HubSpotConnectState;
  reauth_reason?: "token_expired" | "scopes_outdated" | string;
  portal_id?: string | null;
  connected_by?: string | null;
  connected_at?: string | null;
  expires_at?: string | null;
  expires_in_seconds?: number | null;
  has_refresh_token?: boolean;
}

function formatTimeUntil(iso?: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "abgelaufen";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} Tag${d > 1 ? "en" : ""}`;
  if (h > 0) return `${h} Std.`;
  return `${mins} Min.`;
}

const REAUTH_REASON_TEXT: Record<string, string> = {
  token_expired: "Das Zugriffs-Token ist abgelaufen und konnte nicht automatisch erneuert werden.",
  scopes_outdated:
    "Die Verbindung wurde vor dem Call-Logging-Update hergestellt. Für Anruf-Protokollierung "
    + "in HubSpot ist eine erneute Autorisierung mit den neuen Berechtigungen nötig.",
};

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function HubSpotIntegration() {
  const { data: me } = useMe();
  const tenantId = (me?.tenant?.tenant_id as string) || (me?.user?.tenant_id as string) || "";

  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch(
        `${API_ROOT}/v1/tenant/integrations?tenant_id=${encodeURIComponent(tenantId)}`,
        { headers },
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setStatus(data.hubspot ?? { connected: false, state: "disconnected" });
    } catch {
      setStatus({ connected: false, state: "disconnected" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) loadStatus();
  }, [tenantId]);

  // Handle redirect query params (?hubspot=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hs = params.get("hubspot");
    if (!hs) return;

    if (hs === "connected") {
      const portal = params.get("portal");
      toast.success(
        portal
          ? `HubSpot erfolgreich verbunden (Portal ${portal})`
          : "HubSpot erfolgreich verbunden",
      );
      loadStatus();
    } else if (hs === "error") {
      const reason = params.get("reason") || "unbekannt";
      toast.error(`HubSpot-Verbindung fehlgeschlagen: ${reason}`);
    }

    params.delete("hubspot");
    params.delete("portal");
    params.delete("reason");
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }, []);

  const handleConnect = () => {
    if (!tenantId) {
      toast.error("Tenant-ID nicht verfügbar");
      return;
    }
    window.location.href = `${API_ROOT}/v1/auth/hubspot/start?tenant_id=${encodeURIComponent(tenantId)}`;
  };

  const handleDisconnect = async () => {
    if (!tenantId) return;
    setDisconnecting(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`${API_ROOT}/v1/auth/hubspot/disconnect`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("HubSpot getrennt");
      setStatus({ connected: false, state: "disconnected" });
    } catch {
      toast.error("Trennen fehlgeschlagen");
    } finally {
      setDisconnecting(false);
    }
  };

  // Abgeleiteter State — fällt auf connected/disconnected zurück falls Backend
  // (noch) kein `state`-Feld liefert.
  const derivedState: HubSpotConnectState =
    status?.state ?? (status?.connected ? "connected" : "disconnected");

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: "#FF7A59" }}
        >
          H
        </div>
        <div>
          <h2 className="text-base font-semibold">HubSpot CRM</h2>
          <p className="text-xs text-muted-foreground">
            Verbinde dein HubSpot-Portal für CRM-Sync, Kontakt-Anreicherung und Anruf-Protokollierung.
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : derivedState === "connected" ? (
        /* ── Zustand: VERBUNDEN ── */
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium">
                Verbunden mit HubSpot Portal {status?.portal_id ?? "—"}
              </p>
              {(status?.connected_by || status?.connected_at) && (
                <p className="text-xs text-muted-foreground">
                  Verbunden von {status?.connected_by ?? "—"}
                  {status?.connected_at &&
                    ` am ${new Date(status.connected_at).toLocaleString("de-DE")}`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Token läuft ab in {formatTimeUntil(status?.expires_at)}
              </p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={disconnecting}>
                {disconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verbindung trennen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>HubSpot trennen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Die Verbindung zu HubSpot Portal {status?.portal_id} wird entfernt. CRM-Sync und
                  Anruf-Protokollierung werden gestoppt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleDisconnect}>Trennen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : derivedState === "reauth_required" ? (
        /* ── Zustand: RE-AUTH NÖTIG ── */
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium text-amber-300">
                Erneute Autorisierung erforderlich
                {status?.portal_id ? ` (Portal ${status.portal_id})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {REAUTH_REASON_TEXT[status?.reauth_reason ?? ""] ??
                  "Die HubSpot-Verbindung muss erneuert werden."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#FF7A59" }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Erneut verbinden
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={disconnecting}>
                  {disconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Trennen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>HubSpot trennen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die bestehende (abgelaufene) Verbindung wird entfernt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect}>Trennen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        /* ── Zustand: NICHT VERBUNDEN ── */
        <button
          onClick={handleConnect}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#FF7A59" }}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          HubSpot verbinden
        </button>
      )}
    </div>
  );
}
