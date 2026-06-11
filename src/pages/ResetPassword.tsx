/**
 * ResetPassword — /reset-password (Quick-Win Paket C, 2026-06).
 * Ziel des Recovery-Links aus „Passwort vergessen?" (Login.tsx →
 * resetPasswordForEmail). Supabase stellt beim Klick auf den Link die Session
 * her (detectSessionInUrl) — hier wird nur noch das neue Passwort gesetzt.
 * Liegt BEWUSST außerhalb der ProtectedRoute (kein MfaGate — der greift nach
 * dem Redirect auf "/" ohnehin).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="UseEasy Logo" className="w-12 h-12 rounded-xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Use<span className="text-primary">Easy</span>
          </h1>
          <p className="text-sm text-muted-foreground">Neues Passwort festlegen</p>
        </div>

        <div className="glass-card p-6 space-y-4">
          {authLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : session ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <KeyRound className="w-4 h-4 text-primary" />
                Wähle ein neues Passwort für {session.user?.email}.
              </div>
              <Input
                type="password"
                placeholder="Neues Passwort (min. 8 Zeichen)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={busy}
                autoFocus
              />
              <Input
                type="password"
                placeholder="Neues Passwort wiederholen"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={busy}
              />
              <Button type="submit" disabled={busy} className="w-full h-12 text-base font-medium">
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichere…
                  </>
                ) : (
                  "Passwort speichern"
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Dieser Link ist abgelaufen oder ungültig. Fordere auf der Login-Seite über
                „Passwort vergessen?" einen neuen Link an.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Zurück zum Login</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
