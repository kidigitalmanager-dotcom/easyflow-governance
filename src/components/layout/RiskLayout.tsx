import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity, Database, FileSearch, LogOut, Scale, ShieldCheck, SlidersHorizontal, Table2,
} from "lucide-react";
import logo from "@/assets/useeasy-logo.jpg";
import { getRiskSession, RISK_ROLE_LABEL, canSeePortfolio } from "@/risk/session";
import { segmentDefaults } from "@/risk/segment-defaults";
import { RISK_DATA_MODE } from "@/risk/api";

/**
 * Eigenes Layout fuer das Risk-Portal. Getrennt von der Operating-Konsole und
 * vom Investoren-Frontend: eigene Navigation, eigene Informationsarchitektur.
 * Diese Nutzer sehen die anderen beiden Oberflaechen nie (Gates in App.tsx).
 *
 * Sechs Bereiche. Jeder zusaetzliche Menuepunkt ist eine Einladung, das
 * Investorenprodukt nachzubauen.
 */
const NAV = [
  { to: "/risk", label: "Veraenderungen", icon: Activity, end: true, needsPortfolio: true },
  { to: "/risk/bestand", label: "Bestand", icon: Table2, needsPortfolio: true },
  { to: "/risk/alerts", label: "Alerts", icon: SlidersHorizontal, needsPortfolio: true },
  { to: "/risk/governance", label: "Governance", icon: Scale, needsPortfolio: false },
  { to: "/risk/anfragen", label: "Betroffenen-Anfragen", icon: FileSearch, needsPortfolio: false },
  { to: "/risk/integration", label: "Integration", icon: Database, needsPortfolio: false },
];

export function RiskLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const session = getRiskSession();
  const seg = segmentDefaults(session.segment);
  const loc = useLocation();
  const items = NAV.filter((n) => !n.needsPortfolio || canSeePortfolio(session.role));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-sidebar-border bg-sidebar">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logo} alt="UseEasy" className="w-8 h-8 rounded-lg shrink-0" />
            <span className="text-base font-semibold text-foreground whitespace-nowrap">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center gap-1 whitespace-nowrap">
              <ShieldCheck className="w-3 h-3" /> Risk-Portal
            </span>
            <span className="hidden lg:inline text-xs text-muted-foreground/70 truncate">
              {seg.label} · {session.tenantName}
            </span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {RISK_DATA_MODE === "fixtures" && (
              <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-md bg-[#E8A33D]/15 text-[#E8A33D] border border-[#E8A33D]/30"
                title="Diese Ansicht liest aus den eingefrorenen Testdaten des API-Contracts, nicht aus der Produktivumgebung.">
                Testdaten
              </span>
            )}
            <span className="hidden md:inline text-xs text-muted-foreground/70">{RISK_ROLE_LABEL[session.role]}</span>
            {user?.email && <span className="text-xs text-muted-foreground/70 hidden xl:inline">{user.email}</span>}
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4" /> Abmelden
            </button>
          </div>
        </div>

        <nav className="max-w-[1600px] mx-auto px-6 flex gap-1 overflow-x-auto" aria-label="Risk-Portal">
          {items.map((n) => {
            const active = n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="w-4 h-4" /> {n.label}
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
