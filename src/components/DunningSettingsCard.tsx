/**
 * DunningSettingsCard — v4.134.0 Automatische Zahlungserinnerungen (Mahn-Zyklus).
 *
 * Erscheint NUR, wenn Dokumente fuer den Tenant freigeschaltet sind (documents_enabled).
 * Der Zyklus erzeugt bei faelligen Stufen automatisch Zahlungserinnerungs-ENTWUERFE
 * in der Konsole. Die Freigabe bleibt ein Owner-Klick, es wird nie automatisch versendet.
 * Stufen-Schwellen (14 / 30 Tage) sind fix; konfigurierbar sind Karenz, Abstand und Ton.
 * Setzt public.tenants.dunning_scan_enabled + governance.tenant_dunning_settings ueber
 * die /documents/ar-Action (dunning_settings_get / dunning_settings_set).
 */
import { useState, useEffect } from "react";
import { useDunningSettings, useSetDunningSettings } from "@/hooks/use-api";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BellRing, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DunningSettingsCard() {
  const settings = useDunningSettings();
  const save = useSetDunningSettings();
  const s = settings.data;

  const [grace, setGrace] = useState<string>("3");
  const [cooldown, setCooldown] = useState<string>("7");

  useEffect(() => {
    if (s) {
      setGrace(String(s.grace_days ?? 3));
      setCooldown(String(s.cooldown_days ?? 7));
    }
  }, [s?.grace_days, s?.cooldown_days]);

  // Karte nur zeigen, wenn das Dokumente-Modul fuer den Tenant an ist (Muster AutoOfferSettingsCard).
  if (settings.isLoading || !s?.documents_enabled) return null;

  async function patch(
    body: { enabled?: boolean; grace_days?: number; cooldown_days?: number; use_llm_tone?: boolean },
    okMsg: string,
  ) {
    try {
      const res = await save.mutateAsync(body);
      if (!res.ok) {
        toast.error(res.error === "migration_missing"
          ? "Serverseitig noch nicht freigeschaltet (Migration ausstehend)."
          : "Einstellung konnte nicht gespeichert werden.");
        return;
      }
      toast.success(okMsg);
    } catch {
      toast.error("Einstellung konnte nicht gespeichert werden.");
    }
  }

  const graceN = Math.max(0, Math.min(60, parseInt(grace || "0", 10) || 0));
  const cooldownN = Math.max(1, Math.min(90, parseInt(cooldown || "0", 10) || 7));
  const timingDirty = !!s && (graceN !== s.grace_days || cooldownN !== s.cooldown_days);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <BellRing className="w-4 h-4 text-primary" /> Automatische Zahlungserinnerungen
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Faellige Forderungen bekommen automatisch einen Erinnerungs-Entwurf in der Konsole
            (Stufe 1 bis 3 nach Faelligkeit). Sie pruefen und geben frei, danach liegt die
            Erinnerung als Entwurf im Postfach. Es wird nie automatisch versendet. Die Stufen-
            Schwellen (14 / 30 Tage) sind fest; anpassbar sind Karenz, Abstand und Ton.
          </p>
        </div>
        <Switch
          checked={s.enabled}
          onCheckedChange={(next) => patch({ enabled: next }, next
            ? "Zyklus aktiv: Faellige Forderungen bekommen automatisch Erinnerungs-Entwuerfe."
            : "Zyklus aus. Erinnerungen entstehen wieder nur per Knopfdruck.")}
          disabled={save.isPending || !!s.migration_missing}
          aria-label="Automatische Zahlungserinnerungen"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Karenz nach Faelligkeit (Tage)</Label>
          <Input type="number" min={0} max={60} value={grace}
            onChange={(e) => setGrace(e.target.value)} disabled={!!s.migration_missing} />
        </div>
        <div>
          <Label className="text-xs">Abstand zwischen Erinnerungen (Tage)</Label>
          <Input type="number" min={1} max={90} value={cooldown}
            onChange={(e) => setCooldown(e.target.value)} disabled={!!s.migration_missing} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-sm">Erinnerungen im Jana-Ton formulieren</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sonst neutrale Vorlage. Der Betrag wird immer verifiziert uebernommen.
          </p>
        </div>
        <Switch
          checked={s.use_llm_tone}
          onCheckedChange={(next) => patch({ use_llm_tone: next }, "Gespeichert.")}
          disabled={save.isPending || !!s.migration_missing}
          aria-label="Jana-Ton fuer Mahntexte"
        />
      </div>

      {timingDirty && !s.migration_missing && (
        <Button size="sm" onClick={() => patch({ grace_days: graceN, cooldown_days: cooldownN }, "Gespeichert.")} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Speichern
        </Button>
      )}

      {s.migration_missing && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Der Zyklus ist serverseitig noch nicht freigeschaltet (Migration ausstehend).
        </div>
      )}
      {!s.migration_missing && s.enabled && !s.feature_on && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Gespeichert. Der Zyklus startet, sobald er serverseitig aktiviert ist.
        </div>
      )}
    </div>
  );
}
