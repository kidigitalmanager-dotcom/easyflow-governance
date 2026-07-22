import { useState } from "react";
import { Building2, Landmark, HardHat } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { needsMfaChallenge } from "@/lib/mfa";
import MfaChallengeCard from "@/components/MfaChallengeCard";
import { Helmet } from "react-helmet-async";
import logo from "@/assets/useeasy-logo.jpg";


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
      window.location.href = "/";
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

  // 2FA-Code-Screen (nur nach erfolgreichem Passwort-Login MIT eingerichtetem Faktor)
  if (mfaPending) {
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
            onVerified={() => {
              // Gleicher deterministischer Einstieg wie der normale Login-Erfolg.
              window.location.href = "/";
            }}
            onCancel={async () => {
              await supabase.auth.signOut();
              setMfaPending(false);
            }}
            cancelLabel="Zurück zum Login"
          />
        </div>
      </div>
    );
  }

  // v4.132.0: Konto-erstellen-Ansicht (Muster forgotMode)
  if (signupMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-3">
            <img src={logo} alt="UseEasy Logo" className="w-12 h-12 rounded-xl" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Use<span className="text-primary">Easy</span>
            </h1>
            <p className="text-sm text-muted-foreground">Konto erstellen</p>
          </div>
          <div className="glass-card p-6 space-y-4">
            {signupSent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Fast geschafft — wir haben dir eine Bestätigungs-Mail geschickt.
                  Bitte klicke den Link darin und melde dich danach an.
                  (Nichts angekommen? Spam-Ordner prüfen.)
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setSignupMode(false); setSignupSent(false); setPassword(""); setPassword2(""); }}
                >
                  Zurück zum Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Als <b>Mitarbeiter</b>: nutze genau die E-Mail-Adresse, die dein Chef
                  für dich hinterlegt hat — dann landest du direkt in der Zeiterfassung.
                </p>
                <Input
                  type="email"
                  placeholder="E-Mail-Adresse"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={signupBusy}
                  autoFocus
                />
                <Input
                  type="password"
                  placeholder="Passwort (mind. 8 Zeichen)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={signupBusy}
                />
                <Input
                  type="password"
                  placeholder="Passwort wiederholen"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  required
                  disabled={signupBusy}
                />
                <Button type="submit" disabled={signupBusy} className="w-full h-12 text-base font-medium">
                  {signupBusy ? "Erstelle Konto..." : "Konto erstellen"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setSignupMode(false)}
                  disabled={signupBusy}
                >
                  Zurück zum Login
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Passwort-vergessen-Ansicht (Quick-Win)
  if (forgotMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-3">
            <img src={logo} alt="UseEasy Logo" className="w-12 h-12 rounded-xl" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Use<span className="text-primary">Easy</span>
            </h1>
            <p className="text-sm text-muted-foreground">Passwort zurücksetzen</p>
          </div>
          <div className="glass-card p-6 space-y-4">
            {forgotSent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Wenn ein Konto mit dieser Adresse existiert, ist jetzt ein Link zum
                  Zurücksetzen unterwegs. Bitte prüfe deinen Posteingang (und Spam-Ordner).
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setForgotMode(false);
                    setForgotSent(false);
                    setForgotEmail("");
                  }}
                >
                  Zurück zum Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Gib deine E-Mail-Adresse ein — wir senden dir einen Link zum Zurücksetzen.
                </p>
                <Input
                  type="email"
                  placeholder="E-Mail-Adresse"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  disabled={forgotBusy}
                  autoFocus
                />
                <Button type="submit" disabled={forgotBusy} className="w-full h-12 text-base font-medium">
                  {forgotBusy ? "Sende Link..." : "Link senden"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setForgotMode(false)}
                  disabled={forgotBusy}
                >
                  Zurück zum Login
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Helmet>
        <title>UseEasy — Login zur Console</title>
        <meta name="description" content="Melde dich bei der UseEasy Console an, um deinen KI-E-Mail-Autopiloten zu konfigurieren. Login mit Google, Microsoft oder E-Mail." />
        <link rel="canonical" href="https://app.useeasy.ai/login" />
        <meta property="og:url" content="https://app.useeasy.ai/login" />
        <meta property="og:title" content="UseEasy — Login zur Console" />
        <meta property="og:description" content="Melde dich bei der UseEasy Console an, um deinen KI-E-Mail-Autopiloten zu konfigurieren." />
      </Helmet>
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="UseEasy Logo" className="w-12 h-12 rounded-xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Use<span className="text-primary">Easy</span> — Login
          </h1>
          <p className="text-sm text-muted-foreground">
            Melde dich an, um fortzufahren
          </p>
        </div>

        {/* Rolle: 3 Kacheln (v4.132.0: + Mitarbeiter — Registrierung NUR dort) */}
        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => chooseNonWorker("company")}
            className={"flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors " + (role === "company" && !workerTile ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted/40")}>
            <Building2 className={"w-6 h-6 " + (role === "company" && !workerTile ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium text-foreground">Unternehmen</span>
          </button>
          <button type="button" onClick={chooseWorker}
            className={"flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors " + (workerTile ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted/40")}>
            <HardHat className={"w-6 h-6 " + (workerTile ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium text-foreground">Mitarbeiter</span>
          </button>
          <button type="button" onClick={() => chooseNonWorker("investor")}
            className={"flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors " + (role === "investor" && !workerTile ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted/40")}>
            <Landmark className={"w-6 h-6 " + (role === "investor" && !workerTile ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium text-foreground">Investor</span>
          </button>
        </div>


        {/* Login Card */}
        <div className="glass-card p-6 space-y-4">
          {/* v4.132.0: Unter der Mitarbeiter-Kachel KEINE OAuth-Buttons — die
              fuehren in den Kunden-Funnel (Postfach-Connect -> neuer Tenant,
              E2E-Fund 22.07. abends). Mitarbeiter = E-Mail + Passwort. */}
          {workerTile && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Mitarbeiter melden sich mit <b>E-Mail + Passwort</b> an. Wichtig: genau die
              E-Mail-Adresse nutzen, die dein Chef unter Einstellungen → Team hinterlegt hat.
              Noch kein Konto? Unten „Konto erstellen“.
            </p>
          )}
          {/* OAuth Buttons */}
          {!workerTile && (
          <div className="space-y-3">
            <Button
              onClick={handleGoogleLogin}
              disabled={loading}
              variant="outline"
              className="w-full h-12 text-base font-medium gap-3 border-gray-300 hover:bg-gray-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {loadingBtn === "google" ? "Wird verbunden..." : "Mit Google anmelden"}
            </Button>

            <Button
              onClick={handleMicrosoftLogin}
              disabled={loading}
              variant="outline"
              className="w-full h-12 text-base font-medium gap-3 border-gray-300 hover:bg-gray-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
              {loadingBtn === "azure" ? "Wird verbunden..." : "Mit Microsoft anmelden"}
            </Button>
          </div>
          )}

          {/* Divider */}
          {!workerTile && (
          <div className="relative flex items-center py-1">
            <Separator className="flex-1" />
            <span className="px-3 text-xs text-muted-foreground uppercase">oder</span>
            <Separator className="flex-1" />
          </div>
          )}

          {/* Email/Password */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <Input
              type="email"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-medium">
              {loadingBtn === "email" ? "Wird angemeldet..." : "Anmelden"}
            </Button>
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => setForgotMode(true)}
                disabled={loading}
              >
                Passwort vergessen?
              </button>
              {/* v4.132.0: Selbst-Registrierung NUR unter der Mitarbeiter-Kachel.
                  Unternehmen entstehen über den Kauf (Kauf-E-Mail), Investoren per
                  Einladung — die Kachel ist reine UX, Rechte vergibt der Server. */}
              {workerTile && (
                <>
                  <span className="text-xs text-muted-foreground/40">·</span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    onClick={() => { setSignupMode(true); setSignupSent(false); }}
                    disabled={loading}
                  >
                    Neu hier? Konto erstellen
                  </button>
                </>
              )}
            </div>
            {!workerTile && (
              <p className="text-[11px] leading-relaxed text-muted-foreground/70 text-center pt-1">
                {role === "investor"
                  ? "Investoren-Zugänge werden per Einladung freigeschaltet — melde dich mit der eingeladenen E-Mail-Adresse an."
                  : "Dein Unternehmens-Zugang entsteht automatisch mit dem Kauf — melde dich mit der E-Mail an, mit der gekauft wurde. Mitarbeiter registrieren sich über die Kachel „Mitarbeiter“."}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>

  );
}
