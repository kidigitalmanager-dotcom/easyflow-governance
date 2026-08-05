import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  MessageCircle, Loader2, CheckCircle2, Info, Copy, Mail, RefreshCw,
  Sparkles, Eye, KeyRound, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { startBillingCheckout } from "@/lib/api-client";

// v4.190.0 — Website-Chat „Jana" als Selfserve-Karte: buchen (Stripe, 49 €/Monat),
// mit einem Klick aktivieren, Snippet kopieren oder direkt an den Website-Betreuer
// mailen, Einstellungen pflegen, Live-Vorschau. Backend: /v1/dashboard/webchat/*
// (JWT), Kauf über den bestehenden Billing-Checkout (lookup_key ue2_webchat_monthly).
const WEBCHAT_API = "https://api.useeasy.ai/v1/dashboard/webchat";

interface WebchatConfig {
  widget_key: string;
  enabled: boolean;
  display_name: string;
  greeting: string | null;
  accent_color: string;
  notify_email: string;
  notify_enabled: boolean;
  allowed_origins: string[];
  features: { booking: boolean; callback: boolean };
  booked_source: "manual" | "stripe";
}

interface WebchatStatus {
  ok: boolean;
  available: boolean;
  booked: boolean;
  configured: boolean;
  runtime_active: boolean;
  config: WebchatConfig | null;
  embed_snippet: string | null;
  embed_base: string;
  usage_30d: { messages: number; orders: number };
  pricing: { lookup_key_monthly: string; lookup_key_yearly: string; price_month_eur: number };
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function webchatFetch(path: string, init?: RequestInit) {
  const headers = await authHeader();
  const res = await fetch(`${WEBCHAT_API}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default function WebsiteChatCard() {
  const [status, setStatus] = useState<WebchatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMailForm, setShowMailForm] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailNote, setMailNote] = useState("");
  // Formularfelder (werden beim Laden aus der Server-Config befüllt)
  const [displayName, setDisplayName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [accentColor, setAccentColor] = useState("#0E7490");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [widgetEnabled, setWidgetEnabled] = useState(true);
  const [featBooking, setFeatBooking] = useState(true);
  const [featCallback, setFeatCallback] = useState(true);
  const seeded = useRef(false);

  const applyStatus = useCallback((st: WebchatStatus) => {
    setStatus(st);
    if (st.config && !seeded.current) {
      seeded.current = true;
      setDisplayName(st.config.display_name || "");
      setGreeting(st.config.greeting || "");
      setAccentColor(st.config.accent_color || "#0E7490");
      setNotifyEmail(st.config.notify_email || "");
      setNotifyEnabled(st.config.notify_enabled !== false);
      setWidgetEnabled(st.config.enabled === true);
      setFeatBooking(st.config.features?.booking !== false);
      setFeatCallback(st.config.features?.callback !== false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      if (!headers.Authorization) return;
      const res = await fetch(`${WEBCHAT_API}/status`, { headers });
      if (res.ok) applyStatus(await res.json());
    } catch {
      /* Karte degradiert still */
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => { load(); }, [load]);

  // Nach dem Stripe-Checkout kommt der Kunde per Browser-Tab zurück —
  // beim Fokuswechsel den Buchungsstand nachladen (Webhook braucht Sekunden).
  useEffect(() => {
    const onFocus = () => { if (status && !status.booked) load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status, load]);

  const buy = async () => {
    setBusy(true);
    try {
      const r = await startBillingCheckout(status?.pricing.lookup_key_monthly || "ue2_webchat_monthly");
      if (r.url) {
        window.location.href = r.url;
      } else if (r.ok) {
        toast.success("Website-Chat zum bestehenden Abo hinzugebucht — die Karte schaltet gleich frei.");
        setTimeout(load, 4000);
      } else {
        toast.error("Buchung nicht möglich — bitte später erneut versuchen.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg === "requires_base_plan"
        ? "Für dieses Add-on wird ein aktives UseEasy-Paket benötigt."
        : "Buchung fehlgeschlagen — bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    try {
      const { res, data } = await webchatFetch("/activate", { method: "POST", body: "{}" });
      if (res.ok && data.ok) {
        seeded.current = false;
        applyStatus(data);
        toast.success("Website-Chat aktiviert — Ihr persönliches Snippet ist bereit.");
      } else if (data.error === "not_booked") {
        toast.error("Der Website-Chat ist noch nicht gebucht.");
        await load();
      } else {
        toast.error("Aktivierung fehlgeschlagen — bitte später erneut versuchen.");
      }
    } catch {
      toast.error("Netzwerkfehler — bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      toast.error("Die Akzentfarbe muss ein Hex-Wert sein, z. B. #0E7490.");
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await webchatFetch("/config", {
        method: "POST",
        body: JSON.stringify({
          display_name: displayName || undefined,
          greeting,
          accent_color: accentColor || undefined,
          notify_email: notifyEmail || undefined,
          notify_enabled: notifyEnabled,
          enabled: widgetEnabled,
          features: { booking: featBooking, callback: featCallback },
        }),
      });
      if (res.ok && data.ok) {
        applyStatus(data);
        toast.success("Einstellungen gespeichert — das Widget übernimmt sie beim nächsten Laden der Website.");
      } else {
        toast.error(data.error === "invalid_notify_email" ? "Bitte eine gültige Benachrichtigungs-E-Mail angeben." : "Speichern fehlgeschlagen.");
      }
    } catch {
      toast.error("Netzwerkfehler — bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  const copySnippet = async () => {
    if (!status?.embed_snippet) return;
    try {
      await navigator.clipboard.writeText(status.embed_snippet);
      toast.success("Snippet kopiert — vor dem schließenden </body>-Tag Ihrer Website einfügen.");
    } catch {
      toast.error("Kopieren nicht möglich — bitte das Snippet manuell markieren.");
    }
  };

  const sendSnippet = async () => {
    const to = mailTo.trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
      toast.error("Bitte eine gültige E-Mail-Adresse angeben.");
      return;
    }
    setBusy(true);
    try {
      const { res, data } = await webchatFetch("/send-snippet", {
        method: "POST",
        body: JSON.stringify({ to_email: to, note: mailNote.trim() || undefined }),
      });
      if (res.ok && data.ok) {
        toast.success(`Einbau-Anleitung an ${to} gesendet.`);
        setShowMailForm(false);
        setMailTo("");
        setMailNote("");
      } else if (data.error === "rate_limited") {
        toast.error("Maximal 5 Versand-Mails pro Tag — bitte morgen erneut.");
      } else {
        toast.error("Versand fehlgeschlagen — bitte später erneut versuchen.");
      }
    } catch {
      toast.error("Netzwerkfehler — bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  };

  const rotateKey = async () => {
    if (!window.confirm("Neuen Widget-Key erzeugen? Das alte Snippet funktioniert danach NICHT mehr — die Zeile auf der Website muss ersetzt werden.")) return;
    setBusy(true);
    try {
      const { res, data } = await webchatFetch("/rotate-key", { method: "POST", body: "{}" });
      if (res.ok && data.ok) {
        seeded.current = false;
        applyStatus(data);
        toast.success("Neuer Widget-Key aktiv — bitte das aktualisierte Snippet einbauen.");
      } else {
        toast.error("Key-Wechsel fehlgeschlagen.");
      }
    } catch {
      toast.error("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  };

  const cfg = status?.config || null;
  const previewSrcDoc = cfg && status?.embed_snippet ? `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>
    body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;}
    .demo{padding:28px 24px;color:#334155;}
    .demo h1{font-size:18px;margin:0 0 8px;color:#0f172a;}
    .demo p{font-size:13px;line-height:1.5;margin:0 0 6px;}
    .hint{margin-top:10px;font-size:12px;color:#64748b;}
  </style></head><body>
    <div class="demo"><h1>${(cfg.display_name || "Ihre Website").replace(/</g, "&lt;")}</h1>
    <p>So sieht Ihre Website mit dem Jana-Chat aus.</p>
    <p class="hint">Unten rechts: die Chat-Blase — anklicken und ausprobieren. Test-Chats zählen wie echte (Aufträge landen in Ihrer Review-Queue).</p></div>
    ${status.embed_snippet}
  </body></html>` : "";

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4" data-tour="website-chat-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: (cfg?.accent_color || "#0E7490") + "1A" }}>
            <MessageCircle className="h-5 w-5" style={{ color: cfg?.accent_color || "#0E7490" }} />
          </div>
          <div>
            <h3 className="font-semibold">Website-Chat „Jana"</h3>
            <p className="text-sm text-muted-foreground">
              Jana beantwortet Kundenfragen auf Ihrer Website und nimmt Termin- und Rückruf-Anfragen als Aufträge auf
            </p>
          </div>
        </div>
        {!loading && status && (
          status.runtime_active ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald/25 bg-emerald-surface px-2.5 py-1 text-xs font-medium text-emerald-light">
              <CheckCircle2 className="h-3.5 w-3.5" /> Live auf Ihrer Website
            </span>
          ) : status.configured ? (
            <span className="inline-flex items-center rounded-full border border-amber/30 bg-amber-surface px-2.5 py-1 text-xs font-medium text-amber">
              Eingerichtet, pausiert
            </span>
          ) : status.booked ? (
            <span className="inline-flex items-center rounded-full border border-emerald/20 bg-emerald-surface/60 px-2.5 py-1 text-xs font-medium text-emerald-light">
              Gebucht — bereit zur Aktivierung
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Nicht gebucht
            </span>
          )
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade Status …
        </div>
      ) : !status || !status.available ? (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Der Website-Chat ist gerade nicht erreichbar — bitte später erneut versuchen.</span>
        </div>
      ) : !status.booked && !status.configured ? (
        /* ── Zustand 1: noch nicht gebucht ── */
        <>
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Ihre Kunden chatten direkt auf <strong>Ihrer</strong> Website mit Jana: Fragen werden aus Ihrer
              Wissensbasis beantwortet, Termin- und Rückruf-Wünsche landen als Aufträge in Ihrer Review-Queue —
              zusätzlich per E-Mail-Benachrichtigung. Einbau: <strong>eine Zeile</strong>, ohne Technik-Wissen.
              Im Full-Stack- und Team-Paket ist der Website-Chat bereits enthalten.
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={buy} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
              Jetzt buchen — {status.pricing.price_month_eur} €/Monat
            </Button>
            <span className="text-xs text-muted-foreground">zzgl. USt. · Jahresabo mit −20 % über „Abo &amp; Rechnung" · monatlich kündbar</span>
          </div>
        </>
      ) : !status.configured ? (
        /* ── Zustand 2: gebucht, noch nicht aktiviert ── */
        <>
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Der Website-Chat ist gebucht. Mit einem Klick legen wir Ihr persönliches Chat-Widget an —
              Name und Benachrichtigungs-Adresse übernehmen wir aus Ihrem Konto, alles ist danach änderbar.
            </span>
          </div>
          <Button onClick={activate} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Website-Chat aktivieren
          </Button>
        </>
      ) : (
        /* ── Zustand 3: eingerichtet ── */
        <>
          {cfg?.booked_source === "stripe" && !status.booked && (
            <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber-surface p-3 text-sm text-amber">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Das Webchat-Abo ist beendet — das Widget ist auf Ihrer Website automatisch abgeschaltet. Über „Abo &amp; Rechnung" können Sie es jederzeit wieder buchen.</span>
            </div>
          )}

          {/* Snippet */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ihr Einbau-Snippet (eine Zeile, vor <code>&lt;/body&gt;</code>)</Label>
            <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-all">{status.embed_snippet}</pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={copySnippet}>
                <Copy className="mr-2 h-4 w-4" /> Kopieren
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowMailForm((v) => !v)}>
                <Mail className="mr-2 h-4 w-4" /> An Website-Betreuer senden
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPreview((v) => !v)}>
                <Eye className="mr-2 h-4 w-4" /> {showPreview ? "Vorschau ausblenden" : "Live-Vorschau"}
              </Button>
            </div>
          </div>

          {showMailForm && (
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-sm">Ihr Webdesigner / Ihre Agentur bekommt eine fertige Einbau-Anleitung mit Ihrem Snippet:</Label>
              <Input value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="webmaster@ihre-agentur.de" type="email" autoComplete="off" />
              <Textarea value={mailNote} onChange={(e) => setMailNote(e.target.value)} placeholder="Optionale Nachricht, z. B.: Bitte bis Freitag einbauen." rows={2} />
              <Button size="sm" onClick={sendSnippet} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Anleitung senden
              </Button>
            </div>
          )}

          {showPreview && previewSrcDoc && (
            <iframe
              key={`${cfg?.widget_key}-${cfg?.accent_color}-${cfg?.greeting}-${cfg?.display_name}`}
              title="Jana Live-Vorschau"
              srcDoc={previewSrcDoc}
              sandbox="allow-scripts allow-same-origin"
              className="h-[480px] w-full rounded-md border bg-white"
            />
          )}

          {/* Einstellungen */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wc-name" className="text-sm">Anzeigename im Chat</Label>
              <Input id="wc-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="z. B. Muster Haustechnik GmbH" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-mail" className="text-sm">Benachrichtigungen an</Label>
              <Input id="wc-mail" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} type="email" placeholder="auftraege@ihre-firma.de" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wc-greet" className="text-sm">Begrüßung</Label>
              <Textarea id="wc-greet" value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={2} placeholder="Hallo! Ich bin Jana …" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-color" className="text-sm">Akzentfarbe</Label>
              <div className="flex items-center gap-2">
                <input
                  id="wc-color"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : "#0E7490"}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1"
                />
                <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="font-mono text-sm" placeholder="#0E7490" />
              </div>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="wc-on" className="text-sm">Widget aktiv</Label>
                <Switch id="wc-on" checked={widgetEnabled} onCheckedChange={setWidgetEnabled} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="wc-book" className="text-sm">Termin-Anfragen</Label>
                <Switch id="wc-book" checked={featBooking} onCheckedChange={setFeatBooking} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="wc-cb" className="text-sm">Rückruf-Wünsche</Label>
                <Switch id="wc-cb" checked={featCallback} onCheckedChange={setFeatCallback} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="wc-notify" className="text-sm">E-Mail-Benachrichtigung</Label>
                <Switch id="wc-notify" checked={notifyEnabled} onCheckedChange={setNotifyEnabled} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={saveConfig} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Einstellungen speichern
            </Button>
            <Button variant="outline" size="sm" onClick={rotateKey} disabled={busy}>
              <KeyRound className="mr-2 h-4 w-4" /> Neuen Key erzeugen
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { seeded.current = false; load(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> Aktualisieren
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Letzte 30 Tage: {status.usage_30d.messages} Nachrichten · {status.usage_30d.orders} Aufträge
            </span>
          </div>
        </>
      )}
    </div>
  );
}
