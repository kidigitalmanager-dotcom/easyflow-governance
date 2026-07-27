import { useState, type ReactNode } from "react";
import {
  useMe, useRuleSuggestions, useDecideRuleSuggestion,
  useApprovedRuleSuggestions, useApplyRuleSuggestion, useActivateRuleSuggestion,
} from "@/hooks/use-api";
import { humanizeCategory } from "@/data/humanize";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, EmptyState } from "@/components/ue/primitives";
import { toast } from "sonner";
import { ShieldAlert, Lightbulb, Check, X, EyeOff, Loader2, Users, Zap, FileCheck2 } from "lucide-react";
import type { ApprovedRuleSuggestion, RuleSuggestion } from "@/lib/api-client";

// v4.24.0 (3B) Queue + v4.25.0 (3C) Anwenden/Aktivieren.
// Freigeben (3B) protokolliert nur. Anwenden (3C) schreibt eine DORMANTE Pack-Regel
// (is_active=false). Aktivieren schaltet scharf -> DANACH 3x E2E. Scope-Modell:
// Pack (<domain>_core_v1) oder Global (global_core_v1); domänenspezifisch nie global.
//
// Redesign 27.07.2026: Kopf + Karten aus dem Konsolen-Set. Alle drei
// Bestätigungsabfragen (Freigeben / GLOBAL anwenden / Aktivieren) bleiben
// unverändert — sie sind der eigentliche Schutz vor Fehlgriffen.
const SCOPE_LABEL: Record<string, string> = {
  tenant: "nur dieser Tenant", pack: "Pack (alle Tenants der Domain)", global: "global (alle Packs)",
};

/* Antwort des Apply-Endpoints. api-client liefert dort (noch) ein untypisiertes
   JSON; statt `any` beschreiben wir hier genau die zwei gelesenen Felder. */
type ApplyRuleResult = { rule_key?: string; pack_key?: string };

const SELECT_CLASS =
  "h-8 rounded-[10px] border border-border bg-muted px-2.5 text-xs text-foreground outline-none transition-colors focus:border-primary";

