import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { InvestorLayout } from "@/components/layout/InvestorLayout";
import { RiskLayout } from "@/components/layout/RiskLayout";
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
import Einstellungen from "./pages/Einstellungen";
import VoiceCalls from "./pages/VoiceCalls";
import Signale from "./pages/Signale";
import Fruehwarnung from "./pages/Fruehwarnung";
import Chancen from "./pages/Chancen";
import Datenquellen from "./pages/Datenquellen";
import Onboarding from "./pages/Onboarding";
import Investoren from "./pages/Investoren";
import RiskIndex from "./risk/pages/RiskIndex";
import RiskNameDetail from "./risk/pages/RiskNameDetail";
import RiskPlaceholder from "./risk/pages/RiskPlaceholder";
import NotFound from "./pages/NotFound";
import AdminPromotion from "./pages/AdminPromotion";
import Admin from "./pages/Admin";
import AdminRuleSuggestions from "./pages/AdminRuleSuggestions";
import AdminTenantSetup from "./pages/AdminTenantSetup";
import AdminOnboardingFunnel from "./pages/AdminOnboardingFunnel";

const queryClient = new QueryClient();

// "/" lands per role chosen at login (2 Kacheln: Unternehmen / Investor).
function currentRole(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("ue_role") : null;
}

function RoleHome() {
  const role = currentRole();
  if (role === "investor") return <Navigate to="/investoren" replace />;
  if (role === "risk") return <Navigate to="/risk" replace />;
  return <Uebersicht />;
}

// Investors are confined to their own frontend — no operator console/config.
function RoleGate({ children }: { children: React.ReactNode }) {
  const role = currentRole();
  if (role === "investor") return <Navigate to="/investoren" replace />;
  // Underwriting-Mandanten sehen die Operating-Konsole nie.
  if (role === "risk") return <Navigate to="/risk" replace />;
  return <>{children}</>;
}

// Umgekehrtes Gate: die Unternehmer-Rolle bleibt in der Operator-Console.
// Investor und Unternehmen sind getrennte Frontends; die Rolle wird beim Login
// gewaehlt (2 Kacheln), Wechsel nur ueber Abmelden + neue Rollenwahl.
function InvestorGate({ children }: { children: React.ReactNode }) {
  const role = currentRole();
  if (role === "risk") return <Navigate to="/risk" replace />;
  if (role !== "investor") return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Drittes Frontend: Kreditversicherer, Factoring, alternative Kreditgeber.
// Kein Zugang zur Operating-Konsole und keiner zum Investoren-Frontend.
function RiskGate({ children }: { children: React.ReactNode }) {
  const role = currentRole();
  if (role === "investor") return <Navigate to="/investoren" replace />;
  if (role !== "risk") return <Navigate to="/" replace />;
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
              path="/risk/*"
              element={
                <ProtectedRoute>
                  <RiskGate>
                    <RiskLayout>
                      <Routes>
                        <Route path="/" element={<RiskIndex />} />
                        <Route path="/name/:accountId" element={<RiskNameDetail />} />
                        <Route path="/bestand" element={
                          <RiskPlaceholder title="Bestand" day="Ausbaustufe Tag 3 bis 4" bullets={[
                            "Virtualisierte Tabelle, serverseitig sortiert und gefiltert, bis 500.000 Zeilen",
                            "Spalten konfigurierbar - Score, Konfidenz, Abdeckung und Aktualitaet bleiben immer sichtbar",
                            "Zusammengesetzte Filter, speicherbar und im Team teilbar",
                            "Suche ueber Name, Handelsregisternummer, USt-IdNr. und interne Debitorennummer",
                            "Bestandsabgleich per Datei mit offen ausgewiesener Trefferquote",
                            "Heatmap mit frei waehlbaren Achsen",
                          ]} />} />
                        <Route path="/alerts" element={
                          <RiskPlaceholder title="Alerts" day="Ausbaustufe Tag 7 bis 8" bullets={[
                            "Regel-Editor: Bedingung mal Geltungsbereich mal Kanal",
                            "Rueckwirkungs-Vorschau vor dem Scharfschalten: wie viele Treffer die Regel in den letzten 90 Tagen erzeugt haette",
                            "Zustaendigkeit je Regel, Treffer landen im Arbeitsvorrat",
                            "Regel-Historie versioniert",
                          ]} />} />
                        <Route path="/governance" element={
                          <RiskPlaceholder title="Governance" day="Ausbaustufe Tag 6" bullets={[
                            "Modellversion, Changelog und Verfahrensbeschreibung zum Download",
                            "Abdeckung nach Kennzahl und Branche, Verteilung der Datenaktualitaet",
                            "Populationsstabilitaet mit Verlauf",
                            "Trennschaerfe - fehlende Ausfallhistorie wird erklaert, nicht ausgeblendet",
                            "Rechtsform-Split und Audit-Trail-Export",
                          ]} />} />
                        <Route path="/anfragen" element={
                          <RiskPlaceholder title="Betroffenen-Anfragen" day="Ausbaustufe nach Tag 8" bullets={[
                            "Anfrage am Namen mit einem Klick weiterleiten",
                            "Herleitung deterministisch als PDF, reproduzierbar fuer jeden historischen Stand",
                            "Widerspruch strukturiert erfassen, Fristen zaehlen",
                            "Protokollierung revisionsfest",
                          ]} />} />
                        <Route path="/integration" element={
                          <RiskPlaceholder title="Integration" day="Ausbaustufe nach Tag 8" bullets={[
                            "API-Schluessel mit Rotation",
                            "Feed-Status und Latenz",
                            "Kontingent gegen Rate Card mit Warnschwelle",
                            "Webhooks und Zustellprotokoll, Export-Historie",
                          ]} />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </RiskLayout>
                  </RiskGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
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
