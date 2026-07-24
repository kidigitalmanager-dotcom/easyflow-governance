import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ListChecks, History, BookOpen, Settings, LogOut, PhoneCall, Shield,
  Activity, GraduationCap, Receipt, ReceiptText, FileText, AlertTriangle, Sparkles,
  Database, Clock, Wallet, CreditCard, FileSpreadsheet, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { MailboxHealthBanner } from "@/components/MailboxHealthBanner";
import { OnboardingRunnerProvider } from "@/components/onboarding/OnboardingRunner";
import { CommandPalette } from "@/components/CommandPalette";
import { JanaFab } from "@/components/JanaFab";
import logo from "@/assets/useeasy-logo.jpg";
import { useMe } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Redesign 07.07.2026: Sidebar in 3 Gruppen - ARBEIT (taeglich) · SIGNALE (verstehen) ·
 * SYSTEM (einrichten). Alle bisherigen Bereiche bleiben erhalten, neu dazu:
 * Fruehwarnung, Chancen, Datenquellen. Die Investoren-Sicht ist BEWUSST kein
 * Nav-Punkt: Investor und Unternehmen sind getrennte Frontends, die Rolle wird
 * beim Login gewaehlt (2 Kacheln) - Wechsel nur ueber Abmelden.
 */
type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Arbeit",
    items: [
      { to: "/", label: "Heute", icon: LayoutDashboard },
      { to: "/review", label: "Freigaben", icon: ListChecks },
      { to: "/audit", label: "Verlauf", icon: History },
      { to: "/zeiterfassung", label: "Zeiterfassung", icon: Clock }, // v4.132.0
    ],
  },
  {
    // v4.142.0 (Lane 2) — Buchhaltung buendelt Cash-Dashboard + Ledger + Belege.
    // Bestehende Routen (/forderungen, /rechnungen, /angebote) bleiben unveraendert,
    // nur die Gruppierung/Navigation ist neu.
    label: "Buchhaltung",
    items: [
      { to: "/buchhaltung", label: "Uebersicht", icon: Wallet },
      { to: "/forderungen", label: "Forderungen", icon: Receipt },
      { to: "/verbindlichkeiten", label: "Verbindlichkeiten", icon: CreditCard },
      { to: "/rechnungen", label: "Rechnungen", icon: ReceiptText },
      { to: "/angebote", label: "Angebote", icon: FileText },
      { to: "/zeiterfassung", label: "Abrechnung", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Signale",
    items: [
      { to: "/signale", label: "Gesundheit", icon: Activity },
      { to: "/fruehwarnung", label: "Frühwarnung", icon: AlertTriangle },
      { to: "/chancen", label: "Chancen", icon: Sparkles },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/playbooks", label: "Playbooks", icon: BookOpen },
      { to: "/datenquellen", label: "Datenquellen", icon: Database },
      { to: "/voice", label: "Voice & Co-Pilot", icon: PhoneCall },
      { to: "/einstellungen", label: "Einstellungen", icon: Settings },
      { to: "/onboarding", label: "Onboarding", icon: GraduationCap },
    ],
  },
];

function initials(s: string): string {
  const parts = s.replace(/[@._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (s.slice(0, 2) || "UE").toUpperCase();
}

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

  const navLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 border border-transparent",
      isActive
        ? "bg-primary/10 text-primary border-primary/25"
        : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
    );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <img src={logo} alt="UseEasy Logo" className="w-8 h-8 rounded-lg" />
          <span className="text-[15px] font-bold tracking-tight text-sidebar-foreground">
            Use<span className="text-primary">Easy</span>
          </span>
        </div>

        {/* Tenant-Karte (Anzeige: Firma + Plan + Rolle) */}
        <div className="mx-3 mb-1 flex items-center gap-2.5 bg-card border border-border rounded-xl px-3 py-2">
          <span className="w-6 h-6 rounded-md bg-secondary grid place-items-center text-[10px] font-extrabold text-muted-foreground">
            {initials(String(tenantLabel))}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold truncate">{tenantLabel}</span>
            <span className="block text-[10px] text-muted-foreground/80 truncate">
              {planName} · Betrieb{user?.email ? ` · ${user.email}` : ""}
            </span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pt-3.5 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <NavLink key={item.to} to={item.to} className={navLinkClass(isActive)}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </NavLink>
                  );
                })}
                {/* v4.23.0 (3B-0): Admin nur fuer Super-Admins — Kunden sehen den Eintrag nie */}
                {group.label === "System" && me?.user?.is_super_admin && (
                  <NavLink to="/admin" className={navLinkClass(location.pathname.startsWith("/admin"))}>
                    <Shield className="w-4 h-4" />
                    Admin
                  </NavLink>
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border space-y-2.5">
          {user && (
            <button
              onClick={signOut}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Abmelden
            </button>
          )}
          <p className="text-[10.5px] text-muted-foreground/80 leading-relaxed">
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
            {/* Globaler Onboarding-Runner: EIN Tour-Overlay über alle Routen hinweg. */}
            <OnboardingRunnerProvider>
              {children}
            </OnboardingRunnerProvider>
          </div>
        </main>
      </div>

      {/* Redesign 07.07.2026: globale Begleiter */}
      <CommandPalette />
      <JanaFab />
    </div>
  );
}
