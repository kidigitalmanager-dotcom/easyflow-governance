import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet-async";
import logo from "@/assets/useeasy-logo.jpg";


/**
 * Öffentliche Self-Serve-Onboarding-Landingpage (Phase 1).
 * URL: app.useeasy.ai/connect?token=<jwt-like>
 *
 * Flow:
 *   1) Token validieren (GET /v1/onboarding/connect/validate?token=…)
 *   2) Branche/Pack auswählen (GET /v1/onboarding/packs, vorausgewählt aus Tenant-Domain)
 *   3) Auswahl speichern (POST /v1/onboarding/connect/set-domain {token, pack_key})
 *   4) Postfach verbinden — Redirect auf /v1/onboarding/connect/{google|outlook}/start?token=…
 *
 * PRE-LOGIN: keine Supabase-Auth, kein apiFetch — direkter fetch zur api.useeasy.ai.
 *
 * v4.62 (B4): Branche-Wahl ist PFLICHT. Vorbelegt wird nur, wenn die Branche aus
 * der Tenant-Domain ableitbar ist (z.B. HV-Bundle → real_estate); sonst bleibt das
 * Feld leer und die "Postfach verbinden"-Buttons sind inaktiv, bis der Kunde bewusst
 * eine Branche wählt — verhindert die stille ecom-Default-Fehlklassifikation.
 */

const API_BASE = "https://api.useeasy.ai";

type ValidateResp = {
  ok: boolean;
  status?: string;
  tenant_id?: string;
  company_name?: string | null;
  email?: string | null;
  domain?: string | null;
  plan?: string | null;
  expires_at?: string;
};

type Pack = {
  pack_key: string;
  display_name: string;
  description: string | null;
  domain: string | null;
};

type Stage = "loading" | "ready" | "error";

