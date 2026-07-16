import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Loader2, CheckCircle2, Info, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

// v4.116.0 — Per-Tenant-DHL-Key. Eigener Key = eigenes DHL-Kontingent (250 Calls/Tag).
// Ohne eigenen Key läuft die Sendungsverfolgung über den UseEasy-Standard-Key (Fallback).
const SETTINGS_URL = "https://api.useeasy.ai/v1/dashboard/tracking/settings";
const DHL_PORTAL_URL = "https://developer.dhl.com";

interface TrackingSettings {
  ok: boolean;
  has_tenant_key: boolean;
  tenant_key_masked: string | null;
  using: "tenant" | "platform" | "none";
  platform_fallback: boolean;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export default function DhlTrackingCard() {
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      if (!headers.Authorization) return;
      const res = await fetch(SETTINGS_URL, { headers });
      if (res.ok) setSettings(await res.json());
    } catch {
      /* Karte degradiert still — Tracking läuft serverseitig weiter */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch(SETTINGS_URL, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ dhl_api_key: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(
          data.verified
            ? "DHL-Key geprüft und gespeichert — Ihre Sendungsverfolgung läuft jetzt über Ihren eigenen Key."
            : "DHL-Key gespeichert."
        );
        setKeyInput("");
        await load();
      } else if (data.error === "dhl_key_invalid") {
        toast.error(data.detail || "DHL lehnt diesen Key ab — bitte im DHL-Portal prüfen.");
      } else if (data.error === "invalid_key_format") {
        toast.error(data.detail || "Das sieht nicht wie ein DHL API Key aus (16–64 Zeichen).");
      } else {
        toast.error("Speichern fehlgeschlagen — bitte später erneut versuchen.");
      }
    } catch {
      toast.error("Netzwerkfehler — bitte später erneut versuchen.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Eigenen DHL-Key entfernen? Die Sendungsverfolgung läuft dann wieder über den UseEasy-Standard-Key.")) return;
    setSaving(true);
    try {
      const headers = await authHeader();
      const res = await fetch(SETTINGS_URL, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ remove: true }),
      });
      if (res.ok) {
        toast.success("Eigener DHL-Key entfernt — Standard-Key aktiv.");
        await load();
      } else {
        toast.error("Entfernen fehlgeschlagen.");
      }
    } catch {
      toast.error("Netzwerkfehler.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: "#FFCC00" }}>
            <Package className="h-5 w-5" style={{ color: "#D40511" }} />
          </div>
          <div>
            <h3 className="font-semibold">DHL Sendungsverfolgung</h3>
            <p className="text-sm text-muted-foreground">
              Tracking-Link + Live-Status automatisch in Antwort-Entwürfen
            </p>
          </div>
        </div>
        {!loading && settings && (
          settings.using === "tenant" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Eigener Key aktiv ({settings.tenant_key_masked})
            </span>
          ) : settings.using === "platform" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aktiv (UseEasy-Standard-Key)
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Kein Key hinterlegt
            </span>
          )
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade Status …
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Die Sendungsverfolgung funktioniert sofort — ohne eigenes Zutun über den
              UseEasy-Standard-Key. Mit einem <strong>eigenen (kostenlosen) DHL-Key</strong> bekommt
              Ihr Konto ein eigenes DHL-Kontingent von 250 Status-Abfragen pro Tag. Key anlegen:{" "}
              <a href={DHL_PORTAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                developer.dhl.com <ExternalLink className="h-3 w-3" />
              </a>{" "}
              → App erstellen → API <em>„Shipment Tracking – Unified"</em> auswählen → API Key kopieren
              (Anleitung im Onboarding-PDF).
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="DHL API Key einfügen (z. B. J7wk…)"
              autoComplete="off"
              className="font-mono text-sm"
            />
            <Button onClick={save} disabled={saving || !keyInput.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Key prüfen &amp; speichern
            </Button>
            {settings?.has_tenant_key && (
              <Button variant="outline" onClick={remove} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" /> Entfernen
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
