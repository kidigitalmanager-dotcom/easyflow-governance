import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, ChevronLeft, Shield } from "lucide-react";
import { AREAS, COLLAPSE_KEY, areaForPath, isNavActive, type Area } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { MailboxHealthBanner } from "@/components/MailboxHealthBanner";
import { OnboardingRunnerProvider } from "@/components/onboarding/OnboardingRunner";
import { CommandPalette } from "@/components/CommandPalette";
import { JanaFab } from "@/components/JanaFab";
import { BootSequence } from "@/components/BootSequence";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import logo from "@/assets/useeasy-logo.jpg";
import { useMe } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Seitenleiste, zweistufig (Leons Entwurf `UseEasy Console.html`, Umbau 27.07.2026).
 *
 * Vorher lagen ALLE Bereiche untereinander in einer 240px-Spalte. Nachgemessen
 * brauchte das rund 950 px Hoehe; bei einem 1440x800-Fenster stehen etwa 700 px
 * zur Verfuegung. Die Gruppe "System" rutschte damit unter die Kante, ohne dass
 * irgendetwas darauf hinwies. Genau das meinte Leon mit "Seitenleiste wurde
 * nicht mit uebernommen": der Entwurf loest es anders.
 *
 * Jetzt wie im Entwurf:
 *   - schmale Leiste (60 px) mit den Bereichen als Symbole
 *   - Panel (216 px) zeigt NUR die Punkte des aktiven Bereichs
 *   - Panel ist einklappbar, die Auswahl bleibt ueber die Leiste erreichbar
 *
 * Damit sind nie mehr als acht Punkte gleichzeitig sichtbar, das Problem kann
 * strukturell nicht wiederkehren. Es geht KEINE Route verloren: alle bisherigen
 * Ziele sind weiterhin genau einen Klick entfernt.
 *
 * Abweichung vom Entwurf, bewusst: der Entwurf kennt vier Bereiche und stellt
 * "Team" unter System. Leon hat Mitarbeiter am 27.07. absichtlich zu einem
 * eigenen Bereich gemacht; das bleibt hier erhalten (fuenftes Symbol). Falls das
 * doch unter System soll, ist es ein Eintrag weniger in AREAS.
 */

