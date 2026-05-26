import { useState } from "react";
import {
  useMe, useRuleSuggestions, useDecideRuleSuggestion,
  useApprovedRuleSuggestions, useApplyRuleSuggestion, useActivateRuleSuggestion,
} from "@/hooks/use-api";
import { humanizeCategory } from "@/data/humanize";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldAlert, Lightbulb, Check, X, EyeOff, Loader2, Users, Zap, FileCheck2 } from "lucide-react";
import type { RuleSuggestion } from "@/lib/api-client";

// v4.24.0 (3B) Queue + v4.25.0 (3C) Anwenden/Aktivieren.
// Freigeben (3B) protokolliert nur. Anwenden (3C) schreibt eine DORMANTE Pack-Regel
// (is_active=false). Aktivieren schaltet scharf -> DANACH 3x E2E. Scope-Modell:
// Pack (<domain>_core_v1) oder Global (global_core_v1); domänenspezifisch nie global.
const SCOPE_LABEL: Record<string, string> = {
  tenant: "nur dieser Tenant", pack: "Pack (alle Tenants der Domain)", global: "global (alle Packs)",
};

export default function AdminRuleSuggestions() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading } = useRuleSuggestions();
  const { data: approvedData } = useApprovedRuleSuggestions();
  const decide = useDecideRuleSuggestion();
  const apply = useApplyRuleSuggestion();
  const activate = useActivateRuleSuggestion();
  const [scopeFor, setScopeFor] = useState<Record<string, "pack" | "global">>({});

  if (meLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return <div className="max-w-lg flex items-center gap-2 text-destructive"><ShieldAlert className="w-5 h-5" /><h1 className="text-lg font-semibold">Kein Zugriff</h1></div>;
  }

  const suggestions = data?.suggestions ?? [];
  const approved = approvedData?.approved ?? [];

  const decideAct = (s: RuleSuggestion, decision: "approve" | "reject" | "dismiss") => {
    const verb = decision === "approve" ? "freigeben" : decision === "reject" ? "ablehnen" : "verwerfen";
    if (decision === "approve" && !window.confirm(
      `Muster freigeben?\n\n„Mails von ${s.sender_domain} → ${humanizeCategory(s.to_core_key)}" (Tenant ${s.tenant_id}, ${s.sample_count}×).\n\nProtokolliert die Freigabe. Anwenden+Aktivieren erfolgt im Abschnitt „Freigegeben".`
    )) return;
    decide.mutate({
      pattern_key: s.pattern_key, decision, tenant_id: s.tenant_id, to_core_key: s.to_core_key,
      sender_domain: s.sender_domain, tenant_domain: s.tenant_domain, pack_key: s.proposed_pack_key,
      scope: s.suggested_scope, sample_count: s.sample_count, sample_subjects: s.sample_subjects,
    }, {
      onSuccess: () => toast.success(`Muster ${verb === "freigeben" ? "freigegeben" : verb + "t"}.`),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doApply = (a: typeof approved[number]) => {
    const scope = scopeFor[a.pattern_key] ?? "pack";
    if (scope === "global" && !window.confirm(
      `GLOBAL anwenden?\n\nDie Regel „@${a.sender_domain} → ${humanizeCategory(a.to_core_key)}" gilt dann für ALLE Packs/Domains. Nur für domänen-agnostische Absender (z.B. @stripe.com) sinnvoll — domänenspezifische Muster bleiben im Domain-Pack.`
    )) return;
    apply.mutate({
      pattern_key: a.pattern_key, to_core_key: a.to_core_key, sender_domain: a.sender_domain,
      tenant_domain: a.tenant_domain, scope,
    } as any, {
      onSuccess: (r: any) => toast.success(`Regel angelegt (inaktiv): ${r.rule_key} in ${r.pack_key}`),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doActivate = (a: typeof approved[number]) => {
    if (!window.confirm(
      `Regel „${a.applied_rule_key}" in ${a.applied_pack_key} JETZT scharf schalten?\n\nDanach unbedingt 3× E2E (Gmail/Outlook/HV) laufen lassen — das ist ein Live-Klassifikator-Eingriff.`
    )) return;
    activate.mutate(a.pattern_key, {
      onSuccess: () => toast.success("Regel aktiv. Jetzt 3× E2E laufen lassen."),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Regel-Vorschläge</h1>
        <p className="text-sm text-muted-foreground">
          Aus Nutzer-Korrekturen aggregierte Muster (ab 3). Freigeben → Anwenden (dormant) → Aktivieren (danach 3× E2E).
        </p>
      </div>

      {/* OFFENE VORSCHLÄGE (3B) */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Offene Vorschläge</h2>
        {isLoading && <div className="text-sm text-muted-foreground">Lädt …</div>}
        {!isLoading && suggestions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">
            <Lightbulb className="w-5 h-5 mx-auto mb-1" /> Keine offenen Vorschläge.
          </div>
        )}
        {suggestions.map((s) => (
          <div key={s.pattern_key} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm">Mails von <span className="font-medium">{s.sender_domain}</span> → <span className="font-medium text-primary">{humanizeCategory(s.to_core_key)}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Tenant <span className="font-mono">{s.tenant_id}</span>{s.tenant_domain ? ` · ${s.tenant_domain}` : ""} · {s.sample_count}× korrigiert</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Ziel: {s.proposed_pack_key ?? "—"} · {SCOPE_LABEL[s.suggested_scope] ?? s.suggested_scope}</span>
                {s.cross_tenant_count >= 2 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 inline-flex items-center gap-1"><Users className="w-3 h-3" /> {s.cross_tenant_count} Tenants{s.cross_tenant_same_domain ? " (gleiche Domain)" : " (gemischt)"}</span>}
              </div>
            </div>
            {s.sample_subjects.length > 0 && <ul className="mt-2 space-y-0.5">{s.sample_subjects.map((subj, i) => <li key={i} className="text-[11px] text-muted-foreground truncate">· {subj}</li>)}</ul>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decideAct(s, "approve")}>{decide.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}Freigeben</Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decideAct(s, "reject")}><X className="w-3.5 h-3.5 mr-1" /> Ablehnen</Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decideAct(s, "dismiss")}><EyeOff className="w-3.5 h-3.5 mr-1" /> Verwerfen</Button>
            </div>
          </div>
        ))}
      </section>

      {/* FREIGEGEBEN (3C): anwenden -> aktivieren */}
      {approved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Freigegeben — anwenden & aktivieren</h2>
          {approved.map((a) => (
            <div key={a.pattern_key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm">@{a.sender_domain} → <span className="font-medium text-primary">{humanizeCategory(a.to_core_key)}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tenant <span className="font-mono">{a.tenant_id}</span>{a.tenant_domain ? ` · ${a.tenant_domain}` : ""}{a.sample_count ? ` · ${a.sample_count}×` : ""}</p>
                </div>
                {a.active ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 inline-flex items-center gap-1"><Zap className="w-3 h-3" /> aktiv: {a.applied_rule_key}</span>
                ) : a.applied ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 inline-flex items-center gap-1"><FileCheck2 className="w-3 h-3" /> angelegt (inaktiv)</span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">freigegeben</span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {!a.applied && (
                  <>
                    <select className="text-xs rounded-md border border-border bg-background px-2 py-1.5" value={scopeFor[a.pattern_key] ?? "pack"} onChange={(e) => setScopeFor((m) => ({ ...m, [a.pattern_key]: e.target.value as "pack" | "global" }))} disabled={apply.isPending}>
                      <option value="pack">Pack: {a.tenant_domain ? `${a.tenant_domain}_core_v1` : "<domain>_core_v1"}</option>
                      <option value="global">Global (alle Packs)</option>
                    </select>
                    <Button size="sm" variant="outline" disabled={apply.isPending} onClick={() => doApply(a)}>{apply.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5 mr-1" />}Als Regel anwenden (inaktiv)</Button>
                  </>
                )}
                {a.applied && !a.active && (
                  <Button size="sm" variant="default" disabled={activate.isPending} onClick={() => doActivate(a)}>{activate.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}Aktivieren (danach 3× E2E)</Button>
                )}
                {a.active && <span className="text-xs text-muted-foreground">Aktiv in {a.applied_pack_key}. 3× E2E nicht vergessen.</span>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
