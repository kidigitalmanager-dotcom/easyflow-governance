/**
 * AdminPromotion — Super-Admin (Leon) sieht alle promotion-pending Tenants × Core-Keys
 * + 1-Klick Promote. Backend macht den 403-Check (SUPER_ADMIN_EMAILS Env).
 *
 * Redesign 27.07.2026: PageHeader + SectionCard statt eigenem Container. Die Seite
 * laeuft im AppLayout, deshalb KEIN max-w/mx-auto/py mehr. Ein Query-Fehler zeigt
 * QueryErrorNotice mit Retry — nur der 403 bleibt eine eigene Aussage, weil
 * "kein Zugriff" etwas anderes ist als "nicht ladbar".
 */
import type { ReactNode } from "react";
import { useAutopilotPromotionPending, usePromoteAutopilot } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, EmptyState, Dot } from "@/components/ue/primitives";
import { ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AutopilotMode } from "@/lib/api-client";

const NEXT_MODE: Record<AutopilotMode, AutopilotMode> = {
  shadow: "assisted",
  assisted: "autonomous",
  autonomous: "autonomous",
};

/* Kleine Status-Marke. Bewusst kein shadcn-Badge: hier sollen genau die
   Konsolen-Tokens greifen (emerald / amber / danger auf dunklem Grund). */
function Tag({ tone = "muted", children }: { tone?: "emerald" | "amber" | "danger" | "muted"; children: ReactNode }) {
  const TONE = {
    emerald: "border-primary/30 bg-emerald-surface text-emerald-light",
    amber: "border-amber/30 bg-amber-surface text-amber",
    danger: "border-danger/30 bg-danger/10 text-danger",
    muted: "border-border bg-secondary text-muted-foreground",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Prozentwert aus einer Server-Rate — fehlt sie, steht "–" statt einer 0. */
function pct(v: number | null | undefined): string {
  return v == null ? "–" : `${(Number(v) * 100).toFixed(1)} %`;
}

export default function AdminPromotion() {
  const pendingQ = useAutopilotPromotionPending();
  const { data, isLoading, error } = pendingQ;
  const promote = usePromoteAutopilot();

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("super_admin_required") || msg.includes("403")) {
      return (
        <div className="max-w-lg space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <ShieldAlert className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Zugriff verweigert</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Dieser Bereich ist nur für Super-Admins. Wenn du Zugriff brauchst, melde dich bei Leon.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader kicker="Admin" title="Autopilot-Promotion" />
        <QueryErrorNotice
          label={`Die Promotion-Liste konnte nicht geladen werden (${msg}).`}
          onRetry={() => pendingQ.refetch()}
          retrying={pendingQ.isFetching}
        />
      </div>
    );
  }

  const pending = data?.pending ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Autopilot-Promotion"
        subtitle="Reifegate-Anfragen prüfen. „Promote“ hebt den Modus auf den nächsten Reifegrad, „Shadow“ setzt ihn zurück auf reines Mitlaufen."
      />

      <SectionCard
        title="Offene Anfragen"
        subtitle={
          isLoading
            ? "wird geladen …"
            : data
              ? `${data.count} ${data.count === 1 ? "Anfrage wartet" : "Anfragen warten"} auf Entscheidung`
              : "–"
        }
        bodyClassName={pending.length > 0 ? "p-0" : undefined}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-[10px]" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-7 w-7" />}
            title="Keine offenen Promotionen."
            description="Sobald ein Tenant die Reifekriterien erfüllt oder eine Freigabe anfragt, erscheint er hier."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {pending.map((p) => (
              <li
                key={`${p.tenant_id}-${p.core_key}`}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground">
                    <span className="font-mono">{p.tenant_id}</span> · {p.core_key}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag>{p.current_mode.toUpperCase()}</Tag>
                    {p.promotion_ready && (
                      <Tag tone="emerald">
                        <Dot className="!h-1.5 !w-1.5" /> Reif
                      </Tag>
                    )}
                    {p.promotion_requested && <Tag tone="amber">Anfrage von {p.promotion_requested_by}</Tag>}
                    {p.legal_basis_ack ? <Tag tone="emerald">DSGVO-Ack</Tag> : <Tag tone="danger">Kein DSGVO-Ack</Tag>}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    <span className="tabular">{p.sample_count}</span> Stichproben · Abweichung{" "}
                    <span className="tabular">{pct(p.shadow_mismatch_rate)}</span> · Korrekturen{" "}
                    <span className="tabular">{pct(p.edit_rate)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={promote.isPending}
                    onClick={() =>
                      promote.mutate(
                        { tenant_id: p.tenant_id, core_key: p.core_key, target_mode: NEXT_MODE[p.current_mode] },
                        {
                          onSuccess: () => toast.success(`${p.tenant_id} · ${p.core_key} → ${NEXT_MODE[p.current_mode]}`),
                          onError: (e: unknown) =>
                            toast.error("Promotion failed: " + (e instanceof Error ? e.message : String(e))),
                        },
                      )
                    }
                  >
                    → {NEXT_MODE[p.current_mode].toUpperCase()}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={promote.isPending}
                    onClick={() =>
                      promote.mutate(
                        { tenant_id: p.tenant_id, core_key: p.core_key, target_mode: "shadow" },
                        {
                          onSuccess: () => toast.success(`${p.tenant_id} · ${p.core_key} → SHADOW`),
                          onError: (e: unknown) =>
                            toast.error("Demotion failed: " + (e instanceof Error ? e.message : String(e))),
                        },
                      )
                    }
                  >
                    → SHADOW
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
