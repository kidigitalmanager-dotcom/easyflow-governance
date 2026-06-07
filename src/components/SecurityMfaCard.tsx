/**
 * SecurityMfaCard — Einstellungen → Allgemein: Zwei-Faktor-Authentifizierung
 * per Authenticator-App (Supabase-TOTP, Paket A 2026-06).
 * Enrollment: enroll → QR/Secret anzeigen → challengeAndVerify → aktiv.
 * Entfernen: unenroll (Recovery v1 = Admin entfernt Faktor im Supabase-Dashboard).
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { pickVerifiedTotpFactor, listUnverifiedFactors, type TotpFactorLike } from "@/lib/mfa";

interface EnrollData {
  id: string;
  qr: string;
  secret: string;
}

export default function SecurityMfaCard() {
  const [factors, setFactors] = useState<TotpFactorLike[] | null>(null); // null = lädt
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setFactors([]);
      return;
    }
    setFactors((data?.totp as TotpFactorLike[] | undefined) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verified = pickVerifiedTotpFactor(factors ?? []);

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Hängengebliebene (unverifizierte) Enrollments aufräumen — sonst
      // schlägt ein erneutes Enroll mit "friendly name exists" fehl.
      const { data: lf } = await supabase.auth.mfa.listFactors();
      for (const f of listUnverifiedFactors((lf?.totp as TotpFactorLike[] | undefined) ?? [])) {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator-App",
      });
      if (error || !data) {
        toast.error("Einrichtung fehlgeschlagen: " + (error?.message ?? "Unbekannter Fehler"));
        return;
      }
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll || code.length !== 6 || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) {
      toast.error("Code ungültig — bitte erneut versuchen.");
      setCode("");
      return;
    }
    toast.success("Zwei-Faktor-Authentifizierung ist aktiv.");
    setEnroll(null);
    setCode("");
    void refresh();
  };

  const cancelEnroll = async () => {
    if (enroll) {
      await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => undefined);
    }
    setEnroll(null);
    setCode("");
    void refresh();
  };

  const removeFactor = async () => {
    if (!verified) return;
    if (
      !window.confirm(
        "Zwei-Faktor wirklich entfernen? Der Login ist danach wieder ohne Code möglich."
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    if (error) {
      toast.error(
        "Entfernen fehlgeschlagen: " +
          error.message +
          " — ggf. einmal ab- und mit Code wieder anmelden, dann erneut versuchen."
      );
      return;
    }
    toast.success("Zwei-Faktor entfernt.");
    void refresh();
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Sicherheit — Zwei-Faktor-Authentifizierung</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Schütze deinen Login zusätzlich mit einer Authenticator-App (z. B. Google Authenticator,
        1Password, Authy). Nach der Einrichtung fragt UseEasy bei jedem Login nach einem
        6-stelligen Code — egal ob du dich per Passwort, Google oder Microsoft anmeldest.
      </p>

      {factors === null ? (
        <Skeleton className="h-10 w-full" />
      ) : enroll ? (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">Schritt 1:</span> Scanne den QR-Code mit deiner
            Authenticator-App — oder gib den Schlüssel manuell ein.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <img
              src={enroll.qr}
              alt="QR-Code für Authenticator-App"
              className="w-44 h-44 rounded-lg bg-white p-2 border"
            />
            <div className="space-y-2 text-center sm:text-left">
              <p className="text-xs text-muted-foreground">Manueller Schlüssel:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                  {enroll.secret}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => {
                    void navigator.clipboard?.writeText(enroll.secret);
                    toast.success("Schlüssel kopiert");
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <form onSubmit={confirmEnroll} className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">Schritt 2:</span> Gib den 6-stelligen Code aus der App
              ein, um die Einrichtung abzuschließen.
            </p>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="max-w-[160px] text-center font-mono tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aktivieren"}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelEnroll} disabled={busy}>
                Abbrechen
              </Button>
            </div>
          </form>
        </div>
      ) : verified ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge>Aktiv</Badge>
            <span className="text-sm text-muted-foreground">
              {verified.friendly_name || "Authenticator-App"}
              {verified.created_at &&
                " · eingerichtet am " + new Date(verified.created_at).toLocaleDateString("de-DE")}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={removeFactor} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> Entfernen
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Noch nicht eingerichtet.</span>
          <Button onClick={startEnroll} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="w-4 h-4 mr-2" />
            )}
            Zwei-Faktor einrichten
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Authenticator verloren? Melde dich beim UseEasy-Support — wir setzen den Faktor für dich
        zurück.
      </p>
    </div>
  );
}
