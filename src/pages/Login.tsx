import { useState, type ReactNode } from "react";
import { Building2, Landmark, HardHat } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { needsMfaChallenge } from "@/lib/mfa";
import MfaChallengeCard from "@/components/MfaChallengeCard";
import { Helmet } from "react-helmet-async";
import { Dot } from "@/components/ue/primitives";
import { armBootSequence } from "@/lib/boot-flag";
import logo from "@/assets/useeasy-logo.jpg";

/* ────────────────────────────────────────────────────────────────────────────
   Login — Redesign 27.07.2026, Briefing §7.1.

   Split-Layout 1.05fr / 0.95fr. Links die Hülle (Marke, Statement, Formular,
   Vertrauenssatz), rechts drei Vorschau-Karten als Produkt-Illustration.

   ⚠ Datenschutz-Entscheid (Leon): die Vorschau-Karten stehen VOR dem Login.
   Dort stehen deshalb ausschliesslich neutrale Beispielzahlen, sichtbar als
   Beispiel gekennzeichnet — niemals echte Tenant-Daten pre-auth.

   Die Auth-Logik ist unveraendert uebernommen: signInWithPassword, OAuth
   (Google/Microsoft), MFA-Challenge, Passwort-vergessen, Mitarbeiter-Signup,
   Rollen-Kacheln inkl. ue_role/ue_login_tile. Nur die Huelle ist neu.
   ──────────────────────────────────────────────────────────────────────────── */