export default function Connect() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("loading");
  const [errReason, setErrReason] = useState<string>("");
  const [tenant, setTenant] = useState<ValidateResp | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPack, setSelectedPack] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // v4.103.0 — Gmail-Not-Aus: der Start-Endpoint antwortet 503 gmail_oauth_disabled,
  // solange GMAIL_OAUTH_ENABLED=false (GCP-Billing-Sperre). Beim Laden ohne Token
  // proben (enabled = 400 token_required, disabled = 503); fail-open bei Netzfehlern.
  const [gmailAvailable, setGmailAvailable] = useState<boolean>(true);

  // Beim Laden: Token validieren + Pack-Liste holen.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!token) {
        setErrReason("missing_token");
        setStage("error");
        return;
      }
      try {
        const [vRes, pRes, gAvail] = await Promise.all([
          fetch(`${API_BASE}/v1/onboarding/connect/validate?token=${encodeURIComponent(token)}`),
          fetch(`${API_BASE}/v1/onboarding/packs`),
          fetch(`${API_BASE}/v1/onboarding/connect/google/start`)
            .then((r) => r.status !== 503)
            .catch(() => true),
        ]);
        if (!cancelled) setGmailAvailable(gAvail);
        const vJson: ValidateResp = await vRes.json();
        if (!vRes.ok || !vJson.ok) {
          if (cancelled) return;
          setErrReason(vJson.status || `http_${vRes.status}`);
          setStage("error");
          return;
        }
        const pJson = await pRes.json();
        if (cancelled) return;
        setTenant(vJson);
        setPacks(Array.isArray(pJson.packs) ? pJson.packs : []);
        // Pack NUR vorbelegen, wenn aus der Tenant-Domain ableitbar (z.B. HV-Bundle
        // → real_estate, vom Stripe-Webhook gesetzt). Sonst leer lassen → der Kunde
        // MUSS die Branche bewusst wählen, sonst bleiben die Verbinden-Buttons inaktiv.
        const byDomain = (Array.isArray(pJson.packs) ? pJson.packs : []).find(
          (p: Pack) => vJson.domain && vJson.domain !== "ecom" && (p.domain === vJson.domain || p.pack_key.startsWith(`${vJson.domain}_`)),
        );
        setSelectedPack(byDomain?.pack_key || "");
        setStage("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        setErrReason("network_error");
        setStage("error");
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [token]);

  const reasonMessage = useMemo(() => {
    switch (errReason) {
      case "missing_token":
        return "Der Link in Ihrer E-Mail ist unvollständig. Bitte öffnen Sie den vollständigen Button aus der „Postfach verbinden“-Mail.";
      case "not_found":
        return "Dieser Link ist nicht gültig. Möglicherweise wurde er bereits genutzt oder eingegeben.";
      case "expired":
        return "Dieser Link ist abgelaufen (Gültigkeit 72 Stunden). Wir senden Ihnen gerne einen neuen — bitte bei support@useeasy.ai melden.";
      case "used":
        return "Dieser Link wurde bereits verwendet. Falls Sie das Postfach erneut verbinden möchten, melden Sie sich unter support@useeasy.ai.";
      case "network_error":
        return "Netzwerk-Fehler. Bitte prüfen Sie Ihre Verbindung und laden Sie die Seite neu.";
      default:
        return `Unerwarteter Fehler (${errReason}). Bitte bei support@useeasy.ai melden.`;
    }
  }, [errReason]);

  async function persistPackSelection(pack: string) {
    if (!pack || pack === tenant?.domain) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/v1/onboarding/connect/set-domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pack_key: pack }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Konnte Branche nicht speichern",
          description: j.error || `HTTP ${res.status}`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "unbekannter Fehler";
      toast({ title: "Netzwerk-Fehler", description: msg, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function connectMailbox(provider: "google" | "outlook") {
    // Gmail-Not-Aus: nicht auf die Google-Fehlerseite laufen lassen.
    if (provider === "google" && !gmailAvailable) {
      toast({
        title: "Gmail ist vorübergehend nicht verfügbar",
        description: "Bitte verbinden Sie Ihr Outlook / Microsoft 365 Postfach. Gmail folgt in Kürze.",
        variant: "destructive",
      });
      return;
    }
    // Branche ist Pflicht — ohne Auswahl kein Connect (Buttons sind ohnehin inaktiv).
    if (!selectedPack) {
      toast({
        title: "Bitte zuerst Branche wählen",
        description: "Damit UseEasy Ihre E-Mails korrekt kategorisiert, wählen Sie bitte Ihre Branche aus.",
        variant: "destructive",
      });
      return;
    }
    // Branche vorher persistieren — auch falls der Nutzer dasselbe Pack lässt,
    // ist der Roundtrip harmlos (Backend ist idempotent).
    const ok = await persistPackSelection(selectedPack);
    if (!ok) return;
    const url = `${API_BASE}/v1/onboarding/connect/${provider}/start?token=${encodeURIComponent(token)}`;
    window.location.href = url;
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Postfach verbinden — UseEasy</title>
        <meta name="description" content="Verbinde dein Gmail- oder Outlook-Postfach per OAuth mit UseEasy. Sichere Verbindung, keine Passwörter, jederzeit widerrufbar." />
        <link rel="canonical" href="https://app.useeasy.ai/connect" />
        <meta property="og:url" content="https://app.useeasy.ai/connect" />
        <meta property="og:title" content="Postfach verbinden — UseEasy" />
        <meta property="og:description" content="Verbinde dein Gmail- oder Outlook-Postfach per OAuth mit UseEasy." />
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="UseEasy Logo" className="h-12 w-12 rounded" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Postfach verbinden</h1>

          {stage === "ready" && tenant?.company_name && (
            <CardDescription>
              für <span className="font-medium text-foreground">{tenant.company_name}</span>
            </CardDescription>
          )}
        </CardHeader>


        <CardContent className="space-y-6">
          {stage === "loading" && (
            <p className="text-center text-muted-foreground py-8">Link wird geprüft …</p>
          )}

          {stage === "error" && (
            <div className="space-y-3">
              <p className="text-destructive font-medium">Verbindung nicht möglich</p>
              <p className="text-sm text-muted-foreground">{reasonMessage}</p>
            </div>
          )}

          {stage === "ready" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Branche <span className="text-destructive">*</span>
                </label>
                <Select
                  value={selectedPack}
                  onValueChange={(v) => setSelectedPack(v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Branche wählen …" />
                  </SelectTrigger>
                  <SelectContent>
                    {packs.map((p) => (
                      <SelectItem key={p.pack_key} value={p.pack_key}>
                        {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Steuert, wie UseEasy Ihre E-Mails kategorisiert. Später jederzeit änderbar.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <p className="text-sm font-medium">Postfach per 1-Klick-Anmeldung verbinden:</p>
                <Button
                  onClick={() => connectMailbox("google")}
                  className="w-full"
                  disabled={saving || !selectedPack || !gmailAvailable}
                  size="lg"
                >
                  {gmailAvailable ? "Gmail / Google Workspace verbinden" : "Gmail folgt in Kürze"}
                </Button>
                {!gmailAvailable && (
                  <p className="text-xs text-muted-foreground text-center">
                    Gmail ist vorübergehend nicht verfügbar. Bitte verbinden Sie Ihr Outlook / Microsoft 365 Postfach; Gmail wird in Kürze freigeschaltet.
                  </p>
                )}
                <Button
                  onClick={() => connectMailbox("outlook")}
                  variant="outline"
                  className="w-full"
                  disabled={saving || !selectedPack}
                  size="lg"
                >
                  Outlook / Microsoft 365 verbinden
                </Button>
                {!selectedPack && (
                  <p className="text-xs text-muted-foreground text-center">
                    Bitte wählen Sie zuerst Ihre Branche, um fortzufahren.
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Sichere OAuth 2.0-Verbindung. Keine Passwörter — Sie können den Zugriff jederzeit widerrufen.
                </p>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-center text-xs text-muted-foreground">
          Bei Fragen: support@useeasy.ai · Verarbeitung in Frankfurt (eu-central-1)
        </CardFooter>
      </Card>
    </main>

  );
}
