import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Clock } from "lucide-react";
import logo from "@/assets/useeasy-logo.jpg";

// v4.132.0 — Schlankes Mitarbeiter-Frontend (Muster InvestorLayout):
// NUR Zeiterfassung, KEIN Zugriff auf Operator-Console/Konfiguration.
// Mobil-first: kompakter Header, volle Breite fuer Daumen-Bedienung.
export function EmployeeLayout({ children, displayName }: { children: React.ReactNode; displayName?: string | null }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-sidebar-border bg-sidebar sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="UseEasy" className="w-7 h-7 rounded-lg shrink-0" />
            <span className="text-sm font-semibold text-foreground shrink-0">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" /> Zeiterfassung
            </span>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-muted-foreground/70 truncate hidden sm:inline">
              {displayName || user?.email || ""}
            </span>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors shrink-0">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-5">{children}</div>
      </main>
    </div>
  );
}
