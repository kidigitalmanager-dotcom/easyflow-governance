/**
 * ResetPassword — /reset-password (Quick-Win Paket C, 2026-06).
 * Ziel des Recovery-Links aus „Passwort vergessen?" (Login.tsx →
 * resetPasswordForEmail). Supabase stellt beim Klick auf den Link die Session
 * her (detectSessionInUrl) — hier wird nur noch das neue Passwort gesetzt.
 * Liegt BEWUSST außerhalb der ProtectedRoute (kein MfaGate — der greift nach
 * dem Redirect auf "/" ohnehin).
 *
 * Redesign 27.07.2026: gleiche Sprache wie der neue Login (dunkler Grund,
 * Markenzeile, Kicker + Serif-Akzent, .ue-input, Emerald-CTA). Die Seite läuft
 * außerhalb des AppLayout und bringt ihren zentrierten Rahmen selbst mit.
 * Die Logik ist unverändert: 8-Zeichen-Regel, Gleichheitsprüfung,
 * updateUser, Full-Reload auf "/" — und der Hinweis bei abgelaufenem Link.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Helmet } from "react-helmet-async";
import logo from "@/assets/useeasy-logo.jpg";

export default function ResetPassword() {
  const { session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      toast({ title: "Passwort zu kurz", description: "Mindestens 8 Zeichen.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwörter stimmen nicht überein", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Ändern fehlgeschlagen", description: error.message, variant: "destructive" });
      setBusy(false);
      return;
    }
    toast({ title: "Passwort geändert" });
    // Gleicher deterministischer Einstieg wie beim Login (Full-Reload).
    window.location.href = "/";
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Helmet>
        <title>UseEasy — Passwort zurücksetzen</title>
        <meta name="description" content="Setze dein Passwort für die UseEasy Console zurück. Gib ein neues, sicheres Passwort ein, um wieder auf den E-Mail-Autopiloten zuzugreifen." />
        <link rel="canonical" href="https://app.useeasy.ai/reset-password" />
        <meta property="og:url" content="https://app.useeasy.ai/reset-password" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="w-full max-w-[400px]">
        {/* Markenzeile — identisch zum Login, damit der Recovery-Link nicht wie
            eine fremde Seite wirkt. */}
        <div className="flex items-center gap-2.5 animate-fade-up">
          <img src={logo} alt="UseEasy Logo" className="w-[30px] h-[30px] rounded-lg" />
          <span className="text-[15px] font-semibold tracking-tight">
            Use<span className="text-primary">Easy</span>
          </span>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-[0.06em] text-tx-weak">
            Console
          </span>
        </div>

        <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <p className="ue-kicker">Passwort</p>
          <h1 className="mt-3 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-foreground">
            Neues Passwort
            <br />
            <span className="ue-serif">festlegen.</span>
          </h1>
        </div>

        <div className="glass-card mt-8 p-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {authLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : session ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Wähle ein neues Passwort für <span className="text-tx-secondary">{session.user?.email}</span>.</span>
              </p>
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-muted-foreground">Neues Passwort (mind. 8 Zeichen)</span>
                <input
                  className="ue-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={busy}
                  autoFocus
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] text-muted-foreground">Neues Passwort wiederholen</span>
                <input
                  className="ue-input"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  disabled={busy}
                  autoComplete="new-password"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className={
                  "relative w-full rounded-[10px] bg-primary px-4 py-[11px] text-[14px] font-semibold text-primary-foreground " +
                  "transition-all duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_hsl(var(--emerald)/0.8)] " +
                  "disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none " +
                  (busy ? "" : "sheen")
                }
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Speichere …
                  </span>
                ) : (
                  "Passwort speichern"
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Dieser Link ist abgelaufen oder ungültig. Fordere auf der Login-Seite über
                „Passwort vergessen?" einen neuen Link an.
              </p>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-[10px] border border-border bg-muted px-4 py-[11px] text-[13.5px] font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground"
              >
                Zurück zum Login
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-[12px] leading-relaxed text-tx-faint">
          UseEasy erstellt ausschließlich Entwürfe. Es wird nichts versendet, gebucht oder gemeldet,
          bevor du freigibst.
        </p>
      </div>
    </main>
  );
}
