import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";
import logo from "@/assets/useeasy-logo.jpg";

/**
 * Stripe-Erfolgsseite (Self-Serve). URL: app.useeasy.ai/willkommen?session_id={CHECKOUT_SESSION_ID}
 *
 * Holt direkt nach dem Kauf den Connect-Link über GET /v1/onboarding/connect/by-session,
 * sodass der Kunde SOFORT „Postfach verbinden" kann — unabhängig davon, ob die
 * SES-Onboarding-Mail schon angekommen ist (die bleibt als Backup). Solange der
 * Stripe-Webhook den Tenant noch anlegt (status:"pending"), wird kurz gepollt.
 *
 * PRE-LOGIN: kein Auth, direkter fetch zu api.useeasy.ai (wie /connect).
 */

const API_BASE = "https://api.useeasy.ai";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 10; // ~30 s, dann freundlicher Mail-Hinweis

type Stage = "loading" | "ready" | "pending" | "fallback";

export default function Willkommen() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [stage, setStage] = useState<Stage>("loading");
  const [connectUrl, setConnectUrl] = useState<string>("");
  const [company, setCompany] = useState<string | null>(null);
  const tries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) { setStage("fallback"); return; }

    async function poll() {
      tries.current += 1;
      try {
        const res = await fetch(
          `${API_BASE}/v1/onboarding/connect/by-session?session_id=${encodeURIComponent(sessionId)}`,
        );
        const j = await res.json();
        if (cancelled) return;
        if (j.ok && j.status === "ready" && j.connect_url) {
          setConnectUrl(j.connect_url);
          setCompany(j.company_name || null);
          setStage("ready");
          return;
        }
        // status:"pending" → Webhook legt den Tenant noch an → erneut versuchen
        if (j.status === "pending" && tries.current < POLL_MAX) {
          setStage("pending");
          timer.current = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        setStage("fallback");
      } catch {
        if (cancelled) return;
        if (tries.current < POLL_MAX) {
          setStage("pending");
          timer.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else {
          setStage("fallback");
        }
      }
    }
    poll();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [sessionId]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Willkommen bei UseEasy</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="UseEasy Logo" className="h-12 w-12 rounded" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Vielen Dank für Ihren Kauf 🎉</h1>
        </CardHeader>

        <CardContent className="space-y-5 text-center">
          {(stage === "loading" || stage === "pending") && (
            <>
              <p className="text-muted-foreground">
                Ihr UseEasy-Konto wird gerade eingerichtet{company ? ` für ${company}` : ""} …
              </p>
              <p className="text-sm text-muted-foreground">Einen Moment bitte — das dauert nur wenige Sekunden.</p>
            </>
          )}

          {stage === "ready" && (
            <>
              <p>
                Ihr Konto ist bereit{company ? <> für <span className="font-medium text-foreground">{company}</span></> : ""}.
                Verbinden Sie jetzt Ihr Postfach, dann legt UseEasy sofort los.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Es wird nichts automatisch versendet</strong> — die Sende-Entscheidung bleibt immer bei Ihnen.
              </p>
              <Button asChild className="w-full" size="lg">
                <a href={connectUrl}>Postfach verbinden</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Sie haben außerdem eine E-Mail mit diesem Link und Ihren Unterlagen (Quickstart, AVV, Rechnung) erhalten.
              </p>
            </>
          )}

          {stage === "fallback" && (
            <>
              <p>Ihr Kauf ist eingegangen — vielen Dank!</p>
              <p className="text-sm text-muted-foreground">
                Wir haben Ihnen soeben eine E-Mail <strong>„Postfach verbinden"</strong> geschickt (bitte ggf. auch den
                Spam-Ordner prüfen). Über den Button in dieser Mail verbinden Sie Ihr Postfach. Falls nichts ankommt,
                melden Sie sich gern unter <a href="mailto:support@useeasy.ai" className="underline">support@useeasy.ai</a>.
              </p>
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
