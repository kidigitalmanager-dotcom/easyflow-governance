import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Settings, LogOut, CreditCard, Search } from "lucide-react";
import { useMe } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { SystemStatusChip } from "@/components/SystemStatusChip";
import { createStripePortalSession } from "@/lib/api-client";

function truncateEmail(email: string, max = 20) {
  if (email.length <= max) return email;
  const [local, domain] = email.split("@");
  const keep = Math.max(3, max - domain.length - 4);
  return `${local.slice(0, keep)}...@${domain}`;
}

function getInitials(email: string) {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/* Redesign 07.07.2026: Topbar = Brotkrume + globale Suche (Cmd-K) + EIN konsolidierter
   System-Status (statt drei roher Pillen) + Nutzer-Menue. Alle Aktionen unveraendert:
   Billing-Portal, Einstellungen, Abmelden. */
const CRUMBS: Record<string, [string, string]> = {
  "/": ["Arbeit", "Heute"],
  "/review": ["Arbeit", "Freigaben"],
  "/audit": ["Arbeit", "Verlauf"],
  "/forderungen": ["Arbeit", "Forderungen"],
  "/angebote": ["Arbeit", "Angebote"],
  "/rechnungen": ["Arbeit", "Rechnungen"],
  "/signale": ["Signale", "Gesundheit"],
  "/fruehwarnung": ["Signale", "Frühwarnung"],
  "/chancen": ["Signale", "Chancen"],
  "/playbooks": ["System", "Playbooks"],
  "/datenquellen": ["System", "Datenquellen"],
  "/voice": ["System", "Voice & Co-Pilot"],
  "/einstellungen": ["System", "Einstellungen"],
  "/onboarding": ["System", "Onboarding"],
};

export function DashboardTopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const email = user?.email ?? me?.user?.email ?? "";
  const tenant = me?.tenant;

  const crumb = CRUMBS[location.pathname]
    ?? (location.pathname.startsWith("/admin") ? ["System", "Admin"] as [string, string] : ["UseEasy", "Console"] as [string, string]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const result = await createStripePortalSession();
      if (result.ok && result.url && !result.fallback) {
        window.location.href = result.url;
      } else {
        // Fallback: Stripe Portal not connected yet
        const { toast } = await import("@/hooks/use-toast");
        toast({ title: "Hinweis", description: "Stripe Billing Portal wird noch eingerichtet. Kontaktiere support@useeasy.ai für Änderungen am Abo." });
      }
    } catch {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "Fehler", description: "Fehler beim Laden des Billing Portals", variant: "destructive" });
    } finally {
      setPortalLoading(false);
      setOpen(false);
    }
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 h-14 px-4 md:px-6 border-b border-border bg-background/85 backdrop-blur-md">

      {/* Left: Breadcrumb */}
      <div className="shrink-0 min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground/70">{crumb[0]}</p>
        <p className="text-sm font-bold leading-tight truncate">{crumb[1]}</p>
      </div>

      {/* Center: globale Suche (Cmd-K) */}
      <button
        onClick={() => window.dispatchEvent(new Event("ue:cmdk"))}
        className="flex-1 max-w-md mx-auto hidden sm:flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 transition-colors"
        aria-label="Suche öffnen"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="truncate">Suchen: Seite, Bereich, Einstellung …</span>
        <kbd className="ml-auto text-[10px] bg-secondary border border-border rounded px-1.5 py-0.5">
          {isMac ? "⌘K" : "Strg K"}
        </kbd>
      </button>

      {/* Right: Status + User */}
      <div className="flex items-center gap-2.5 ml-auto shrink-0">
        <SystemStatusChip />

        {email && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-[11px] font-bold flex items-center justify-center">
                {getInitials(email)}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-popover shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold truncate">{truncateEmail(email, 26)}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    Postfach:
                    {tenant?.gmail_enabled && <GmailIcon />}
                    {tenant?.outlook_enabled && <OutlookIcon />}
                    {!tenant?.gmail_enabled && !tenant?.outlook_enabled && " noch nicht verbunden"}
                  </p>
                </div>
                <button
                  onClick={handlePortal}
                  disabled={portalLoading}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  {portalLoading ? "Laden…" : "Abonnement verwalten"}
                </button>
                <button
                  onClick={() => { navigate("/einstellungen"); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Einstellungen
                </button>
                <div className="border-t my-1" />
                <button
                  onClick={() => { signOut(); setOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Abmelden
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Tiny inline SVG icons for Gmail / Outlook */
function GmailIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <path d="M20 4H4l8 6 8-6z" fill="#EA4335" />
      <path d="M20 4v16H4V4l8 6 8-6z" fill="#FBBC04" opacity="0.5" />
      <path d="M4 20V4l8 6-8 10z" fill="#34A853" opacity="0.7" />
      <path d="M20 20V4l-8 6 8 10z" fill="#4285F4" opacity="0.7" />
    </svg>
  );
}

function OutlookIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#0078D4" opacity="0.8" />
      <path d="M3 7l9 5 9-5" stroke="#fff" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
