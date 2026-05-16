import { useState, useEffect, useMemo } from "react";
import { useMe, usePlaybookCatalog, useSavePlaybookActive } from "@/hooks/use-api";
import type { PlaybookPack } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookOpen,
  CheckCircle2,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

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
  const { data: catalog, isLoading: catalogLoading, error: catalogError, refetch } = usePlaybookCatalog();
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <strong>Playbooks konnten nicht geladen werden.</strong>
        </div>
        <p className="text-muted-foreground mt-2">
          {catalogError instanceof Error ? catalogError.message : "Unbekannter Fehler"}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Playbooks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Waehle die Pack-Sets, die UseEasy zur Klassifikation deiner E-Mails nutzt.
              Dein <strong>{plan}</strong>-Plan erlaubt <strong>{planDescription}</strong> gleichzeitig.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border ${
                overLimit
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : draftCount === planLimit
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              {draftCount}/{planLimit} aktiv
              {slotsLeft > 0 && draftCount < planLimit && (
                <span className="text-muted-foreground">· {slotsLeft} frei</span>
              )}
            </span>
          </div>
        </div>

        {/* System-Pack Info */}
        {systemPacks.length > 0 && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-muted-foreground">
              <strong className="text-foreground">{systemPacks.map((p) => p.display_name).join(", ")}</strong>{" "}
              ist als System-Pack immer aktiv (Spam-, Bounce- und Compliance-Erkennung).
              Diese Packs zaehlen nicht gegen dein Plan-Limit.
            </div>
          </div>
        )}

        {/* User-Pack Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    className={`glass-card p-5 text-left transition-all flex flex-col gap-2 ${
                      checked
                        ? "ring-2 ring-primary/60 border-primary/40"
                        : cantActivate
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-base">{pack.display_name}</div>
                        {pack.domain && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Domain: <code>{pack.domain}</code>
                          </div>
                        )}
                      </div>
                      {checked ? (
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      ) : cantActivate ? (
                        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                      ) : null}
                    </div>
                    {pack.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {pack.description}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2 mt-auto pt-2">
                      {checked ? (
                        <span className="text-xs text-primary font-medium">Aktiv</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nicht aktiv</span>
                      )}
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

        {/* Save-Bar (sticky) */}
        <div className="flex items-center justify-between gap-3 sticky bottom-4">
          <div className="text-xs text-muted-foreground">
            {dirty
              ? "Nicht gespeicherte Aenderungen."
              : "Aktueller Stand entspricht dem Server."}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={!dirty || saveMut.isPending} onClick={onReset}>
              Verwerfen
            </Button>
            <Button onClick={onSave} disabled={!dirty || saveMut.isPending || overLimit}>
              {saveMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichern ...
                </>
              ) : (
                "Auswahl speichern"
              )}
            </Button>
          </div>
        </div>

        {/* Pricing Hint */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <ExternalLink className="w-3.5 h-3.5" />
          <span>
            Mehr Packs gleichzeitig? Plan upgraden auf{" "}
            {plan.toLowerCase() === "starter" && "Team (3), Scale (5) oder Pro (7)"}
            {plan.toLowerCase() === "team" && "Scale (5) oder Pro (7)"}
            {plan.toLowerCase() === "scale" && "Pro (7) oder Enterprise"}
            {plan.toLowerCase() === "pro" && "Enterprise"}
            {plan.toLowerCase() === "enterprise" && "(bereits maximaler Plan)"}
            .
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
