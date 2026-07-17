import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, BellRing } from "lucide-react";
import { useAlerts } from "@/hooks/use-capital";
import { cn } from "@/lib/utils";
import type { CapAlert } from "@/lib/capital";

// ─────────────────────────────────────────────────────────────────────────────
// "Seit deinem letzten Besuch" (Investor Follow-up): neue Warnsignale seit dem
// letzten Aufruf der Investoren-Sicht. Zeitstempel lokal (localStorage), Alerts
// aus dem ohnehin geladenen Feed (first_detected_at) — kein Zusatz-Backend.
// ─────────────────────────────────────────────────────────────────────────────
const KEY = "ue_investor_last_visit";

export function newAlertsSince(alerts: CapAlert[], prevIso: string | null): CapAlert[] {
  if (!prevIso) return [];
  return alerts.filter((a) => a.first_detected_at && a.first_detected_at > prevIso);
}

export function SinceLastVisit({ onSelect }: { onSelect: (accountId: string) => void }) {
  const [prev] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(KEY));
  const alerts = useAlerts({ openOnly: true });

  // Besuch stempeln (einmal pro Mount, NACH dem Lesen des alten Werts).
  useEffect(() => {
    try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* egal */ }
  }, []);

  const fresh = useMemo(() => newAlertsSince(alerts.data ?? [], prev), [alerts.data, prev]);

  if (alerts.isLoading || alerts.isError) return null;

  if (!prev) {
    return (
      <Card className="glass-card">
        <CardContent className="py-3.5 flex items-center gap-2.5 text-xs text-muted-foreground">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          Ab deinem nächsten Besuch zeige ich dir hier, welche Warnsignale seitdem neu dazugekommen sind.
        </CardContent>
      </Card>
    );
  }

  const prevLabel = new Date(prev).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="glass-card">
      <CardContent className="pt-4 pb-3.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">Seit deinem letzten Besuch</p>
          <span className="text-[10.5px] text-muted-foreground">({prevLabel})</span>
          <span className={cn(
            "ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full",
            fresh.length > 0 ? "bg-p1/15 text-p1" : "bg-primary/10 text-primary",
          )}>
            {fresh.length > 0 ? `${fresh.length} neue Warnsignale` : "keine neuen Warnsignale"}
          </span>
        </div>
        {fresh.slice(0, 3).map((a) => (
          <button
            key={a.id}
            onClick={() => onSelect(a.account_id)}
            className="w-full text-left flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:border-primary/40 transition-colors"
          >
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
              a.severity === "critical" ? "bg-p0/15 text-p0" : "bg-p1/15 text-p1",
            )}>
              {a.severity === "critical" ? "kritisch" : "Warnung"}
            </span>
            <span className="text-xs font-semibold shrink-0">{a.account_name ?? a.account_slug ?? "Firma"}</span>
            <span className="text-xs text-muted-foreground truncate">{a.message}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