export default function Login() {
  // Quick-Win 2026-06: per-Button-Loading — `loading` bleibt abgeleitet erhalten,
  // damit alle bestehenden disabled={loading}-Stellen unverändert funktionieren.
  const [loadingBtn, setLoadingBtn] = useState<null | "google" | "azure" | "email">(null);
  const loading = loadingBtn !== null;
  // 2FA (Paket A): Code-Abfrage nach signInWithPassword, NUR wenn ein Faktor existiert.
  const [mfaPending, setMfaPending] = useState(false);
  // Quick-Win: Passwort-vergessen-Flow
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  // v4.132.0 (Zeiterfassung): Konto-erstellen-Flow — Mitarbeiter registrieren sich
  // mit GENAU der E-Mail, die der Chef unter Einstellungen -> Team angelegt hat.
  // Backend ist fail-closed: ein Konto ohne Team-/Tenant-Zuordnung sieht nichts.
  const [signupMode, setSignupMode] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupSent, setSignupSent] = useState(false);
  const [password2, setPassword2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const [role, setRole] = useState<string | null>(() => (typeof window !== "undefined" ? localStorage.getItem("ue_role") : null));
  const chooseRole = (r: string) => { localStorage.setItem("ue_role", r); setRole(r); };
  // v4.132.0: dritte Kachel "Mitarbeiter" — reine UX-Weiche (KEINE Rechte-Quelle!).
  // Die echte Rolle kommt serverseitig aus /me (tenant_members -> role:'employee').
  // ue_role bleibt 'company', damit RoleGate/RoleHome unverändert funktionieren;
  // die Kachel merkt sich nur lokal, dass der Mitarbeiter-Einstieg gewählt wurde.
  const [workerTile, setWorkerTile] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem("ue_login_tile") === "worker" : false));
  const chooseWorker = () => {
    localStorage.setItem("ue_role", "company");
    localStorage.setItem("ue_login_tile", "worker");
    setRole("company");
    setWorkerTile(true);
  };
  const chooseNonWorker = (r: string) => {
    localStorage.setItem("ue_login_tile", r);
    setWorkerTile(false);
    chooseRole(r);
  };
  const { session, loading: authLoading } = useAuth();

  const handleGoogleLogin = async () => {
    setLoadingBtn("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/gmail.modify",
        redirectTo: window.location.origin + "/",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      toast({ title: "Login fehlgeschlagen", description: error.message, variant: "destructive" });
      setLoadingBtn(null);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoadingBtn("azure");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: window.location.origin + "/",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      toast({ title: "Login fehlgeschlagen", description: error.message, variant: "destructive" });
      setLoadingBtn(null);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingBtn("email");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Login fehlgeschlagen", description: error.message, variant: "destructive" });
      setLoadingBtn(null);
      return;
    }
    // 2FA (Paket A, additiv): Hat der User einen verifizierten Faktor, kommt ZUERST
    // die 6-stellige Code-Abfrage. User OHNE Faktor: nextLevel bleibt aal1 →
    // needsMfaChallenge=false → identisches Verhalten wie bisher (Fix 83c1375).
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && needsMfaChallenge(aal.currentLevel, aal.nextLevel)) {
        setMfaPending(true);
        setLoadingBtn(null);
        return;
      }
    } catch {
      // fail-open: ohne AAL-Info normal weiter (MFA ist optional)
    }
    // Erfolg: Full-Reload — AuthProvider mountet neu und liest die Session deterministisch.
    // Boot-Sequenz genau hier armen (§7.2): das ist ein frischer Login. Der
    // AuthProvider darf das NICHT anhand von SIGNED_IN tun — das Event feuert
    // auch beim Wiederherstellen einer Sitzung.
    armBootSequence();
    window.location.href = "/";
  };

  // v4.132.0: Konto erstellen (Supabase signUp). Zwei Ausgänge:
  // (a) E-Mail-Bestätigung AN -> Hinweis-Screen "Mail ist unterwegs";
  // (b) Bestätigung AUS -> Session sofort da -> Full-Reload wie beim Login.
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupBusy) return;
    if (password.length < 8) {
      toast({ title: "Passwort zu kurz", description: "Bitte mindestens 8 Zeichen verwenden.", variant: "destructive" });
      return;
    }
    if (password !== password2) {
      toast({ title: "Passwörter stimmen nicht überein", description: "Bitte beide Felder identisch ausfüllen.", variant: "destructive" });
      return;
    }
    setSignupBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + "/" },
    });
    setSignupBusy(false);
    if (error) {
      const msg = /signup.*(disabled|not allowed)/i.test(error.message)
        ? "Registrierungen sind serverseitig deaktiviert (Supabase → Auth → 'Allow new users to sign up' aktivieren)."
        : error.message;
      toast({ title: "Registrierung fehlgeschlagen", description: msg, variant: "destructive" });
      return;
    }
    // Mitarbeiter/Neu-Konten starten immer in der Unternehmens-Sicht (die
    // Mitarbeiter-Weiche greift serverseitig über /me role:'employee').
    localStorage.setItem("ue_role", "company");
    if (data.session) {
      armBootSequence();
      window.location.href = "/";
      return;
    }
    // Supabase antwortet bei BEREITS registrierter Adresse aus Sicherheitsgruenden
    // neutral (user mit identities: [] und ohne Session) — es kommt dann KEINE Mail.
    // E2E-Fund 22.07.: ohne diese Erkennung wartet man ewig auf eine Bestaetigung.
    const identities = (data.user && (data.user.identities as unknown[] | null)) || [];
    if (data.user && identities.length === 0) {
      toast({
        title: "Diese Adresse hat bereits ein Konto",
        description: "Einfach oben anmelden — oder über „Passwort vergessen“ ein neues Passwort setzen. Eine Bestätigungs-Mail kommt in diesem Fall nicht.",
      });
      setSignupMode(false);
      return;
    }
    setSignupSent(true);
  };

  // Quick-Win: Passwort-vergessen — Recovery-Link an die E-Mail-Adresse senden.
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || forgotBusy) return;
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setForgotBusy(false);
    if (error) {
      toast({ title: "Senden fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    setForgotSent(true);
  };

  // Bereits eingeloggt? Dann hat /login nichts zu zeigen (behebt die Reload-Falle auf /login).
  // 2026-06 (Paket A): && !mfaPending — während der laufenden Code-Abfrage existiert bereits
  // eine aal1-Session; ohne die Ausnahme würde der Guard den Code-Screen wegredirecten.
  // Für User ohne MFA-Faktor ist mfaPending immer false → Verhalten unverändert (83c1375).
  if (!authLoading && session && !mfaPending) {
    return <Navigate to="/" replace />;
  }

  /* ---------------------------------------------------------------- 2FA --- */
  if (mfaPending) {
    return (
      <LoginShell kicker="Sicherheitscode" title="Noch ein" accent="Schritt.">
        <MfaChallengeCard
          onVerified={() => {
            // Gleicher deterministischer Einstieg wie der normale Login-Erfolg.
            armBootSequence();
            window.location.href = "/";
          }}
          onCancel={async () => {
            await supabase.auth.signOut();
            setMfaPending(false);
          }}
          cancelLabel="Zurück zum Login"
        />
      </LoginShell>
    );
  }

  /* ------------------------------------------------------- Konto anlegen --- */
  if (signupMode) {
    return (
      <LoginShell
        kicker="Neu bei UseEasy"
        title="Konto"
        accent="erstellen."
        subtitle="Als Mitarbeiter: nutze genau die E-Mail-Adresse, die dein Chef unter Mitarbeiter → Team hinterlegt hat. Dann landest du direkt auf deiner Arbeitsfläche."
      >
        {signupSent ? (
          <div className="space-y-4 max-w-[340px]">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Fast geschafft — wir haben dir eine Bestätigungs-Mail geschickt. Bitte klicke den
              Link darin und melde dich danach an. (Nichts angekommen? Spam-Ordner prüfen.)
            </p>
            <GhostButton onClick={() => { setSignupMode(false); setSignupSent(false); setPassword(""); setPassword2(""); }}>
              Zurück zum Login
            </GhostButton>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4 max-w-[340px]">
            <Field label="E-Mail-Adresse">
              <input className="ue-input" type="email" value={email} autoFocus required disabled={signupBusy}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            </Field>
            <Field label="Passwort (mind. 8 Zeichen)">
              <input className="ue-input" type="password" value={password} required disabled={signupBusy}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Passwort wiederholen">
              <input className="ue-input" type="password" value={password2} required disabled={signupBusy}
                onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" />
            </Field>
            <PrimaryButton type="submit" disabled={signupBusy} sheen={!signupBusy}>
              {signupBusy ? "Erstelle Konto …" : "Konto erstellen"}
            </PrimaryButton>
            <GhostButton onClick={() => setSignupMode(false)} disabled={signupBusy}>
              Zurück zum Login
            </GhostButton>
          </form>
        )}
      </LoginShell>
    );
  }

  /* -------------------------------------------------- Passwort vergessen --- */
  if (forgotMode) {
    return (
      <LoginShell
        kicker="Passwort"
        title="Neues Passwort"
        accent="setzen."
        subtitle="Gib deine E-Mail-Adresse ein — wir senden dir einen Link zum Zurücksetzen."
      >
        {forgotSent ? (
          <div className="space-y-4 max-w-[340px]">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Wenn ein Konto mit dieser Adresse existiert, ist jetzt ein Link zum Zurücksetzen
              unterwegs. Bitte prüfe deinen Posteingang (und Spam-Ordner).
            </p>
            <GhostButton onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }}>
              Zurück zum Login
            </GhostButton>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4 max-w-[340px]">
            <Field label="E-Mail-Adresse">
              <input className="ue-input" type="email" value={forgotEmail} autoFocus required disabled={forgotBusy}
                onChange={(e) => setForgotEmail(e.target.value)} placeholder="name@firma.de" />
            </Field>
            <PrimaryButton type="submit" disabled={forgotBusy} sheen={!forgotBusy}>
              {forgotBusy ? "Sende Link …" : "Link senden"}
            </PrimaryButton>
            <GhostButton onClick={() => setForgotMode(false)} disabled={forgotBusy}>
              Zurück zum Login
            </GhostButton>
          </form>
        )}
      </LoginShell>
    );
  }

  /* ------------------------------------------------------------- Login ---- */
  return (
    <LoginShell
      kicker="Willkommen zurück"
      title={<>Deine Vorgänge sind</>}
      accent="vorbereitet."
      subtitle="UseEasy hat über Nacht gelesen und sortiert, Antwort-Entwürfe holst du dir per Klick. Freigeben bleibt deine Entscheidung."
      head={
        <Helmet>
          <title>UseEasy — Login zur Console</title>
          <meta name="description" content="Melde dich bei der UseEasy Console an, um deinen KI-E-Mail-Autopiloten zu konfigurieren. Login mit Google, Microsoft oder E-Mail." />
          <link rel="canonical" href="https://app.useeasy.ai/login" />
          <meta property="og:url" content="https://app.useeasy.ai/login" />
          <meta property="og:title" content="UseEasy — Login zur Console" />
          <meta property="og:description" content="Melde dich bei der UseEasy Console an, um deinen KI-E-Mail-Autopiloten zu konfigurieren." />
        </Helmet>
      }
    >
      <div className="max-w-[340px] space-y-5">
        {/* Rolle: 3 Kacheln (v4.132.0: + Mitarbeiter — Registrierung NUR dort) */}
        <div>
          <p className="ue-kicker mb-2">Ich melde mich an als</p>
          <div className="grid grid-cols-3 gap-2">
            <RoleTile icon={Building2} label="Unternehmen" active={role === "company" && !workerTile}
              onClick={() => chooseNonWorker("company")} />
            <RoleTile icon={HardHat} label="Mitarbeiter" active={workerTile} onClick={chooseWorker} />
            <RoleTile icon={Landmark} label="Investor" active={role === "investor" && !workerTile}
              onClick={() => chooseNonWorker("investor")} />
          </div>
        </div>

        {/* v4.132.0: Unter der Mitarbeiter-Kachel KEINE OAuth-Buttons — die
            fuehren in den Kunden-Funnel (Postfach-Connect -> neuer Tenant,
            E2E-Fund 22.07. abends). Mitarbeiter = E-Mail + Passwort. */}
        {workerTile && (
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Mitarbeiter melden sich mit <b className="text-tx-secondary">E-Mail + Passwort</b> an.
            Wichtig: genau die Adresse nutzen, die dein Chef unter Mitarbeiter → Team hinterlegt
            hat. Noch kein Konto? Unten „Konto erstellen“.
          </p>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <Field label="E-Mail">
            <input className="ue-input" type="email" value={email} required disabled={loading}
              onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" autoComplete="username" />
          </Field>
          <Field label="Passwort">
            <input className="ue-input" type="password" value={password} required disabled={loading}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </Field>
          <PrimaryButton type="submit" disabled={loading} sheen={!loading}>
            {loadingBtn === "email" ? "Wird angemeldet …" : "Console öffnen"}
          </PrimaryButton>
        </form>

        {!workerTile && (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-[0.14em] text-tx-weak">oder</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2.5">
              <OAuthButton onClick={handleGoogleLogin} disabled={loading}
                label={loadingBtn === "google" ? "Wird verbunden …" : "Mit Google anmelden"}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </OAuthButton>
              <OAuthButton onClick={handleMicrosoftLogin} disabled={loading}
                label={loadingBtn === "azure" ? "Wird verbunden …" : "Mit Microsoft anmelden"}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 21 21" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              </OAuthButton>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <button type="button" disabled={loading} onClick={() => setForgotMode(true)}
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
            Passwort vergessen?
          </button>
          {/* v4.132.0: Selbst-Registrierung NUR unter der Mitarbeiter-Kachel.
              Unternehmen entstehen über den Kauf (Kauf-E-Mail), Investoren per
              Einladung — die Kachel ist reine UX, Rechte vergibt der Server. */}
          {workerTile && (
            <>
              <span className="text-tx-faint">·</span>
              <button type="button" disabled={loading} onClick={() => { setSignupMode(true); setSignupSent(false); }}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                Neu hier? Konto erstellen
              </button>
            </>
          )}
        </div>

        {!workerTile && (
          <p className="text-[11.5px] leading-relaxed text-tx-weak">
            {role === "investor"
              ? "Investoren-Zugänge werden per Einladung freigeschaltet — melde dich mit der eingeladenen E-Mail-Adresse an."
              : "Dein Unternehmens-Zugang entsteht automatisch mit dem Kauf — melde dich mit der E-Mail an, mit der gekauft wurde. Mitarbeiter registrieren sich über die Kachel „Mitarbeiter“."}
          </p>
        )}
      </div>
    </LoginShell>
  );
}

/* ══════════════════════════════ Hülle ══════════════════════════════════════ */

function LoginShell({
  kicker,
  title,
  accent,
  subtitle,
  children,
  head,
}: {
  kicker: string;
  title: ReactNode;
  accent?: string;
  subtitle?: string;
  children: ReactNode;
  head?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {head}

      {/* Linke Spalte */}
      <div className="flex flex-col justify-between border-r border-[hsl(var(--card-raised))] px-6 py-10 sm:px-14 sm:py-14">
        <div>
          {/* Markenzeile */}
          <div className="flex items-center gap-2.5 animate-fade-up">
            <img src={logo} alt="UseEasy Logo" className="w-[30px] h-[30px] rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="text-[11px] uppercase tracking-[0.06em] text-tx-weak border border-border rounded-md px-1.5 py-0.5">
              Console
            </span>
          </div>

          <div className="mt-10 sm:mt-14 max-w-[540px]">
            <p className="ue-kicker animate-fade-up" style={{ animationDelay: "0.1s" }}>{kicker}</p>
            <h1
              className="mt-3 text-[32px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.03em] animate-fade-up"
              style={{ animationDelay: "0.18s" }}
            >
              {title}
              {accent ? (
                <>
                  <br />
                  <span className="ue-serif">{accent}</span>
                </>
              ) : null}
            </h1>
            {subtitle ? (
              <p
                className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-muted-foreground animate-fade-up"
                style={{ animationDelay: "0.28s" }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="mt-8 animate-fade-up" style={{ animationDelay: "0.36s" }}>
            {children}
          </div>
        </div>

        {/* Fuss: Vertrauenssatz.
            KEIN "Ersteinrichtung fortsetzen"-Link mehr: /connect braucht zwingend
            den Token aus der Einrichtungs-Mail (Connect.tsx -> missing_token), ein
            Link ohne Query landet also IMMER auf "Verbindung nicht moeglich". */}
        <div className="mt-12 max-w-[420px] space-y-3">
          <p className="text-[12px] leading-relaxed text-tx-faint">
            UseEasy erstellt ausschließlich Entwürfe. Es wird nichts versendet, gebucht oder
            gemeldet, bevor du freigibst.
          </p>
        </div>
      </div>

      {/* Rechte Spalte — Produkt-Illustration, KEINE echten Daten (pre-auth). */}
      <PreviewColumn />
    </main>
  );
}

function PreviewColumn() {
  const in2Days = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  return (
    <aside
      aria-hidden
      className="hidden lg:flex flex-col items-center justify-center px-12"
      style={{
        background:
          "radial-gradient(90% 70% at 80% 10%, hsl(var(--emerald-deep)) 0%, hsl(var(--background)) 60%)",
      }}
    >
      <div className="w-full max-w-[400px] space-y-4">
        {/* 1 — Heute vorbereitet */}
        <div className="ue-card-raised p-5 animate-slide-l" style={{ animationDelay: "0.35s" }}>
          <div className="flex items-center gap-2">
            <Dot pulse />
            <p className="ue-kicker">Heute vorbereitet</p>
          </div>
          <p className="mt-3 text-[40px] leading-none font-semibold tabular tracking-[-0.03em]">12</p>
          <p className="mt-2 text-[12.5px] text-muted-foreground">Entwürfe warten auf Freigabe</p>
        </div>

        {/* 2 — Nächste Frist */}
        <div className="ue-card-raised p-5 animate-slide-l" style={{ animationDelay: "0.5s" }}>
          <p className="ue-kicker">Nächste Frist</p>
          <p className="mt-2.5 text-[14px] font-medium text-foreground">
            Angebot nachfassen · Musterbau GmbH
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-amber">
            <span className="ue-dot bg-amber" />
            in 2 Tagen · {in2Days}
          </p>
        </div>

        {/* 3 — Offene Forderungen */}
        <div className="ue-card-raised p-5 animate-slide-l" style={{ animationDelay: "0.62s" }}>
          <p className="ue-kicker">Offene Forderungen</p>
          <p className="mt-2.5 text-[24px] leading-none font-semibold tabular">8.420 €</p>
          <p className="mt-2 text-[12.5px] text-danger">2 überfällig</p>
        </div>

        {/* Datenschutz: klar als Beispiel gekennzeichnet. */}
        <p className="pt-1 text-[11px] text-tx-faint">
          Beispielansicht — deine echten Zahlen erscheinen erst nach der Anmeldung.
        </p>
      </div>
    </aside>
  );
}

/* ═══════════════════════════ Bausteine ═════════════════════════════════════ */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
  sheen = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  sheen?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={
        "relative w-full rounded-[10px] bg-primary px-4 py-[11px] text-[14px] font-semibold text-primary-foreground " +
        "transition-all duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-14px_hsl(var(--emerald)/0.8)] " +
        "disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none " +
        (sheen ? "sheen" : "")
      }
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-[10px] border border-border px-4 py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function OAuthButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-border bg-muted px-4 py-2.5 text-[13.5px] font-medium text-tx-secondary transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
    >
      {children}
      {label}
    </button>
  );
}

function RoleTile({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Building2;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "flex flex-col items-center gap-1.5 rounded-[10px] border px-2 py-2.5 transition-colors " +
        (active
          ? "border-emerald-surface bg-emerald-surface/60"
          : "border-border bg-muted hover:border-primary/35")
      }
    >
      <Icon className={"w-4 h-4 " + (active ? "text-emerald-light" : "text-muted-foreground")} />
      <span className={"text-[11.5px] font-medium " + (active ? "text-emerald-light" : "text-tx-secondary")}>
        {label}
      </span>
    </button>
  );
}
