import {
  AlignLeft, Banknote, Activity, Settings, Users,
  LayoutDashboard, ListChecks, History, BookOpen, PhoneCall,
  GraduationCap, Receipt, FileText, AlertTriangle, Sparkles,
  Database, Wallet, CreditCard, FileSpreadsheet, type LucideIcon,
} from "lucide-react";

/**
 * Navigations-Modell der Console (Umbau 27.07.2026, Leons Entwurf).
 *
 * Liegt bewusst NEBEN der Komponente: reine Daten und reine Funktionen sind so
 * testbar, und AppLayout.tsx exportiert nur noch die Komponente (sonst meckert
 * die Fast-Refresh-Regel zu Recht).
 */

export type NavItem = { to: string; label: string; icon: LucideIcon };
export type Area = { key: string; label: string; icon: LucideIcon; items: NavItem[] };

export const AREAS: Area[] = [
  {
    key: "arbeit",
    label: "Arbeit",
    icon: AlignLeft,
    items: [
      { to: "/", label: "Heute", icon: LayoutDashboard },
      { to: "/review", label: "Freigaben", icon: ListChecks },
      { to: "/audit", label: "Verlauf", icon: History },
    ],
  },
  {
    // Umbau 2026-07-27: Rechnungen sind KEIN eigener Punkt mehr, sondern
    // Untertab von Forderungen (/forderungen?tab=rechnungen).
    key: "geld",
    label: "Geld",
    icon: Banknote,
    items: [
      { to: "/buchhaltung", label: "Übersicht", icon: Wallet },
      { to: "/forderungen", label: "Forderungen & Rechnungen", icon: Receipt },
      { to: "/verbindlichkeiten", label: "Verbindlichkeiten", icon: CreditCard },
      { to: "/angebote", label: "Angebote", icon: FileText },
    ],
  },
  {
    key: "mitarbeiter",
    label: "Mitarbeiter",
    icon: Users,
    items: [
      { to: "/mitarbeiter", label: "Team", icon: Users },
      { to: "/zeiterfassung", label: "Abrechnung", icon: FileSpreadsheet },
    ],
  },
  {
    // Gesundheit und Fruehwarnung liegen auf EINER Seite, unterschieden per ?sec=.
    key: "signale",
    label: "Signale",
    icon: Activity,
    items: [
      { to: "/signale?sec=signale", label: "Gesundheit", icon: Activity },
      { to: "/signale?sec=risk_shield", label: "Frühwarnung", icon: AlertTriangle },
      { to: "/chancen", label: "Chancen", icon: Sparkles },
    ],
  },
  {
    key: "system",
    label: "System",
    icon: Settings,
    items: [
      { to: "/playbooks", label: "Playbooks", icon: BookOpen },
      { to: "/datenquellen", label: "Datenquellen", icon: Database },
      { to: "/voice", label: "Voice & Co-Pilot", icon: PhoneCall },
      { to: "/einstellungen", label: "Einstellungen", icon: Settings },
      { to: "/onboarding", label: "Onboarding", icon: GraduationCap },
    ],
  },
];

export const COLLAPSE_KEY = "ue_sidebar_collapsed";

/**
 * Einklapp-Zustand der "Entdecken"-Gruppe (Upsell-Schnitt 05.08.2026).
 *
 * Eigener Schluessel, nicht COLLAPSE_KEY: wer die Seitenleiste offen haben will,
 * aber die Produkthinweise nicht, soll das getrennt entscheiden koennen. Liegt
 * pro Gerät im localStorage, genau wie COLLAPSE_KEY.
 *
 * Die Zuordnung Bereich → Produkt steht bewusst NICHT hier, sondern als `area`
 * am Produkt selbst (src/lib/consoleCatalog.ts). Sonst muesste man ein neues
 * Produkt an zwei Stellen eintragen und eine davon wuerde vergessen.
 */
export const DISCOVER_COLLAPSE_KEY = "ue_sidebar_discover_collapsed";

/**
 * Aktiv-Erkennung. Nav-Ziele duerfen eine Query tragen (z.B.
 * /signale?sec=risk_shield) — dann muss auch die Query passen, sonst waeren
 * "Gesundheit" und "Fruehwarnung" gleichzeitig aktiv.
 */
export function isNavActive(to: string, pathname: string, search: string): boolean {
  const [toPath, toQuery] = to.split("?");
  if (toPath !== pathname) return false;
  if (!toQuery) return true;
  const want = new URLSearchParams(toQuery);
  const have = new URLSearchParams(search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
}

/** Welcher Bereich gehoert zur aktuellen Route? Fallback: Arbeit. */
export function areaForPath(pathname: string): string {
  if (pathname.startsWith("/admin")) return "system";
  for (const a of AREAS) {
    for (const i of a.items) {
      const base = i.to.split("?")[0];
      if (base === "/" ? pathname === "/" : pathname.startsWith(base)) return a.key;
    }
  }
  return "arbeit";
}