/* Status-Marke im Konsolen-Look (Tokens statt roher Tailwind-Farben). */
function Tag({ tone = "muted", children }: { tone?: "emerald" | "amber" | "primary" | "muted"; children: ReactNode }) {
  const TONE = {
    emerald: "border-primary/30 bg-emerald-surface text-emerald-light",
    amber: "border-amber/30 bg-amber-surface text-amber",
    primary: "border-primary/25 bg-primary/10 text-primary",
    muted: "border-border bg-secondary text-muted-foreground",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export default function AdminRuleSuggestions() {
  const meQ = useMe();
  const me = meQ.data;
  const suggestionsQ = useRuleSuggestions();
  const approvedQ = useApprovedRuleSuggestions();
  const decide = useDecideRuleSuggestion();
  const apply = useApplyRuleSuggestion();
  const activate = useActivateRuleSuggestion();
  const [scopeFor, setScopeFor] = useState<Record<string, "pack" | "global">>({});

  if (meQ.isLoading) return <Skeleton className="h-8 w-56" />;
  // Ein /me-Fehler ist kein "Kein Zugriff" — der Gate bleibt trotzdem zu.
  if (meQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Admin" title="Regel-Vorschläge" />
        <QueryErrorNotice
          label="Deine Berechtigung konnte nicht geprüft werden."
          onRetry={() => meQ.refetch()}
          retrying={meQ.isFetching}
        />
      </div>
    );
  }
  if (!me?.user?.is_super_admin) {
    return (
      <div className="max-w-lg flex items-center gap-2 text-danger">
        <ShieldAlert className="w-5 h-5" />
        <h1 className="text-lg font-semibold">Kein Zugriff</h1>
      </div>
    );
  }

  const suggestions = suggestionsQ.data?.suggestions ?? [];
  const approved = approvedQ.data?.approved ?? [];

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

  const doApply = (a: ApprovedRuleSuggestion) => {
    const scope = scopeFor[a.pattern_key] ?? "pack";
    if (scope === "global" && !window.confirm(
      `GLOBAL anwenden?\n\nDie Regel „@${a.sender_domain} → ${humanizeCategory(a.to_core_key)}" gilt dann für ALLE Packs/Domains. Nur für domänen-agnostische Absender (z.B. @stripe.com) sinnvoll — domänenspezifische Muster bleiben im Domain-Pack.`
    )) return;
    apply.mutate({
      pattern_key: a.pattern_key, to_core_key: a.to_core_key, sender_domain: a.sender_domain,
      tenant_domain: a.tenant_domain, scope,
    }, {
      onSuccess: (r: ApplyRuleResult) => toast.success(`Regel angelegt (inaktiv): ${r.rule_key} in ${r.pack_key}`),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doActivate = (a: ApprovedRuleSuggestion) => {
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
      <PageHeader
        kicker="Admin"
        title="Regel-Vorschläge"
        subtitle="Aus Nutzer-Korrekturen aggregierte Muster (ab 3). Freigeben → Anwenden (dormant) → Aktivieren (danach 3× E2E)."
      />

      {/* OFFENE VORSCHLÄGE (3B) */}
      <SectionCard
        title="Offene Vorschläge"
        subtitle={
          suggestionsQ.isError
            ? undefined
            : suggestionsQ.isLoading
              ? "wird geladen …"
              : `${suggestions.length} ${suggestions.length === 1 ? "Muster wartet" : "Muster warten"} auf eine Entscheidung`
        }
      >
        {suggestionsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[10px]" />)}
          </div>
        ) : suggestionsQ.isError ? (
          <QueryErrorNotice
            label="Die Regel-Vorschläge konnten nicht geladen werden."
            onRetry={() => suggestionsQ.refetch()}
            retrying={suggestionsQ.isFetching}
          />
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="h-7 w-7" />}
            title="Keine offenen Vorschläge."
            description="Sobald Nutzer dasselbe Muster mehrfach korrigieren, taucht es hier zur Prüfung auf."
          />
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.pattern_key} className="ue-surface p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-tx-secondary">
                      Mails von <span className="font-medium text-foreground">{s.sender_domain}</span> →{" "}
                      <span className="font-medium text-primary">{humanizeCategory(s.to_core_key)}</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      Tenant <span className="font-mono">{s.tenant_id}</span>
                      {s.tenant_domain ? ` · ${s.tenant_domain}` : ""} · <span className="tabular">{s.sample_count}</span>× korrigiert
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Tag tone="primary">Ziel: {s.proposed_pack_key ?? "—"} · {SCOPE_LABEL[s.suggested_scope] ?? s.suggested_scope}</Tag>
                    {s.cross_tenant_count >= 2 && (
                      <Tag tone="amber">
                        <Users className="w-3 h-3" /> <span className="tabular">{s.cross_tenant_count}</span> Tenants
                        {s.cross_tenant_same_domain ? " (gleiche Domain)" : " (gemischt)"}
                      </Tag>
                    )}
                  </div>
                </div>
                {s.sample_subjects.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {s.sample_subjects.map((subj, i) => (
                      <li key={i} className="truncate text-[11.5px] text-muted-foreground">· {subj}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decideAct(s, "approve")}>
                    {decide.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}Freigeben
                  </Button>
                  <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decideAct(s, "reject")}>
                    <X className="w-3.5 h-3.5 mr-1" /> Ablehnen
                  </Button>
                  <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decideAct(s, "dismiss")}>
                    <EyeOff className="w-3.5 h-3.5 mr-1" /> Verwerfen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* FREIGEGEBEN (3C): anwenden -> aktivieren.
          Die Karte erscheint auch bei einem Query-Fehler — sonst sähe ein
          Ausfall aus wie „nichts freigegeben". */}
      {(approved.length > 0 || approvedQ.isError) && (
        <SectionCard title="Freigegeben — anwenden & aktivieren" subtitle="dormante Regel schreiben, dann scharf schalten">
          {approvedQ.isError ? (
            <QueryErrorNotice
              label="Die freigegebenen Muster konnten nicht geladen werden."
              onRetry={() => approvedQ.refetch()}
              retrying={approvedQ.isFetching}
            />
          ) : (
            <div className="space-y-3">
              {approved.map((a) => (
                <div key={a.pattern_key} className="ue-surface p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-tx-secondary">
                        @{a.sender_domain} → <span className="font-medium text-primary">{humanizeCategory(a.to_core_key)}</span>
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        Tenant <span className="font-mono">{a.tenant_id}</span>
                        {a.tenant_domain ? ` · ${a.tenant_domain}` : ""}
                        {a.sample_count ? <> · <span className="tabular">{a.sample_count}</span>×</> : null}
                      </p>
                    </div>
                    {a.active ? (
                      <Tag tone="emerald"><Zap className="w-3 h-3" /> aktiv: {a.applied_rule_key}</Tag>
                    ) : a.applied ? (
                      <Tag tone="amber"><FileCheck2 className="w-3 h-3" /> angelegt (inaktiv)</Tag>
                    ) : (
                      <Tag>freigegeben</Tag>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {!a.applied && (
                      <>
                        <select
                          className={SELECT_CLASS}
                          value={scopeFor[a.pattern_key] ?? "pack"}
                          onChange={(e) => setScopeFor((m) => ({ ...m, [a.pattern_key]: e.target.value as "pack" | "global" }))}
                          disabled={apply.isPending}
                        >
                          <option value="pack">Pack: {a.tenant_domain ? `${a.tenant_domain}_core_v1` : "<domain>_core_v1"}</option>
                          <option value="global">Global (alle Packs)</option>
                        </select>
                        <Button size="sm" variant="outline" disabled={apply.isPending} onClick={() => doApply(a)}>
                          {apply.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5 mr-1" />}
                          Als Regel anwenden (inaktiv)
                        </Button>
                      </>
                    )}
                    {a.applied && !a.active && (
                      <Button size="sm" variant="default" disabled={activate.isPending} onClick={() => doActivate(a)}>
                        {activate.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
                        Aktivieren (danach 3× E2E)
                      </Button>
                    )}
                    {a.active && (
                      <span className="text-[11.5px] text-muted-foreground">
                        Aktiv in {a.applied_pack_key}. 3× E2E nicht vergessen.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
