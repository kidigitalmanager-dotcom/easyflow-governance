import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { InvestorLayout } from "@/components/layout/InvestorLayout";
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
import Einstellungen from "./pages/Einstellungen";
import VoiceCalls from "./pages/VoiceCalls";
import Signale from "./pages/Signale";
import Investoren from "./pages/Investoren";
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
                  <InvestorLayout>
                    <Investoren />
                  </InvestorLayout>
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
                      <Route path="/review" element={<ReviewQueue />} />
                      <Route path="/audit" element={<AuditTrail />} />
                      <Route path="/playbooks" element={<Playbooks />} />
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
