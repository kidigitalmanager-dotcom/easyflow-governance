import { useState, useEffect } from "react";
import { useRecordingConsent, useRecordingConsentUpdate } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ShieldCheck, ShieldOff, Loader2, Save, History, Info, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_LABEL: Record<string, string> = {
  enabled: "Aufzeichnung aktiviert",
  disabled: "Aufzeichnung deaktiviert",
  banner_updated: "Hinweistext geändert",
};

export default function RecordingConsentTab() {
  const { data, isLoading, error } = useRecordingConsent();
  const updateMut = useRecordingConsentUpdate();

  const [bannerDraft, setBannerDraft] = useState<string>("");
  const [bannerDirty, setBannerDirty] = useState(false);

  // Banner-Draft mit Server-State synchronisieren (solange unverändert)
  useEffect(() => {
    if (data && !bannerDirty) {
      setBannerDraft(data.recording_consent_banner_text ?? "");
    }
  }, [data, bannerDirty]);

  const enabled = data?.recording_consent_enabled ?? false;
  const defaultBanner = data?.default_banner_text ?? "";
  const effectiveBanner = (data?.recording_consent_banner_text ?? "").trim() || defaultBanner;

  const toggleConsent = async () => {
    try {
      await updateMut.mutateAsync({ recording_consent_enabled: !enabled });
      toast.success(!enabled ? "Anruf-Aufzeichnung aktiviert" : "Anruf-Aufzeichnung deaktiviert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Umschalten fehlgeschlagen");
    }
  };

  const saveBanner = async () => {
    try {
      await updateMut.mutateAsync({
        recording_consent_banner_text: bannerDraft.trim() ? bannerDraft.trim() : null,
      });
      setBannerDirty(false);
      toast.success("Hinweistext gespeichert");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  const resetBannerToDefault = () => {
    setBannerDraft("");
    setBannerDirty(true);
  };

  return (
    <div className="space-y-6">
      {/* ── Consent-Toggle ── */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${enabled ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"}`}>
            {enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">Anruf-Aufzeichnung (DSGVO)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Steuert, ob ausgehende und eingehende Anrufe deiner Vertriebler aufgezeichnet werden.
              Bei aktivierter Aufzeichnung wird dem Gesprächspartner zu Beginn der unten konfigurierte
              Hinweistext vorgelesen bzw. angezeigt.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">Consent-Konfiguration konnte nicht geladen werden.</p>}

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                Aufzeichnung ist {enabled ? "aktiviert" : "deaktiviert"}
              </p>
              <p className="text-xs text-muted-foreground">
                {enabled
                  ? "Anrufe werden mit Hinweis aufgezeichnet."
                  : "Es werden keine Anrufe aufgezeichnet."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={enabled}
                disabled={updateMut.isPending}
                onCheckedChange={toggleConsent}
                aria-label="Anruf-Aufzeichnung umschalten"
              />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-400/5 border border-amber-400/20 rounded-md px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Hinweis: Die Aufzeichnung von Telefongesprächen ohne Einwilligung ist in Deutschland
            unzulässig. Aktiviere die Aufzeichnung nur, wenn der Hinweistext zu Gesprächsbeginn
            erfolgt und du die Einwilligung dokumentierst.
          </span>
        </div>
      </div>

      {/* ── Banner-Text-Editor ── */}
      <div className="glass-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Aufzeichnungs-Hinweistext</h3>
          <Button variant="ghost" size="sm" onClick={resetBannerToDefault} title="Auf Standardtext zurücksetzen">
            <RotateCcw className="w-3.5 h-3.5" />
            Standardtext
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <textarea
              value={bannerDraft}
              onChange={(e) => { setBannerDraft(e.target.value); setBannerDirty(true); }}
              rows={4}
              placeholder={defaultBanner}
              className="w-full bg-muted/50 border border-border rounded-md px-3 py-2 text-sm resize-y"
            />
            <p className="text-[11px] text-muted-foreground">
              Leer lassen = systemweiter Standardtext wird verwendet. Wirksamer Text aktuell:
              <span className="text-foreground"> „{effectiveBanner}“</span>
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={saveBanner}
                disabled={updateMut.isPending || !bannerDirty}
              >
                {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Hinweistext speichern
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Audit-Trail ── */}
      <div className="glass-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Änderungsverlauf</h3>
        </div>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data?.audit?.length ? (
          <p className="text-xs text-muted-foreground py-2">Noch keine Änderungen protokolliert.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.audit.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {entry.changed_by ?? "unbekannt"} · {formatDateTime(entry.created_at)}
                  </p>
                </div>
                {entry.action === "banner_updated" && (
                  <span className="text-[11px] text-muted-foreground max-w-[50%] truncate">
                    „{entry.new_value?.banner_text ?? "Standardtext"}“
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {data?.updated_at && (
          <p className="text-[11px] text-muted-foreground pt-1">
            Zuletzt geändert: {formatDateTime(data.updated_at)}
            {data.updated_by && ` von ${data.updated_by}`}
          </p>
        )}
      </div>
    </div>
  );
}
