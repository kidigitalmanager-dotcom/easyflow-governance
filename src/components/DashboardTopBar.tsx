import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, ChevronDown, Settings, LogOut, CreditCard, RefreshCw } from "lucide-react";
import { useMe, usePlaybooks } from "@/hooks/use-api";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { createStripePortalSession } from "@/lib/api-client";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

export function DashboardTopBar() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: me, isLoading, isError, refetch } = useMe();
  const { data: playbooksData } = usePlaybooks();
  const [open, setOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const email = user?.email ?? me?.user?.email ?? "";
  const plan = me?.plan;
  const tenant = me?.tenant;
  const setup = me?.setup;
  const activeRules = playbooksData?.active_rules ?? me?.playbooks?.active_rules_count ?? 0;

  const planName = plan?.name ? capitalize(plan.name) : null;
  const mailboxUsed = plan?.active_mailboxes ?? 0;
  const mailboxLimit = plan?.mailbox_limit ?? 0;
  const mailboxPct = mailboxLimit > 0 ? mailboxUsed / mailboxLimit : 0;
  const mailboxWarn = mailboxPct >= 0.8;

  // Setup status logic: prefer setup.complete / setup.status over tenant.status
  const setupComplete = setup?.complete === true;
  const setupStatus = setup?.status ?? (tenant?.status === "active" ? "ready" : "not_onboarded");
  const isActive = setupComplete || setupStatus === "ready";

  const statusConfig: Record<string, { color: string; label: string }> = {
    ready: { color: "bg-green-400", label: "Aktiv" },
    needs_mailbox: { color: "bg-yellow-400", label: "Mailbox verbinden" },
    needs_pack: { color: "bg-yellow-400", label: "Pack zuweisen" },
    not_onboarded: { color: "bg-red-400", label: "Setup nötig" },
    inactive: { color: "bg-gray-400", label: "Inaktiv" },
  };
  const currentStatus = statusConfig[setupStatus] ?? statusConfig.not_onboarded;

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

  return (
    <div className="sticky top-0 z-50 flex items-center h-14 px-4 md:px-6 border-b"
      style={{ backgroundColor: "hsl(217 33% 17%)", borderColor: "hsl(217 24% 27%)" }}>

      {/* Left: Logo + Console badge */}
      <div className="flex items-center gap-2 shrink-0">
        <Zap className="w-4 h-4 text-primary" />
        <span className="text-lg font-bold text-foreground tracking-tight">
          Use<span className="text-primary">Easy</span>
        </span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white leading-none">
          Console
        </span>
      </div>

      {/* Center: Status chips */}
      <div className="flex-1 flex items-center justify-center gap-3 overflow-x-auto scrollbar-hide mx-4">
        {isLoading ? (
          <>
            <Skeleton className="h-6 w-[120px] rounded-full" />
            <Skeleton className="h-6 w-[100px] rounded-full" />
            <Skeleton className="h-6 w-[80px] rounded-full" />
          </>
        ) : isError ? (
          <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        ) : (
          <>
            {/* Plan chip */}
            {planName && (
              <span className={cn(
                "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1 rounded-full whitespace-nowrap",
                mailboxWarn
                  ? "text-red-400"
                  : "text-blue-400"
              )} style={{
                backgroundColor: mailboxWarn ? "hsl(0 40% 18%)" : "hsl(215 40% 22%)"
              }}>
                {planName} · {mailboxUsed}/{mailboxLimit} Mailboxes
                {tenant?.gmail_enabled && <GmailIcon />}
                {tenant?.outlook_enabled && <OutlookIcon />}
              </span>
            )}

            {/* Rules chip */}
            <span className={cn(
              "inline-flex items-center text-[13px] font-medium px-3 py-1 rounded-full whitespace-nowrap",
              activeRules > 0 ? "text-green-400" : "text-yellow-400"
            )} style={{
              backgroundColor: activeRules > 0 ? "hsl(150 40% 14%)" : "hsl(45 40% 16%)"
            }}>
              {activeRules > 0 ? `${activeRules} Rule${activeRules > 1 ? "s" : ""} aktiv` : "Keine Rules aktiv"}
            </span>

            {/* Status chip */}
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
              <span className={cn(
                "w-2 h-2 rounded-full",
                currentStatus.color
              )} />
              {currentStatus.label}
            </span>
          </>
        )}
      </div>

      {/* Right: User + dropdown */}
      {email && (
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="hidden sm:inline text-xs text-muted-foreground">{truncateEmail(email)}</span>
            <span className="w-7 h-7 rounded-full bg-primary/20 text-primary text-[11px] font-bold flex items-center justify-center">
              {getInitials(email)}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-md border bg-popover shadow-lg py-1 z-50">
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
  );
}

/* Tiny inline SVG icons for Gmail / Outlook */
function GmailIcon() {
  return (
    <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="none">
      <path d="M20 4H4l8 6 8-6z" fill="#EA4335" />
      <path d="M20 4v16H4V4l8 6 8-6z" fill="#FBBC04" opacity="0.5" />
      <path d="M4 20V4l8 6-8 10z" fill="#34A853" opacity="0.7" />
      <path d="M20 20V4l-8 6 8 10z" fill="#4285F4" opacity="0.7" />
    </svg>
  );
}

function OutlookIcon() {
  return (
    <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#0078D4" opacity="0.8" />
      <path d="M3 7l9 5 9-5" stroke="#fff" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
