import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useMe, usePlaybooks } from "@/hooks/use-api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Aussenzahl des vollstaendigen Klassifikations-Regelkatalogs (alle Branchen-Pakete).
const TOTAL_CATALOG_RULES = 193;

function relTime(iso: string | null): string {
  if (!iso) return "nie";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "gerade eben";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.floor(h / 24)} Tagen`;
}

/**
 * Redesign 07.07.2026: EIN konsolidierter System-Status statt drei roher Pillen.
 * Eine Datenquelle fuer alle Anzeigen (useMe: plan + mailbox_health + setup,
 * usePlaybooks: aktive Regeln) - der Klick oeffnet die Details als Popover.
 * Read-only, keine neuen Endpunkte.
 */
export function SystemStatusChip() {
  const navigate = useNavigate();
  const { data: me, isLoading, isError, refetch } = useMe();
  const { data: playbooksData } = usePlaybooks();

  if (isLoading) return <Skeleton className="h-7 w-28 rounded-full" />;
  if (isError) {
    return (
      <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <RefreshCw className="w-3 h-3" /> Status laden
      </button>
    );
  }

  const plan = me?.plan;
  const tenant = me?.tenant;
  const setup = me?.setup;
  const activeRules = playbooksData?.active_rules ?? me?.playbooks?.active_rules_count ?? 0;
  const health = me?.mailbox_health ?? [];

  const mailboxUsed = plan?.active_mailboxes ?? 0;
  const mailboxLimit = plan?.mailbox_limit ?? 0;
  const mailboxWarn = mailboxLimit > 0 && mailboxUsed > mailboxLimit;

  const setupComplete = setup?.complete === true;
  const setupStatus = setup?.status ?? (tenant?.status === "active" ? "ready" : "not_onboarded");
  const isReady = setupComplete || setupStatus === "ready";

  const hasError = health.some((h) => h.status === "error");
  const hasStale = health.some((h) => h.status === "stale");

  let tone: "ok" | "warn" | "bad" = "ok";
  let label = "System läuft";
  if (hasError || mailboxWarn || (!isReady && (setupStatus === "not_onboarded" || setupStatus === "inactive"))) {
    tone = "bad";
    label = hasError ? "Postfach-Fehler" : mailboxWarn ? "Plan überschritten" : "Setup nötig";
  } else if (hasStale || setupStatus === "needs_mailbox" || setupStatus === "needs_pack") {
    tone = "warn";
    label = hasStale ? "Abruf verzögert" : setupStatus === "needs_mailbox" ? "Mailbox verbinden" : "Pack zuweisen";
  }

  const dot = tone === "ok" ? "bg-primary" : tone === "warn" ? "bg-p1" : "bg-p0";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap",
            "border border-border bg-card text-secondary-foreground hover:border-primary/50 transition-colors"
          )}
          aria-label="System-Status"
        >
          <span className={cn("w-[7px] h-[7px] rounded-full", dot)} />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">System-Status</p>
          <p className="text-[11px] text-muted-foreground">Eine Datenquelle für alle Anzeigen</p>
        </div>
        <div className="px-4 py-2 text-xs divide-y divide-border/60">
          {health.length > 0 ? (
            health.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2">
                <span className="text-muted-foreground truncate">{h.email ?? h.provider}</span>
                <span className={cn(
                  "font-semibold whitespace-nowrap",
                  h.status === "ok" ? "text-primary" : h.status === "stale" ? "text-p1" : h.status === "error" ? "text-p0" : "text-muted-foreground"
                )}>
                  {h.status === "ok" ? `läuft · ${relTime(h.last_success_at)}`
                    : h.status === "stale" ? `verzögert · ${relTime(h.last_success_at)}`
                    : h.status === "error" ? "Fehler"
                    : "unbekannt"}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-between gap-2 py-2">
              <span className="text-muted-foreground">Postfach-Abruf</span>
              <span className="font-semibold">{isReady ? "aktiv" : "noch nicht verbunden"}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 py-2">
            <span className="text-muted-foreground">Regeln</span>
            <span className="font-semibold">{activeRules} von {TOTAL_CATALOG_RULES} aktiv (dein Paket)</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <span className="text-muted-foreground">Postfächer im Plan</span>
            <span className={cn("font-semibold", mailboxWarn && "text-p0")}>{mailboxUsed} von {mailboxLimit}</span>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={() => navigate("/datenquellen")}
            className="flex-1 text-xs font-semibold rounded-lg border border-border px-3 py-1.5 hover:border-primary/50 transition-colors"
          >
            Datenquellen
          </button>
          <button
            onClick={() => navigate("/einstellungen")}
            className="flex-1 text-xs font-semibold rounded-lg border border-border px-3 py-1.5 hover:border-primary/50 transition-colors"
          >
            Einstellungen
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
