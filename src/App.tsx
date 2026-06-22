import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
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
import NotFound from "./pages/NotFound";
import AdminPromotion from "./pages/AdminPromotion";
import Admin from "./pages/Admin";
import AdminRuleSuggestions from "./pages/AdminRuleSuggestions";
import AdminTenantSetup from "./pages/AdminTenantSetup";
import AdminOnboardingFunnel from "./pages/AdminOnboardingFunnel";

const queryClient = new QueryClient();

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
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Uebersicht />} />
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
