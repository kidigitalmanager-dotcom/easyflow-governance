/**
 * AutoOfferSettingsCard — v4.130.0 Auto-Angebot aus E-Mail (Toggle).
 *
 * Erscheint NUR, wenn Dokumente (Angebote/Rechnungen) fuer den Tenant
 * freigeschaltet sind (documents_enabled). Der Toggle setzt
 * public.tenants.auto_offer_enabled ueber /documents/auto-offer-settings.
 * Was die Automatik tut: eingehende Anfragen ("Anfrage & Auftrag") werden
 * alle 2 Minuten gescannt und automatisch zu einem Angebots-ENTWURF —
 * kein Versand, keine Freigabe, keine Rechnungs-Finalisierung passiert je
 * automatisch. Nach der manuellen Freigabe entsteht zusaetzlich sofort ein
 * Rechnungs-Entwurf unter Rechnungen.
 */
import { useAutoOfferSettings, useSetAutoOfferEnabled } from "@/hooks/use-api";
import { Switch } from "@/components/ui/switch";
import { Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function AutoOfferSettingsCard() {
  const settings = useAutoOfferSettings();
  const setEnabled = useSetAutoOfferEnabled();

  // Karte nur zeigen, wenn das Dokumente-Modul fuer den Tenant an ist.
  if (settings.isLoading || !settings.data?.documents_enabled) return null;
  const s = settings.data;

  async function onToggle(next: boolean) {
    try {
      const res = await setEnabled.mutateAsync(next);
      if (!res.ok) {
        toast.error(res.error === "migration_missing"
          ? "Automatik ist serverseitig noch nicht freigeschaltet."
          : "Einstellung konnte nicht gespeichert werden.");
        return;
      }
      toast.success(next
        ? "Automatik aktiv: Neue Anfragen werden automatisch zu Angebots-Entwürfen."
        : "Automatik ausgeschaltet. Angebote entstehen wieder nur per Knopfdruck.");
    } catch {
      toast.error("Einstellung konnte nicht gespeichert werden.");
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Angebote automatisch aus Anfragen erstellen
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Neue E-Mails, die als „Anfrage &amp; Auftrag" erkannt werden, bekommen automatisch einen
            Angebots-Entwurf (Preise exakt aus Ihrer Preisliste). Sie prüfen und geben frei — nach der
            Freigabe liegt sofort ein Rechnungs-Entwurf unter Rechnungen. Es wird nie automatisch
            etwas versendet oder finalisiert.
          </p>
        </div>
        <Switch
          checked={s.enabled}
          onCheckedChange={onToggle}
          disabled={setEnabled.isPending || !!s.migration_missing}
          aria-label="Angebote automatisch aus Anfragen erstellen"
        />
      </div>
      {s.migration_missing && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Die Automatik ist serverseitig noch nicht freigeschaltet (Migration ausstehend).
        </div>
      )}
      {!s.migration_missing && s.enabled && !s.feature_on && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Gespeichert. Die Automatik startet, sobald sie serverseitig aktiviert ist.
        </div>
      )}
    </div>
  );
}
