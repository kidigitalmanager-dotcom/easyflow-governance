import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, History, BookOpen, Settings, LogOut, PhoneCall, Shield, Activity, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { MailboxHealthBanner } from "@/components/MailboxHealthBanner";
import logo from "@/assets/useeasy-logo.jpg";
import { useMe } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/signale", label: "Signale", icon: Activity },
  { to: "/investoren", label: "Investoren", icon: Landmark },
  { to: "/review", label: "Review Queue", icon: ListChecks },
  { to: "/audit", label: "Audit Trail", icon: History },
  { to: "/playbooks", label: "Playbooks", icon: BookOpen },
  { to: "/voice", label: "Voice & Calls", icon: PhoneCall },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: me } = useMe();

  const tenant = me?.tenant;
  const setup = me?.setup;
  const setupComplete = setup?.complete === true;
  const setupStatus = setup?.status ?? (tenant?.status === "active" ? "ready" : "not_onboarded");
  const isSetupReady = setupComplete || setupStatus === "ready";
  const planName = me?.plan?.name ?? (isSetupReady ? "Team" : "–");
  const tenantLabel = isSetupReady
    ? (tenant?.tenant_name ?? tenant?.tenant_id ?? "Setup abgeschlossen")
    : (setupStatus === "needs_mailbox" ? "Mailbox verbinden"
      : setupStatus === "needs_pack" ? "Pack zuweisen"
      : "Setup ausstehend");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
          <img src={logo} alt="UseEasy Logo" className="w-9 h-9 rounded-lg" />
          <div>
            <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
              Use<span className="text-primary">Easy</span>
            </span>
            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              {planName}
            </span>
          </div>
        </div>

        {/* Tenant info */}
        {(
          <div className="px-6 py-3 border-b border-sidebar-border">
            <p className="text-xs text-muted-foreground truncate">{tenantLabel}</p>
            {user?.email && <p className="text-[10px] text-muted-foreground/60 truncate">{user.email}</p>}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className="w-[18px] h-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
          {/* v4.23.0 (3B-0): Admin nur fuer Super-Admins — Kunden sehen den Eintrag nie */}
          {me?.user?.is_super_admin && (
            <NavLink
              to="/admin"
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-150",
                location.pathname.startsWith("/admin")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Shield className="w-[18px] h-[18px]" />
              Admin
            </NavLink>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          {user && (
            <button
              onClick={signOut}
              className="flex items-center gap-2 w-full px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Abmelden
            </button>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            UseEasy erstellt nur Entwürfe.<br />Senden erfolgt immer durch dich.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar />
        {/* v4.55: Postfach-Health-Ampel — sichtbar nur bei stale/error */}
        <MailboxHealthBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
