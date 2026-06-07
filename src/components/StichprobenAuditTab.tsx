/**
 * StichprobenAuditTab — "Nachträglich prüfen": auto-gesendete Mails mit
 * created_by='autopilot:audit_sample'. Backend: /v1/dashboard/autopilot/audit-samples
 */
import { useState } from "react";
import { useAutopilotAuditSamples, useSubmitAutopilotFeedback } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function StichprobenAuditTab() {
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const { data, isLoading } = useAutopilotAuditSamples({ limit, offset });
  const submit = useSubmitAutopilotFeedback();

  const handleApprove = (draftId: string) => {
    submit.mutate({ draft_id: draftId, human_verdict: "approve" }, {
      onSuccess: () => toast.success("Bestätigt — war OK"),
      onError: (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };
  const handleProblem = (draftId: string) => {
    submit.mutate({ draft_id: draftId, human_verdict: "reject" }, {
      onSuccess: () => toast.warning("Als problematisch markiert — fließt in Promotion-Bewertung ein"),
      onError: (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <h2 className="text-base font-semibold mb-2">Nachträglich prüfen — Stichproben-Audit</h2>
        <p className="text-sm text-muted-foreground">
          Auto-gesendete Mails, die zufällig zur Nachprüfung ausgewählt wurden (Audit-Sample-Rate, konfigurierbar in den Einstellungen).
          Markiere problematisch, wenn etwas falsch lief — das fließt in die Promotion-Bewertung ein.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--radius)]" />
          ))}
        </div>
      )}
      {data?.rows.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Inbox className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium">Noch keine Stichproben</p>
          <p className="text-sm text-muted-foreground mt-1">
            Hier landen automatisch versendete Mails zur nachträglichen Kontrolle — sobald der
            Autopilot aktiv sendet und die Stichproben-Rate über 0 liegt.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data?.rows.map((row) => (
          <div key={row.id} className="glass-card p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">Autopilot-Send</Badge>
                {row.core_key && <Badge variant="outline">{row.core_key}</Badge>}
                {row.confidence != null && (
                  <span className="text-xs text-muted-foreground">conf {Number(row.confidence).toFixed(2)}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("de-DE")}</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground break-all">{row.draft_id}</div>
            {row.draft_body_final && (
              <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                {row.draft_body_final}
              </pre>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={() => handleApprove(row.draft_id)} disabled={submit.isPending}>
                <CheckCircle className="h-4 w-4 mr-1" /> War OK
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleProblem(row.draft_id)} disabled={submit.isPending}>
                <AlertCircle className="h-4 w-4 mr-1" /> Problematisch
              </Button>
            </div>
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
