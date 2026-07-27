import { useState, useEffect, useMemo } from "react";
import { useMe, usePlaybookCatalog, useSavePlaybookActive } from "@/hooks/use-api";
import type { PlaybookPack } from "@/lib/api-client";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Lock,
  ShieldCheck,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, EmptyState, Dot } from "@/components/ue/primitives";
import { cn } from "@/lib/utils";

/* Playbooks — Redesign 27.07.2026.
 *
 * Inhaltlich unveraendert: lokaler Draft-State, Plan-Limit, Speichern/Verwerfen.
 * Neu ist nur die Huelle (PageHeader, SectionCard, Chip) und der Fehlerzustand:
 * ein fehlgeschlagener Katalog zeigt QueryErrorNotice mit Neu-laden statt einer
 * eigenen, halb ausgebauten Fehlerkarte.
 */

// Plan-Limits werden vom Backend geliefert (plan_pack_limit). Wir cachen die
// Beschreibung lokal fuer den Header-Hinweis.
const PLAN_DESCRIPTIONS: Record<string, string> = {
  starter: "1 Pack",
  team: "3 Packs",
  scale: "5 Packs",
  pro: "7 Packs",
  enterprise: "unbegrenzt",
};

export default function Playbooks() {
  const { data: me, isLoading: meLoading } = useMe();
  const {
    data: catalog,
    isLoading: catalogLoading,
    isError: catalogError,
    error: catalogErrorObj,
    refetch,
    isFetching: catalogFetching,
  } = usePlaybookCatalog();
  const saveMut = useSavePlaybookActive();

  // Lokaler Draft-State: Set der aktiven Pack-Keys (ohne System-Packs).
  const [draftActive, setDraftActive] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (catalog?.packs) {
      const initial = new Set<string>(
        catalog.packs.filter((p) => p.is_active_for_tenant && !p.is_system).map((p) => p.key),
      );
      setDraftActive(initial);
      setDirty(false);
    }
  }, [catalog?.packs]);

  const plan = catalog?.plan || me?.plan?.name || "starter";
  const planLimit = catalog?.plan_pack_limit ?? 1;
  const planDescription = PLAN_DESCRIPTIONS[plan.toLowerCase()] || `${planLimit} Packs`;
  /* "starter" ist nur ein Rechen-Fallback fuer das Limit — als AUSSAGE ueber den
     Plan des Betriebs taugt es nicht. Plan-Saetze erscheinen deshalb erst, wenn
     Katalog oder /me den Plan wirklich genannt haben. */
  const planKnown = Boolean(catalog?.plan || me?.plan?.name);

  const userPacks = useMemo(
    () => (catalog?.packs || []).filter((p) => !p.is_system),
    [catalog?.packs],
  );
  const systemPacks = useMemo(
    () => (catalog?.packs || []).filter((p) => p.is_system),
    [catalog?.packs],
  );

  const draftCount = draftActive.size;
  const overLimit = draftCount > planLimit;
  const slotsLeft = Math.max(0, planLimit - draftCount);

  const isLoading = meLoading || catalogLoading;

  function togglePack(pack: PlaybookPack) {
    if (pack.is_system) return; // System-Packs nicht toggle-bar
    setDraftActive((prev) => {
      const next = new Set(prev);
      if (next.has(pack.key)) {
        next.delete(pack.key);
      } else {
        if (next.size >= planLimit) {
          toast.warning(
            `Plan-Limit erreicht: ${planLimit} Pack${planLimit !== 1 ? "s" : ""}. Deaktiviere zuerst einen anderen Pack oder upgrade deinen Plan.`,
          );
          return prev;
        }
        next.add(pack.key);
      }
      setDirty(true);
      return next;
    });
  }

  async function onSave() {
    if (overLimit) {
      toast.error(`Du hast ${draftCount} Packs ausgewaehlt, dein ${plan}-Plan erlaubt nur ${planLimit}.`);
      return;
    }
    try {
      const res = await saveMut.mutateAsync({ pack_keys: Array.from(draftActive) });
      toast.success(`Playbooks aktualisiert: ${res.active_pack_keys.length} aktiv`);
      if (res.rejected_unknown.length > 0) {
        toast.warning(`Unbekannte Pack-Keys ignoriert: ${res.rejected_unknown.join(", ")}`);
      }
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  function onReset() {
    if (catalog?.packs) {
      const initial = new Set<string>(
        catalog.packs.filter((p) => p.is_active_for_tenant && !p.is_system).map((p) => p.key),
      );
      setDraftActive(initial);
      setDirty(false);
    }
  }

  const upgradeHint =
    plan.toLowerCase() === "starter" ? "Team (3), Scale (5) oder Pro (7)"
      : plan.toLowerCase() === "team" ? "Scale (5) oder Pro (7)"
        : plan.toLowerCase() === "scale" ? "Pro (7) oder Enterprise"
          : plan.toLowerCase() === "pro" ? "Enterprise"
            : "(bereits maximaler Plan)";

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          kicker="Playbooks"
          title="Regelwerke deiner Einordnung"
          subtitle={
            !isLoading && planKnown
              ? `Wähle die Pack-Sets, die UseEasy zur Klassifikation deiner E-Mails nutzt. Dein ${plan}-Plan erlaubt ${planDescription} gleichzeitig.`
              : "Wähle die Pack-Sets, die UseEasy zur Klassifikation deiner E-Mails nutzt."
          }
          actions={
            isLoading || catalogError ? null : (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium",
                  overLimit
                    ? "border-danger/40 bg-danger/10 text-danger"
                    : draftCount === planLimit
                      ? "border-amber/40 bg-amber-surface text-amber"
                      : "border-emerald-surface bg-emerald-surface/70 text-emerald-light",
                )}
              >
                <span className="tabular">{draftCount}/{planLimit}</span> aktiv
                {slotsLeft > 0 && draftCount < planLimit && (
                  <span className="text-muted-foreground">· {slotsLeft} frei</span>
                )}
              </span>
            )
          }
        />

        {/* System-Pack Info — zaehlt nicht gegen das Limit, deshalb bewusst
            ausserhalb der Auswahl-Karte. */}
        {systemPacks.length > 0 && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-primary/25 bg-emerald-deep/60 p-3 text-sm animate-fade-up">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-muted-foreground">
              <strong className="text-foreground">{systemPacks.map((p) => p.display_name).join(", ")}</strong>{" "}
              ist als System-Pack immer aktiv (Spam-, Bounce- und Compliance-Erkennung).
              Diese Packs zaehlen nicht gegen dein Plan-Limit.
            </div>
          </div>
        )}

        <SectionCard
          title="Verfügbare Packs"
          subtitle={
            isLoading || catalogError
              ? undefined
              : `${userPacks.length} zur Auswahl · ${draftCount} ausgewählt`
          }
        >
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-[var(--radius)]" />
              ))}
            </div>
          ) : catalogError ? (
            /* Fehler != leer: ohne Katalog darf hier NICHT "keine Packs" stehen —
               sonst sieht ein Serverfehler wie ein leerer Betrieb aus. */
            <QueryErrorNotice
              label={`Die Playbooks konnten nicht geladen werden${
                catalogErrorObj instanceof Error && catalogErrorObj.message ? `: ${catalogErrorObj.message}` : ""
              }.`}
              onRetry={() => refetch()}
              retrying={catalogFetching}
            />
          ) : userPacks.length === 0 ? (
            <EmptyState
              title="Keine Packs verfügbar"
              description="Für deinen Betrieb ist derzeit kein wählbares Playbook-Pack hinterlegt."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {userPacks.map((pack) => {
                const checked = draftActive.has(pack.key);
                const cantActivate = !checked && draftCount >= planLimit;
                return (
                  <Tooltip key={pack.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => togglePack(pack)}
                        disabled={cantActivate}
                        aria-pressed={checked}
                        className={cn(
                          "ue-surface flex flex-col gap-2 p-4 text-left transition-colors",
                          checked
                            ? "border-primary/45 bg-emerald-deep/50"
                            : cantActivate
                              ? "cursor-not-allowed opacity-50"
                              : "hover:border-primary/35 hover:bg-surface-hover",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium">{pack.display_name}</div>
                            {pack.domain && (
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                Domain: <code className="text-tx-secondary">{pack.domain}</code>
                              </div>
                            )}
                          </div>
                          {checked ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                          ) : cantActivate ? (
                            <Lock className="h-5 w-5 shrink-0 text-tx-weak" />
                          ) : null}
                        </div>
                        {pack.description && (
                          <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
                            {pack.description}
                          </p>
                        )}
                        {/* Paket 5 (2026-06-11): Ehrliche Bau-Kachel — die Engine wählt Packs
                            DOMAIN-basiert (getPackKeysForDomain); 'bau' kommt erst mit api-router
                            v4.59 + Branchen-Zuordnung dazu. Toggle ist erlaubt (schreibt
                            active_pack_keys, heute ohne Klassifikations-Wirkung). */}
                        {pack.domain === "bau" && (
                          <p className="rounded-md border border-amber/40 bg-amber-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-amber">
                            Branchen-Paket Bau — wird wirksam, sobald dein Workspace der Branche
                            „Bau &amp; Handwerk" zugeordnet ist (Freischaltung läuft). Die 30
                            VOB-Regeln sind vorbereitet.
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-end gap-1.5 pt-2">
                          <Dot tone={checked ? "emerald" : "muted"} />
                          <span className={cn("text-[11.5px]", checked ? "font-medium text-primary" : "text-muted-foreground")}>
                            {checked ? "Aktiv" : "Nicht aktiv"}
                          </span>
                        </div>
                      </button>
                    </TooltipTrigger>
                    {cantActivate && (
                      <TooltipContent>
                        <p className="max-w-xs text-xs">
                          Plan-Limit erreicht ({planLimit} Pack{planLimit !== 1 ? "s" : ""}).
                          Deaktiviere einen anderen Pack oder upgrade.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Save-Bar (sticky) — bleibt am unteren Rand, damit die Auswahl nie
            ungespeichert aus dem Blick geraet. */}
        {!isLoading && !catalogError && (
          <div className="glass-card sticky bottom-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Dot tone={dirty ? "amber" : "emerald"} pulse={dirty} />
              {dirty ? "Nicht gespeicherte Aenderungen." : "Aktueller Stand entspricht dem Server."}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!dirty || saveMut.isPending} onClick={onReset}>
                Verwerfen
              </Button>
              <Button size="sm" onClick={onSave} disabled={!dirty || saveMut.isPending || overLimit}>
                {saveMut.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Speichern ...
                  </>
                ) : (
                  "Auswahl speichern"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Pricing Hint — nur mit bekanntem Plan, sonst empfiehlt die Seite ein
            Upgrade auf einen Plan, den der Betrieb vielleicht laengst hat. */}
        {planKnown && (
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line-soft bg-muted px-3 py-2.5 text-[12px] text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span>Mehr Packs gleichzeitig? Plan upgraden auf {upgradeHint}.</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
