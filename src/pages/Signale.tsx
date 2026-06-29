import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ShieldCheck, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCapAccountBySlug, useRecordConsent, useRevokeConsent } from "@/hooks/use-capital";
import { AccountDashboard } from "@/components/capital/AccountDashboard";
import { IllustrativeBadge } from "@/components/capital/CapitalBits";
import { CapitalStatementUpload } from "@/components/capital/CapitalStatementUpload";
import { CapitalBankConnect } from "@/components/capital/CapitalBankConnect";

const SELF_SLUG = "self_demo";
const TERMS_VERSION = "v1.0";

export default function Signale() {
  const { user } = useAuth();
  const { toast } = useToast();
  const self = useCapAccountBySlug(SELF_SLUG);
  const record = useRecordConsent();
  const revoke = useRevokeConsent();
  const [agree, setAgree] = useState(false);

  const account = self.data;
  const consented = !!account?.consent_data_sharing;
  const consentDate = account?.consent_at ? new Date(account.consent_at).toLocaleDateString("de-DE") : null;

  const confirm = () => {
    record.mutate(
      { slug: SELF_SLUG, email: user?.email ?? "unknown", version: TERMS_VERSION },
      {
        onSuccess: () => toast({ title: "Datenfreigabe gespeichert", description: "Dein Profil ist jetzt für die Investorenseite freigegeben." }),
        onError: (e: any) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
      },
    );
  };
  const doRevoke = () =>
    revoke.mutate({ slug: SELF_SLUG }, { onSuccess: () => { setAgree(false); toast({ title: "Freigabe widerrufen" }); } });

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Signale</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Dein kommunikationsbasiertes Frühwarn-Profil — 0–100-Indizes, vorlaufend &amp; auditierbar.
        </p>
      </header>

      {self.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !account ? (
        <Card className="glass-card"><CardContent className="py-10 text-center text-sm text-muted-foreground">Kein Profil gefunden.</CardContent></Card>
      ) : !consented ? (
        <Card className="glass-card border-primary/20">
          <CardContent className="pt-6">
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Lock className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Einmalige Datenfreigabe</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Read-only, PII-minimiert, EU/Frankfurt. Es verlassen <span className="text-foreground font-medium">nur aggregierte
                  0–100-Werte</span> das System — niemals Mail-Inhalte. Einmal bestätigt, dauerhaft gespeichert &amp; jederzeit widerrufbar.
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 cursor-pointer">
                <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
                <span className="text-sm text-foreground leading-relaxed">
                  Ich bestätige, dass ich berechtigt bin, diese Unternehmensdaten zu <span className="font-medium">teilen und zu speichern</span>,
                  und stimme der Weitergabe der aggregierten 0–100-Kennzahlen an die Investorenseite zu. <span className="text-muted-foreground">(AGB {TERMS_VERSION})</span>
                </span>
              </label>
              <div className="flex justify-center">
                <Button onClick={confirm} disabled={!agree || record.isPending} className="h-11 px-6 gap-2">
                  <ShieldCheck className="w-4 h-4" /> {record.isPending ? "Wird gespeichert…" : "Bestätigen & freigeben"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card border-emerald-500/20">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">An Investoren freigegeben</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Einmalige Freigabe gespeichert{consentDate ? ` am ${consentDate}` : ""} (AGB {TERMS_VERSION}). Dein Profil erscheint auf der Investorenseite.
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={doRevoke} disabled={revoke.isPending} className="text-muted-foreground hover:text-destructive">
                Widerrufen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {account && <CapitalBankConnect />}
      {account && <CapitalStatementUpload />}

      {account && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {consented ? "Dein freigegebenes Profil" : "Vorschau deines Profils (noch nicht freigegeben)"}
            </h2>
            {account.account_type === "demo" && <IllustrativeBadge />}
          </div>
          <AccountDashboard account={account} />
        </section>
      )}
    </div>
  );
}
