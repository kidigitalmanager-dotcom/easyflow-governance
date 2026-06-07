import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MfaGate } from "@/components/MfaGate";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // 2026-06 (Paket A): AAL2-Gate — greift NUR bei Usern mit eingerichtetem MFA-Faktor
  // (deckt Passwort- UND OAuth-Logins). Ohne Faktor: sofortiger Pass-Through, fail-open.
  return <MfaGate>{children}</MfaGate>;
}
