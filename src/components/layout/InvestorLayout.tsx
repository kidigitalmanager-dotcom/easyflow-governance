import { useAuth } from "@/contexts/AuthContext";
import { LogOut, Landmark, ShieldCheck } from "lucide-react";
import logo from "@/assets/useeasy-logo.jpg";

// Separate investor frontend — NO operator console / configuration access.
export function InvestorLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-sidebar-border bg-sidebar">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="UseEasy" className="w-8 h-8 rounded-lg" />
            <span className="text-base font-semibold text-foreground">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center gap-1">
              <Landmark className="w-3 h-3" /> Investoren
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Verifizierte Signale
            </span>
            {user?.email && <span className="text-xs text-muted-foreground/70 hidden md:inline">{user.email}</span>}
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4" /> Abmelden
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
