import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { InvestorLayout } from "@/components/layout/InvestorLayout";
import { EmployeeLayout } from "@/components/layout/EmployeeLayout";
import { useMe } from "@/hooks/use-api";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Connect from "./pages/Connect";
import Willkommen from "./pages/Willkommen";
import Uebersicht from "./pages/Uebersicht";
import ReviewQueue from "./pages/ReviewQueue";
import AuditTrail from "./pages/AuditTrail";
import Playbooks from "./pages/Playbooks";
import Forderungen from "./pages/Forderungen";
import Angebote from "./pages/Angebote";
import Rechnungen from "./pages/Rechnungen";
import Verbindlichkeiten from "./pages/Verbindlichkeiten";
import Buchhaltung from "./pages/Buchhaltung";
import Einstellungen from "./pages/Einstellungen";
import VoiceCalls from "./pages/VoiceCalls";
import Signale from "./pages/Signale";
import Fruehwarnung from "./pages/Fruehwarnung";
import Chancen from "./pages/Chancen";
import Datenquellen from "./pages/Datenquellen";
import Onboarding from "./pages/Onboarding";
import Investoren from "./pages/Investoren";
import Zeiterfassung from "./pages/Zeiterfassung";
import NotFound from "./pages/NotFound";
import AdminPromotion from "./pages/AdminPromotion";
import Admin from "./pages/Admin";
import AdminRuleSuggestions from "./pages/AdminRuleSuggestions";
import AdminTenantSetup from "./pages/AdminTenantSetup";
import AdminOnboardingFunnel from "./pages/AdminOnboardingFunnel";

const queryClient = new QueryClient();

// "/" lands per role chosen at login (2 Kacheln: Unternehmen / Investor).
function RoleHome() {
  const role = typeof window !== "undefined" ? localStorage.getItem("ue_role") : null;
  if (role === "investor") return <Navigate to="/investoren" replace />;
  return <Uebersicht />;
}

// Investors are confined to their own frontend — no operator console/config.
function RoleGate({ children }: { children: React.ReactNode }) {
  const role = typeof window !== "undefined" ? localStorage.getItem("ue_role") : null;
  if (role === "investor") return <Navigate to="/investoren" replace />;
  return <>{children}</>;
}

// v4.132.0 — Mitarbeiter-Weiche (Zeiterfassung): /v1/dashboard/me liefert für
// tenant_members-Logins role:'employee' → schlankes Mitarbeiter-Frontend
// (EmployeeLayout, Muster InvestorLayout), egal welcher Pfad aufgerufen wurde.
// Admins/Owner bleiben unberührt (role fehlt bzw. != 'employee'). Backend ist
// fail-closed: Mitarbeiter erreichen ohnehin nur die /time-Endpoints.
function EmployeeSwitch({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const data = me.data as { role?: string; display_name?: string; tenant?: unknown; user?: { email?: string } } | undefined;
  if (data?.role === "employee") {
    return (
      <EmployeeLayout displayName={data.display_name}>
        <Zeiterfassung />
      </EmployeeLayout>
    );
  }
  // v4.132.0 (E2E-Fund 22.07. abends): Wer ueber die Mitarbeiter-Kachel kam,
  // aber (noch) keine Rolle hat — kein Team-Eintrag, kein echter Betrieb —,
  // sieht NICHT die leere Unternehmer-Console, sondern einen klaren
  // "Warte auf Freischaltung"-Screen. Echte Inhaber (Betrieb vorhanden)
  // laufen normal in die Console; die Kachel vergibt weiterhin KEINE Rechte.
  const cameViaWorkerTile = typeof window !== "undefined" && localStorage.getItem("ue_login_tile") === "worker";
  if (cameViaWorkerTile && me.isSuccess && !data?.tenant) {
    const email = data?.user?.email || "";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md glass-card p-8 space-y-4 text-center">
          <h1 className="text-xl font-semibold text-foreground">Fast geschafft!</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Dein Konto{email ? <> (<span className="font-mono text-xs">{email}</span>)</> : null} ist
            noch keinem Betrieb zugeordnet. Bitte deinen Chef, dich in der UseEasy-Console unter
            <b> Einstellungen → Team</b> mit genau dieser E-Mail-Adresse anzulegen — danach hier
            einfach neu laden und du landest direkt in der Zeiterfassung.
          </p>
          <div className="space-y-2 pt-2">
            <button onClick={() => window.location.reload()}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              Erneut prüfen
            </button>
            <button onClick={() => { localStorage.setItem("ue_login_tile", "company"); window.location.reload(); }}
              className="w-full h-10 rounded-lg border border-border text-sm text-muted-foreground">
              Ich bin Unternehmer — zur Console
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

// Umgekehrtes Gate: die Unternehmer-Rolle bleibt in der Operator-Console.
// Investor und Unternehmen sind getrennte Frontends; die Rolle wird beim Login
// gewaehlt (2 Kacheln), Wechsel nur ueber Abmelden + neue Rollenwahl.
function InvestorGate({ children }: { children: React.ReactNode }) {
  const role = typeof window !== "undefined" ? localStorage.getItem("ue_role") : null;
  if (role !== "investor") return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/connect" element={<Connect />} />
            <Route path="/willkommen" element={<Willkommen />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/investoren"
              element={
                <ProtectedRoute>
                  <InvestorGate>
                  <InvestorLayout>
                    <Investoren />
                  </InvestorLayout>
                  </InvestorGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <EmployeeSwitch>
                  <RoleGate>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<RoleHome />} />
                      <Route path="/signale" element={<Signale />} />
                      <Route path="/fruehwarnung" element={<Fruehwarnung />} />
                      <Route path="/chancen" element={<Chancen />} />
                      <Route path="/datenquellen" element={<Datenquellen />} />
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route path="/review" element={<ReviewQueue />} />
                      <Route path="/audit" element={<AuditTrail />} />
                      <Route path="/playbooks" element={<Playbooks />} />
                      <Route path="/forderungen" element={<Forderungen />} />
                      <Route path="/angebote" element={<Angebote />} />
                      <Route path="/rechnungen" element={<Rechnungen />} />
                      <Route path="/verbindlichkeiten" element={<Verbindlichkeiten />} />
                      <Route path="/buchhaltung" element={<Buchhaltung />} />
                      <Route path="/zeiterfassung" element={<Zeiterfassung />} />
                      <Route path="/voice" element={<VoiceCalls />} />
                      <Route path="/einstellungen" element={<Einstellungen />} />
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/admin/rule-suggestions" element={<AdminRuleSuggestions />} />
                      <Route path="/admin/autopilot/promotion" element={<AdminPromotion />} />
                      <Route path="/admin/tenant-setup" element={<AdminTenantSetup />} />
                      <Route path="/admin/onboarding" element={<AdminOnboardingFunnel />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                  </RoleGate>
                  </EmployeeSwitch>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
