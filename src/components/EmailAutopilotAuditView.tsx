/**
 * EmailAutopilotAuditView — Audit-Trail für governance.autopilot_log.
 * Backend: GET /v1/dashboard/autopilot/log
 */
import { useState } from "react";
import { useAutopilotLog } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DECISION_LABELS: Record<string, string> = {
  shadow_would_send:           "Shadow: Würde senden",
  shadow_would_hold:           "Shadow: Würde halten",
  queued_for_send:             "Eingereiht",
  sent:                        "Auto-gesendet",
  held_disabled:               "Disabled",
  killed:                      "Killed (Kill-Switch)",
  held_daily_cap:              "Daily-Cap",
  held_low_conf:               "Zu unsicher",
  held_risk_flag:              "Risk-Flag",
  held_not_whitelisted:        "Nicht whitelisted",
  held_no_maturity:            "Noch nicht reif",
  not_implemented_yet:         "Nicht implementiert",
  send_failed_fallback_human:  "Send-Fehler → Mensch",
};
const DECISION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "default",
  shadow_would_send: "secondary",
  shadow_would_hold: "outline",
  killed: "destructive",
  send_failed_fallback_human: "destructive",
};

export default function EmailAutopilotAuditView() {
  const [decision, setDecision] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const { data, isLoading } = useAutopilotLog({ decision: decision || undefined, limit, offset });

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold">Autopilot Audit-Trail</h2>
        <div className="flex items-center gap-2">
          <Select value={decision || "__all__"} onValueChange={(v) => { setDecision(v === "__all__" ? "" : v); setOffset(0); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Alle Entscheidungen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle</SelectItem>
              {Object.entries(DECISION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && <span className="text-sm text-muted-foreground">{data.pagination.total} Einträge</span>}
        </div>
      </div>

      {isLoading && <div className="p-4 text-muted-foreground">Lade…</div>}
      {data?.rows.length === 0 && (
        <div className="p-4 text-muted-foreground">
          Keine Autopilot-Entscheidungen für diesen Filter. Engine schreibt erst Einträge ab dem ersten eingehenden Mail im SHADOW-Mode.
        </div>
      )}

      <div className="space-y-2">
        {data?.rows.map((row) => (
          <div key={row.id} className="glass-card p-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={DECISION_VARIANT[row.decision] || "outline"}>
                {DECISION_LABELS[row.decision] || row.decision}
              </Badge>
              <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("de-DE")}</span>
              {row.core_key && <span className="text-xs">{row.core_key}</span>}
              {row.confidence != null && <span className="text-xs">conf {Number(row.confidence).toFixed(2)}</span>}
            </div>
            <div className="text-xs mt-1 font-mono text-muted-foreground break-all">{row.draft_id}</div>
            {Array.isArray(row.reasons) && row.reasons.length > 0 && (
              <details className="text-xs mt-1">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Details ({row.reasons.length})
                </summary>
                <pre className="whitespace-pre-wrap bg-muted p-2 mt-1 rounded text-xs">
                  {JSON.stringify(row.reasons, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {data && data.pagination.has_more && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setOffset(offset + limit)}>Mehr laden</Button>
        </div>
      )}
    </div>
  );
}
