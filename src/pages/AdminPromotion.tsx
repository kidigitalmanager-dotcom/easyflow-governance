/**
 * AdminPromotion — Super-Admin (Leon) sieht alle promotion-pending Tenants × Core-Keys
 * + 1-Klick Promote. Backend macht den 403-Check (SUPER_ADMIN_EMAILS Env).
 */
import { useAutopilotPromotionPending, usePromoteAutopilot } from "@/hooks/use-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { AutopilotMode } from "@/lib/api-client";

const NEXT_MODE: Record<AutopilotMode, AutopilotMode> = {
  shadow: "assisted",
  assisted: "autonomous",
  autonomous: "autonomous",
};

export default function AdminPromotion() {
  const { data, isLoading, error } = useAutopilotPromotionPending();
  const promote = usePromoteAutopilot();

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("super_admin_required") || msg.includes("403")) {
      return (
        <div className="container max-w-2xl mx-auto py-12 px-4">
          <Card className="p-6">
            <h1 className="text-xl font-semibold mb-2">Zugriff verweigert</h1>
            <p className="text-muted-foreground">
              Dieser Bereich ist nur für Super-Admins. Wenn du Zugriff brauchst, melde dich bei Leon.
            </p>
          </Card>
        </div>
      );
    }
    return <div className="p-6 text-destructive">Fehler: {msg}</div>;
  }
  if (isLoading) return <div className="p-6 text-muted-foreground">Lade…</div>;

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autopilot Promotion-Pending</h1>
          <p className="text-sm text-muted-foreground">
            {data?.count || 0} pending. Klick auf "Promote" wechselt den Mode auf den nächsten Reifegrad.
          </p>
        </div>
      </div>

      {(data?.pending || []).length === 0 && (
        <Card className="p-6 text-muted-foreground">
          Keine pending Promotionen. System läuft sauber.
        </Card>
      )}

      {(data?.pending || []).map((p) => (
        <Card key={`${p.tenant_id}-${p.core_key}`} className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-semibold">{p.tenant_id} · {p.core_key}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-1">
              <Badge variant="outline">{p.current_mode.toUpperCase()}</Badge>
              {p.promotion_ready && <Badge>Ready</Badge>}
              {p.promotion_requested && (
                <Badge variant="secondary">Anfrage von {p.promotion_requested_by}</Badge>
              )}
              {p.legal_basis_ack ? (
                <Badge variant="default">DSGVO-Ack</Badge>
              ) : (
                <Badge variant="destructive">Kein DSGVO-Ack</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              samples={p.sample_count}
              {p.shadow_mismatch_rate != null && ` · mismatch=${(Number(p.shadow_mismatch_rate) * 100).toFixed(1)}%`}
              {p.edit_rate != null && ` · edit=${(Number(p.edit_rate) * 100).toFixed(1)}%`}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" disabled={promote.isPending}
              onClick={() => promote.mutate(
                { tenant_id: p.tenant_id, core_key: p.core_key, target_mode: NEXT_MODE[p.current_mode] },
                { onSuccess: () => toast.success(`${p.tenant_id} · ${p.core_key} → ${NEXT_MODE[p.current_mode]}`),
                  onError: (e: unknown) => toast.error("Promotion failed: " + (e instanceof Error ? e.message : String(e))) }
              )}>
              → {NEXT_MODE[p.current_mode].toUpperCase()}
            </Button>
            <Button size="sm" variant="outline" disabled={promote.isPending}
              onClick={() => promote.mutate(
                { tenant_id: p.tenant_id, core_key: p.core_key, target_mode: "shadow" },
                { onSuccess: () => toast.success(`${p.tenant_id} · ${p.core_key} → SHADOW`),
                  onError: (e: unknown) => toast.error("Demotion failed: " + (e instanceof Error ? e.message : String(e))) }
              )}>
              → SHADOW
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
