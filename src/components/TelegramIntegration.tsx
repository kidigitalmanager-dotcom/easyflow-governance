import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Send,
  Copy,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const API_ROOT = "https://api.useeasy.ai";
const TELEGRAM_BLUE = "#229ED9";

type LinkRole = "owner" | "member";

interface OnboardingLink {
  deep_link: string;
  expires_in: number; // Sekunden
  role: LinkRole;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export default function TelegramIntegration() {
  const [role, setRole] = useState<LinkRole>("owner");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<OnboardingLink | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [featureDisabled, setFeatureDisabled] = useState(false);

  // Countdown für die Token-Gültigkeit (15 Min).
  useEffect(() => {
    if (!link || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [link, secondsLeft]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")} Min.`;
  };

  const generate = async () => {
    setLoading(true);
    setFeatureDisabled(false);
    try {
      const headers = await authHeader();
      if (!headers.Authorization) {
        toast.error("Nicht authentifiziert");
        return;
      }
      const res = await fetch(`${API_ROOT}/v1/customer-bot/onboarding/link`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (res.status === 503) {
        setFeatureDisabled(true);
        setLink(null);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data?.error === "tenant_not_resolved"
            ? "Dein Konto konnte keinem Tenant zugeordnet werden."
            : `Link konnte nicht erzeugt werden (${res.status})`,
        );
        return;
      }
      setLink(data as OnboardingLink);
      setSecondsLeft(Number(data.expires_in) || 900);
      toast.success("Telegram-Link erzeugt — gültig 15 Minuten");
    } catch {
      toast.error("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.deep_link);
      toast.success("Link kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const expired = link && secondsLeft <= 0;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-md flex items-center justify-center text-white"
          style={{ backgroundColor: TELEGRAM_BLUE }}
        >
          <Send className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Telegram-Steuerung</h2>
          <p className="text-xs text-muted-foreground">
            Steuere dein Postfach unterwegs per Telegram — Modus setzen
            („auf der Baustelle"), Entwürfe freigeben, Rückfragen beantworten.
          </p>
        </div>
      </div>

      {/* DSGVO-Hinweis */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-border/50 bg-muted/30 px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Aus Datenschutzgründen zeigt der Bot keine E-Mail-Inhalte im Chat —
          nur Kategorie + Link zur Console. Telegram ist ein Drittland-Dienst.
        </span>
      </div>

      {featureDisabled ? (
        /* ── Backend-Feature noch nicht aktiv ── */
        <div className="flex items-start gap-2 text-sm rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium text-amber-300">Wird gerade ausgerollt</p>
            <p className="text-xs text-muted-foreground">
              Die Telegram-Anbindung wird in Kürze freigeschaltet. Schau bald
              wieder vorbei.
            </p>
          </div>
        </div>
      ) : link && !expired ? (
        /* ── Link erzeugt ── */
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div className="space-y-1 min-w-0">
              <p className="font-medium">
                Verbindungslink bereit ({role === "owner" ? "Inhaber" : "Teammitglied"})
              </p>
              <p className="text-xs text-muted-foreground">
                Öffne den Link auf dem Handy, auf dem Telegram installiert ist —
                gültig noch <span className="font-medium">{fmt(secondsLeft)}</span>.
              </p>
              <code className="block text-xs break-all rounded bg-muted/50 px-2 py-1 mt-1">
                {link.deep_link}
              </code>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={link.deep_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: TELEGRAM_BLUE }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              In Telegram öffnen
            </a>
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="w-3.5 h-3.5" />
              Link kopieren
            </Button>
            <Button variant="ghost" size="sm" onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Neuen Link
            </Button>
          </div>
        </div>
      ) : (
        /* ── Nicht verbunden / Link abgelaufen ── */
        <div className="space-y-3">
          {expired && (
            <p className="text-xs text-amber-400">
              Der letzte Link ist abgelaufen. Erzeuge einen neuen.
            </p>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Verbinden als:</span>
            <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
              <button
                onClick={() => setRole("owner")}
                className={`px-3 py-1 text-xs ${role === "owner" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                Inhaber
              </button>
              <button
                onClick={() => setRole("member")}
                className={`px-3 py-1 text-xs border-l border-border/60 ${role === "member" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                Teammitglied
              </button>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ backgroundColor: TELEGRAM_BLUE }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Telegram verbinden
          </button>
        </div>
      )}
    </div>
  );
}
