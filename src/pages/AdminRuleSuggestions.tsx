import { useMe, useRuleSuggestions, useDecideRuleSuggestion } from "@/hooks/use-api";
import { humanizeCategory } from "@/data/humanize";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert, Lightbulb, Check, X, EyeOff, Loader2, Users } from "lucide-react";
import type { RuleSuggestion } from "@/lib/api-client";

// v4.24.0 (Stufe 3B): Super-Admin-Queue. On-demand aus Nutzer-Korrekturen
// aggregierte Muster. Freigeben/Ablehnen/Verwerfen PROTOKOLLIERT nur (Stufe 3C
// schreibt die echte Pack-Regel — separater Klassifikator-Touch). Scope-Modell:
// tenant -> Pack-Erweiterung -> global; domänenspezifisch NIE global.
const SCOPE_LABEL: Record<string, string> = {
  tenant: "nur dieser Tenant",
  pack: "Pack-Erweiterung (mehrere Tenants gleicher Domain)",
  global: "global (alle Packs)",
};

export default function AdminRuleSuggestions() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading, error } = useRuleSuggestions();
  const decide = useDecideRuleSuggestion();

  if (meLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg flex items-center gap-2 text-destructive">
        <ShieldAlert className="w-5 h-5" />
        <h1 className="text-lg font-semibold">Kein Zugriff</h1>
      </div>
    );
  }

  const suggestions = data?.suggestions ?? [];

  const act = (s: RuleSuggestion, decision: "approve" | "reject" | "dismiss") => {
    const verb = decision === "approve" ? "freigeben" : decision === "reject" ? "ablehnen" : "verwerfen";
    if (decision === "approve" && !window.confirm(
      `Muster freigeben?\n\n„Mails von ${s.sender_domain} → ${humanizeCategory(s.to_core_key)}" (Tenant ${s.tenant_id}, ${s.sample_count}× korrigiert).\n\nProtokolliert die Freigabe. Die echte Pack-Regel wird in Stufe 3C angewendet.`
    )) return;
    decide.mutate({
      pattern_key: s.pattern_key, decision,
      tenant_id: s.tenant_id, to_core_key: s.to_core_key, sender_domain: s.sender_domain,
      tenant_domain: s.tenant_domain, pack_key: s.proposed_pack_key, scope: s.suggested_scope,
      sample_count: s.sample_count, sample_subjects: s.sample_subjects,
    }, {
      onSuccess: () => toast.success(`Muster ${verb === "freigeben" ? "freigegeben" : verb + "t"}.`),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Regel-Vorschläge</h1>
        <p className="text-sm text-muted-foreground">
          Aus Nutzer-Korrekturen aggregierte Muster (ab 3 gleichartigen Korrekturen). Freigeben protokolliert die
          Entscheidung — die feste Pack-Regel wird in Stufe 3C angewendet.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Lädt Vorschläge …</div>}
      {error && <div className="text-sm text-destructive">Fehler beim Laden: {String((error as Error).message)}</div>}

      {!isLoading && !error && suggestions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Lightbulb className="w-6 h-6 text-muted-foreground mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">
            Noch keine Vorschläge. Sobald sich Korrekturen eines Musters häufen (≥3), erscheinen sie hier.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {suggestions.map((s) => (
          <div key={s.pattern_key} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm">
                  Mails von <span className="font-medium text-foreground">{s.sender_domain}</span>
                  {" → "}
                  <span className="font-medium text-primary">{humanizeCategory(s.to_core_key)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tenant <span className="font-mono">{s.tenant_id}</span>
                  {s.tenant_domain ? ` · Domain ${s.tenant_domain}` : ""}
                  {" · "}{s.sample_count}× korrigiert
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Ziel: {s.proposed_pack_key ?? "—"} · {SCOPE_LABEL[s.suggested_scope] ?? s.suggested_scope}
                </span>
                {s.cross_tenant_count >= 2 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 inline-flex items-center gap-1">
                    <Users className="w-3 h-3" /> bei {s.cross_tenant_count} Tenants{s.cross_tenant_same_domain ? " (gleiche Domain)" : " (gemischt)"}
                  </span>
                )}
              </div>
            </div>

            {s.sample_subjects.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {s.sample_subjects.map((subj, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground truncate">· {subj}</li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => act(s, "approve")}>
                {decide.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                Freigeben
              </Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => act(s, "reject")}>
                <X className="w-3.5 h-3.5 mr-1" /> Ablehnen
              </Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => act(s, "dismiss")}>
                <EyeOff className="w-3.5 h-3.5 mr-1" /> Verwerfen
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
