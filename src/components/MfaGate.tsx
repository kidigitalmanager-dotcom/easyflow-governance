/**
 * MfaGate — AAL2-Gate hinter dem Login (Paket A 2026-06, Leon-Entscheidung:
 * Challenge gilt für JEDEN Login-Weg — Passwort, Google, Microsoft).
 *
 * Verhalten:
 * - User OHNE Faktor: getAuthenticatorAssuranceLevel → aal1/aal1 → sofortiger
 *   Pass-Through. Die Prüfung ist LOKAL (JWT-Decode, kein Netzwerk-Call) —
 *   null spürbare Verhaltensänderung für Bestands-User.
 * - User MIT verifiziertem Faktor + Session noch aal1 → Code-Screen statt App.
 * - FAIL-OPEN: Wirft die AAL-Prüfung selbst einen Fehler, wird die App gerendert
 *   (bewusste Entscheidung: ein kaputter MFA-Check darf vor der Demo-Phase
 *   niemanden aussperren; MFA ist optional pro User).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { needsMfaChallenge } from "@/lib/mfa";
import MfaChallengeCard from "@/components/MfaChallengeCard";
import logo from "@/assets/useeasy-logo.jpg";

export function MfaGate({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const [state, setState] = useState<"checking" | "challenge" | "ok">("checking");

  useEffect(() => {
    let mounted = true;
    if (!session) {
      // Ohne Session entscheidet die ProtectedRoute (Redirect nach /login).
      setState("ok");
      return;
    }
    setState("checking");
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data) {
          setState("ok"); // fail-open
          return;
        }
        setState(needsMfaChallenge(data.currentLevel, data.nextLevel) ? "challenge" : "ok");
      })
      .catch(() => {
        if (mounted) setState("ok"); // fail-open
      });
    return () => {
      mounted = false;
    };
    // access_token wechselt nach erfolgreichem verify (aal1 → aal2) → Re-Check.
  }, [session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (state === "challenge") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <img src={logo} alt="UseEasy Logo" className="w-12 h-12 rounded-xl" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Use<span className="text-primary">Easy</span>
            </h1>
          </div>
          <MfaChallengeCard
            onVerified={() => setState("ok")}
            onCancel={() => void signOut()}
            cancelLabel="Abmelden"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
