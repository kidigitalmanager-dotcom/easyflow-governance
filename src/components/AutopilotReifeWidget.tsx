import { Link } from "react-router-dom";
import { Bot, ChevronRight } from "lucide-react";
import { useAutopilotPolicy } from "@/hooks/use-api";
import { computeGates, maturityStatus, MODE_SHORT_LABELS, MIN_SAMPLES, type MaturityMode } from "@/lib/autopilot-maturity";
import { humanizeCategory } from "@/data/humanize";

// ─────────────────────────────────────────────────────────────────────────────
// Autopilot-Reife auf "Heute" (Redesign Follow-up): macht den Weg zur naechsten
// Stufe sichtbar (x/400 Samples + Gates) — reuse der Maturity-Logik aus den
// Einstellungen. Rendert NICHTS ohne Daten.
// ─────────────────────────────────────────────────────────────────────────────
export function AutopilotReifeWidget() {
  const { data } = useAutopilotPolicy();
  const rows = (data?.maturity ?? [])
    .slice()
    .sort((a, b) => Number(b.promotion_ready) - Number(a.promotion_ready) || b.sample_count - a.sample_count)
    .slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Autopilot-Reife</h2>
        <Bot className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground mb-4">Fortschritt bis zur nächsten Stufe je Intent.</p>
      <div className="space-y-3.5">
        {rows.map((r) => {
          const gates = computeGates(r);
          const passed = gates.filter((g) => g.status === "pass").length;
          const st = maturityStatus(r);
          const pct = Math.min(100, Math.round((r.sample_count / MIN_SAMPLES) * 100));
          return (
            <div key={r.core_key}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold truncate">{humanizeCategory(r.core_key)}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {MODE_SHORT_LABELS[r.mode as MaturityMode] ?? r.mode} · {passed}/{gates.length} Gates
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={"h-full rounded-full " + (r.promotion_ready ? "bg-primary" : "bg-primary/50")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10.5px] text-muted-foreground mt-1">{st.label}</p>
            </div>
          );
        })}
      </div>
      <Link to="/einstellungen?tab=email-autopilot" className="text-xs text-primary hover:underline mt-4 inline-flex items-center gap-1">
        Stufen & Reife öffnen <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
