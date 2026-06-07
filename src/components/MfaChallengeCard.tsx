/**
 * MfaChallengeCard — 6-stellige TOTP-Code-Eingabe (Supabase-MFA, Paket A 2026-06).
 * Wiederverwendet: (1) Login.tsx nach signInWithPassword, (2) MfaGate nach OAuth-Rückkehr.
 * Wird NUR gerendert, wenn bereits feststeht, dass eine aal2-Challenge nötig ist.
 */
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickVerifiedTotpFactor } from "@/lib/mfa";

interface MfaChallengeCardProps {
  onVerified: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

export default function MfaChallengeCard({ onVerified, onCancel, cancelLabel = "Abbrechen" }: MfaChallengeCardProps) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [factorError, setFactorError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setFactorError("Faktoren konnten nicht geladen werden: " + error.message);
        return;
      }
      const factor = pickVerifiedTotpFactor(data?.totp);
      if (factor) setFactorId(factor.id);
      else setFactorError("Kein aktiver Authenticator-Faktor gefunden.");
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6 || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      setError("Code ungültig oder abgelaufen — bitte erneut versuchen.");
      setCode("");
      setSubmitting(false);
      inputRef.current?.focus();
      return;
    }
    onVerified();
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <ShieldCheck className="w-8 h-8 text-primary" />
        <h2 className="text-lg font-semibold">Zwei-Faktor-Bestätigung</h2>
        <p className="text-sm text-muted-foreground">
          Gib den 6-stelligen Code aus deiner Authenticator-App ein.
        </p>
      </div>

      {factorError ? (
        <div className="text-sm text-destructive text-center">{factorError}</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={inputRef}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            className="text-center text-xl tracking-[0.4em] font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={submitting || !factorId}
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="submit" disabled={submitting || code.length !== 6 || !factorId} className="w-full h-11">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Prüfe Code…
              </>
            ) : (
              "Bestätigen"
            )}
          </Button>
        </form>
      )}

      {onCancel && (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel} disabled={submitting}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}
