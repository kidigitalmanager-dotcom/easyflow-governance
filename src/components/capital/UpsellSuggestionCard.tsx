import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sparkles, ShieldAlert, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase as authClient } from "@/integrations/supabase/client";
import { useDashboardStats } from "@/hooks/use-api";
import { evaluateUpsell, type UpsellComplianceItem } from "@/lib/upsell";

// ---------------------------------------------------------------------------
// M1 Jana-Upsell-Motor - dezente, belegte Vorschlagskarte auf /signale.
//
// Self-contained (eigener Fetch/Typen), damit die einzige Aenderung an geteilten
// Dateien das Einhaengen in Signale.tsx ist. Auth = Console-Session via
// x-console-token, exakt wie ComplianceRadarCard / useMySignals.
//
// KEIN Auto-Kauf: "Ansehen" oeffnet nur den bestehenden in-console-Billing-Weg
// (Einstellungen -> Abrechnung, Deep-Link auf das empfohlene Add-on). Jeder
// Vorschlag traegt seinen konkreten Ist-Beleg und ist einzeln weg-klickbar
// (opt-out, tenant-privat via `upsell`-Edge-Function). Kein Pop-up, kein Spam.
//
// Bewusst EIGENER compliance-Fetch (distinct queryKey) statt des ComplianceRadar-
// Card-Keys: kein Shape-Konflikt im react-query-Cache (robuste Variante), Kosten
// = ein leichter Edge-Call.
// ---------------------------------------------------------------------------

const CAPITAL_ANON = "sb_publishable_FXGJwwQt69sfmWS3cuF37g_hYALbbe2";
const COMPLIANCE_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/compliance-radar";
const UPSELL_URL = "https://vunhcexnwbvxrwecymiy.functions.supabase.co/upsell";

async function consoleToken(): Promise<string> {
  const { data: { session } } = await authClient.auth.getSession();
  return session?.access_token ?? "";
}

type ComplianceLite = { has_tenant: boolean; items: UpsellComplianceItem[] };
async function fetchComplianceLite(): Promise<ComplianceLite> {
  const t = await consoleToken();
  if (!t) return { has_tenant: false, items: [] };
  const res = await fetch(COMPLIANCE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": t },
    body: JSON.stringify({ action: "list" }),
  });
  if (res.status === 401) return { has_tenant: false, items: [] };
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok || !j.ok) return { has_tenant: false, items: [] };
  return { has_tenant: !!j.has_tenant, items: (j.items ?? []) as UpsellComplianceItem[] };
}

type UpsellStatus = { has_tenant: boolean; dismissed: string[] };
async function fetchUpsellStatus(): Promise<UpsellStatus> {
  const t = await consoleToken();
  if (!t) return { has_tenant: false, dismissed: [] };
  const res = await fetch(UPSELL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": t },
    body: JSON.stringify({ action: "status" }),
  });
  if (res.status === 401) return { has_tenant: false, dismissed: [] };
  const j = await res.json().catch(() => ({} as any));
  if (!res.ok || !j.ok) return { has_tenant: false, dismissed: [] };
  return { has_tenant: !!j.has_tenant, dismissed: (j.dismissed ?? []) as string[] };
}

async function postDismiss(key: string): Promise<void> {
  const t = await consoleToken();
  if (!t) return;
  await fetch(UPSELL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: CAPITAL_ANON, "x-console-token": t },
    body: JSON.stringify({ action: "dismiss", suggestion_key: key }),
  });
}

export function UpsellSuggestionCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const stats = useDashboardStats();
  const compliance = useQuery({ queryKey: ["cap", "upsell-compliance"], queryFn: fetchComplianceLite, refetchOnWindowFocus: false });
  const status = useQuery({ queryKey: ["cap", "upsell-status"], queryFn: fetchUpsellStatus, refetchOnWindowFocus: false });

  const dismiss = useMutation({
    mutationFn: postDismiss,
    onMutate: async (key: string) => {
      await qc.cancelQueries({ queryKey: ["cap", "upsell-status"] });
      const prev = qc.getQueryData<UpsellStatus>(["cap", "upsell-status"]);
      qc.setQueryData<UpsellStatus>(["cap", "upsell-status"], (old) => ({
        has_tenant: old?.has_tenant ?? true,
        dismissed: Array.from(new Set([...(old?.dismissed ?? []), key])),
      }));
      return { prev };
    },
    onError: (_e, _key, ctx) => {
      if (ctx?.prev) qc.setQueryData(["cap", "upsell-status"], ctx.prev);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["cap", "upsell-status"] }); },
  });

  const suggestion = useMemo(
    () =>
      evaluateUpsell({
        hasTenant: !!compliance.data?.has_tenant,
        complianceItems: compliance.data?.items ?? [],
        draftsCreatedWeek: stats.data?.drafts_created_week ?? 0,
        dismissed: status.data?.dismissed ?? [],
      }),
    [compliance.data, stats.data, status.data],
  );

  if (!suggestion) return null;

  const urgent = suggestion.tier === "urgent";
  const Icon = urgent ? ShieldAlert : Sparkles;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5",
        urgent ? "border-amber-500/30 bg-amber-500/5" : "border-primary/20 bg-primary/5",
      )}
      role="note"
      aria-label="Vorschlag von Jana"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            urgent ? "bg-amber-500/10" : "bg-primary/10",
          )}
        >
          <Icon className={cn("w-4 h-4", urgent ? "text-amber-500" : "text-primary")} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Vorschlag von Jana</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-background/60 text-muted-foreground border-border">
              {suggestion.addonLabel} · {suggestion.priceLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground mt-1 leading-snug">{suggestion.headline}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{suggestion.body}</p>
          <p className="text-xs text-muted-foreground/80 mt-1">{suggestion.basisNote}</p>

          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => navigate(`/einstellungen?tab=billing&addon=${suggestion.addonLookupKey}`)}
            >
              Ansehen <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:text-foreground gap-1.5"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(suggestion.key)}
            >
              <X className="w-3.5 h-3.5" /> Nicht mehr vorschlagen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