function initials(s: string): string {
  const parts = s.replace(/[@._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (s.slice(0, 2) || "UE").toUpperCase();
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: me } = useMe();

  const routeArea = areaForPath(location.pathname);
  // Der angezeigte Bereich folgt der Route, laesst sich aber auch ohne
  // Navigation umschalten (Leiste anklicken = hineinschauen).
  const [area, setArea] = useState(routeArea);
  useEffect(() => setArea(routeArea), [routeArea]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* egal */ }
      return next;
    });
  }, []);

  const current = AREAS.find((a) => a.key === area) ?? AREAS[0];

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

  // Verbrauch nur zeigen, wenn der Server ein Limit liefert. Kein Balken ins Blaue.
  const emailLimit = me?.plan?.email_limit ?? 0;
  const emailsUsed = me?.plan?.emails_used ?? 0;
  const usagePct = emailLimit > 0 ? Math.min(100, Math.round((emailsUsed / emailLimit) * 100)) : null;

  const navLinkClass = (isActive: boolean) =>
    cn(
      "group relative flex items-center gap-2.5 rounded-[10px] border border-transparent px-3 py-[7px]",
      "text-[13px] font-medium transition-colors duration-150",
      isActive
        ? "border-emerald-surface bg-emerald-surface/60 text-emerald-light"
        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
    );

  /** Bereich in der Leiste anklicken: umschalten und zum ersten Punkt springen. */
  const pickArea = (a: Area) => {
    setArea(a.key);
    if (a.key !== routeArea) navigate(a.items[0].to);
    if (collapsed) toggleCollapsed();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Bereichs-Leiste ─────────────────────────────────────────────── */}
      <nav
        aria-label="Bereiche"
        className="flex w-[60px] flex-shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border bg-sidebar py-3.5"
      >
        <img src={logo} alt="UseEasy" className="mb-3 h-[30px] w-[30px] rounded-[9px] object-cover" />
        {AREAS.map((a) => {
          const on = a.key === area;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => pickArea(a)}
              title={a.label}
              aria-label={a.label}
              aria-current={a.key === routeArea ? "true" : undefined}
              className={cn(
                "flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border transition-colors",
                on
                  ? "border-emerald-surface bg-emerald-deep text-emerald-light"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-sidebar-foreground",
              )}
            >
              <a.icon className="h-[17px] w-[17px]" />
            </button>
          );
        })}

        <div className="mt-auto">
          {user && (
            <button
              type="button"
              onClick={signOut}
              title="Abmelden"
              aria-label="Abmelden"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </nav>

      {/* ── Panel des aktiven Bereichs ──────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar",
          "transition-[width] duration-[260ms] ease-out",
          collapsed ? "w-0 border-r-0" : "w-[216px]",
        )}
      >
        <div className="flex w-[216px] flex-1 flex-col overflow-hidden">
          {/* Betrieb + Tarif */}
          <div className="ue-surface mx-3 mt-3 flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-secondary text-[10px] font-extrabold text-muted-foreground">
              {initials(String(tenantLabel))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{tenantLabel}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {planName} · Betrieb
              </span>
            </span>
          </div>

          {/* Bereichs-Kopf */}
          <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-4">
            <div className="min-w-0">
              <p className="ue-kicker">Bereich</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold">{current.label}</p>
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Seitenleiste einklappen"
              aria-label="Seitenleiste einklappen"
              aria-expanded={!collapsed}
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Punkte des Bereichs. Hoechstens acht Stueck, daher kein verstecktes
              Wegscrollen mehr; overflow-y-auto bleibt nur als Netz. */}
          <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
            {current.items.map((item) => {
              const isActive = isNavActive(item.to, location.pathname, location.search);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={navLinkClass(isActive)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
            {/* v4.23.0 (3B-0): Admin nur fuer Super-Admins — Kunden sehen den Eintrag nie */}
            {current.key === "system" && me?.user?.is_super_admin && (
              <NavLink
                to="/admin"
                className={navLinkClass(location.pathname.startsWith("/admin"))}
                aria-current={location.pathname.startsWith("/admin") ? "page" : undefined}
              >
                <Shield className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Admin</span>
              </NavLink>
            )}
          </div>

          {/* Verbrauch + der Vertrauenssatz. Beides bleibt wortgleich stehen. */}
          <div className="space-y-2.5 border-t border-sidebar-border px-4 py-3">
            {usagePct !== null && (
              <div>
                <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] text-tx-weak">
                  <span>Plan {planName}</span>
                  <span className="tabular">{usagePct}%</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-[600ms] ease-out"
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                  <span className="tabular">{emailsUsed.toLocaleString("de-DE")}</span> von{" "}
                  <span className="tabular">{emailLimit.toLocaleString("de-DE")}</span> E-Mails
                </p>
              </div>
            )}
            <p className="text-[10.5px] leading-relaxed text-tx-faint">
              UseEasy erstellt nur Entwürfe.<br />Senden erfolgt immer durch dich.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Inhalt ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardTopBar />
        {/* v4.55: Postfach-Health-Ampel — sichtbar nur bei stale/error */}
        <MailboxHealthBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            {/* Globaler Onboarding-Runner: EIN Tour-Overlay über alle Routen hinweg. */}
            <OnboardingRunnerProvider>
              {/* Auffangnetz: ein Render-Fehler auf EINER Seite darf nicht die
                  ganze Console weiss machen. Sidebar und Topbar bleiben stehen. */}
              <RouteErrorBoundary resetKey={location.pathname + location.search}>
                {children}
              </RouteErrorBoundary>
            </OnboardingRunnerProvider>
          </div>
        </main>
      </div>

      {/* Redesign 07.07.2026: globale Begleiter */}
      <CommandPalette />
      <JanaFab />

      {/* Redesign 27.07.2026 (§7.2): Ladesequenz nach frischem Login. Liegt
          bewusst UEBER der Console — die Seiten darunter laden waehrenddessen
          schon, damit "Heute" fertig ist, wenn die Sequenz endet. */}
      <BootSequence />
    </div>
  );
}
