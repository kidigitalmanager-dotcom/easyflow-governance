/**
 * EmailAutopilotTab — Customer Console (Chat C, v4.17.x)
 * Backend: useeasy-api-router /v1/dashboard/autopilot/policy GET+PUT
 * Pattern wie JanaAutopilotTab (Voice-Autopilot), aber für Email-Pipeline.
 */
import { useState, useEffect } from "react";
import { Mail, Power, ShieldCheck, AlertTriangle, Activity } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAutopilotPolicy, useSaveAutopilotPolicy } from "@/hooks/use-api";
import type { AutopilotCoreKey, AutopilotPolicyPutInput, AutopilotMode } from "@/lib/api-client";

const CORE_KEY_LABELS: Record<string, string> = {
  status_fulfillment: "Status & Abwicklung",
  request_order:      "Anfrage & Auftrag",
  returns_refund:     "Rückgabe & Erstattung",
};

const MODE_BADGE: Record<AutopilotMode, "default" | "secondary" | "outline"> = {
  shadow: "outline",
  assisted: "secondary",
  autonomous: "default",
};

export default function EmailAutopilotTab() {
  const { data, isLoading } = useAutopilotPolicy();
  const save = useSaveAutopilotPolicy();
  const [local, setLocal] = useState<AutopilotPolicyPutInput | null>(null);

  useEffect(() => {
    if (data?.policy) {
      setLocal({
        enabled:           data.policy.enabled,
        kill_switch:       data.policy.kill_switch,
        intent_whitelist:  data.policy.intent_whitelist,
        thresholds:        data.policy.thresholds,
        cooldown_minutes:  data.policy.cooldown_minutes,
        daily_cap:         data.policy.daily_cap,
        audit_sample_rate: data.policy.audit_sample_rate,
        footer_enabled:    data.policy.footer_enabled,
        footer_text:       data.policy.footer_text,
        legal_basis_ack:   data.policy.legal_basis_ack,
      });
    } else if (data === null) {
      // 404 → noch nicht init, leeres Default-Formular für ersten Save
      setLocal({
        enabled: false,
        kill_switch: false,
        intent_whitelist: [],
        thresholds: {},
        cooldown_minutes: 10,
        daily_cap: 50,
        audit_sample_rate: 0.2,
        footer_enabled: true,
        footer_text: null,
        legal_basis_ack: false,
      });
    }
  }, [data]);

  if (isLoading) return <div className="p-4 text-muted-foreground">Lade…</div>;

  const policy = data?.policy;
  const maturity = data?.maturity || [];
  const hardCeiling = data?.hard_ceiling || { intents: ["status_fulfillment", "request_order", "returns_refund"], intent_modes: {} };

  const handleSave = () => { if (local) save.mutate(local, {
    onSuccess: () => toast.success("Einstellungen gespeichert"),
    onError: (e: unknown) => toast.error("Speichern fehlgeschlagen: " + (e instanceof Error ? e.message : String(e))),
  }); };

  const setIntentWhitelist = (ck: AutopilotCoreKey, on: boolean) => {
    if (!local) return;
    const set = new Set(local.intent_whitelist || []);
    if (on) set.add(ck); else set.delete(ck);
    setLocal({ ...local, intent_whitelist: Array.from(set) });
  };
  const setThreshold = (ck: AutopilotCoreKey, value: number) => {
    if (!local) return;
    setLocal({ ...local, thresholds: { ...(local.thresholds || {}), [ck]: value } });
  };

  return (
    <div className="space-y-6">
      {policy?.kill_switch && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Kill-Switch aktiviert</AlertTitle>
          <AlertDescription>
            Auto-Send sofort gestoppt. Eingereihte Drafts gehen zurück in die Review-Queue.
            Deaktiviere Kill-Switch unten, um Auto-Send wieder zu erlauben.
          </AlertDescription>
        </Alert>
      )}

      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Email-Autopilot</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Aktiviert die Autopilot-Pipeline: Engine berechnet Eligibility-Verdicts pro Draft, im SHADOW-Mode wird nur geloggt,
          in ASSISTED/AUTONOMOUS wird im Cool-Down-Fenster automatisch gesendet.
        </p>
        <div className="flex items-center justify-between pt-2">
          <Label htmlFor="enabled" className="flex items-center gap-2"><Power className="h-4 w-4" /> Autopilot aktiv</Label>
          <Switch id="enabled" checked={local?.enabled ?? false} onCheckedChange={(v) => setLocal({ ...(local || {}), enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="kill" className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Kill-Switch (Notstop)</Label>
          <Switch id="kill" checked={local?.kill_switch ?? false} onCheckedChange={(v) => setLocal({ ...(local || {}), kill_switch: v })} />
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-semibold">Intent-Whitelist + Confidence-Schwellen</h3>
        <p className="text-sm text-muted-foreground">
          Nur diese Core-Keys sind System-seitig auto-send-fähig (Hard-Ceiling).
          Du wählst pro Intent, ob er für deinen Tenant freigeschaltet ist, und ab welcher LLM-Confidence ein Auto-Send möglich ist.
        </p>
        {hardCeiling.intents.map((ck) => {
          const ckTyped = ck as AutopilotCoreKey;
          const enabled = (local?.intent_whitelist || []).includes(ckTyped);
          const threshold = (local?.thresholds && local.thresholds[ckTyped]) ?? 0.9;
          const mat = maturity.find((m) => m.core_key === ck);
          return (
            <div key={ck} className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">{CORE_KEY_LABELS[ck] || ck}</Label>
                  {mat && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={MODE_BADGE[mat.mode]}>{mat.mode.toUpperCase()}</Badge>
                      <span>{mat.sample_count} samples</span>
                      {mat.shadow_mismatch_rate != null && (
                        <span>· mismatch {(Number(mat.shadow_mismatch_rate) * 100).toFixed(1)}%</span>
                      )}
                      {mat.edit_rate != null && (
                        <span>· edit {(Number(mat.edit_rate) * 100).toFixed(1)}%</span>
                      )}
                      {mat.promotion_ready && <Badge>Promotion bereit</Badge>}
                    </div>
                  )}
                </div>
                <Switch checked={enabled} onCheckedChange={(v) => setIntentWhitelist(ckTyped, v)} />
              </div>
              {enabled && (
                <div>
                  <Label className="text-sm">Confidence-Schwelle: {threshold.toFixed(2)}</Label>
                  <Slider min={0.5} max={0.99} step={0.01} value={[threshold]} onValueChange={([v]) => setThreshold(ckTyped, v)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Sicherheitsnetze</h3>
        <div>
          <Label>Cool-Down (Minuten zwischen Eingang und Auto-Send)</Label>
          <Input type="number" min={0} max={1440} value={local?.cooldown_minutes ?? 10}
            onChange={(e) => setLocal({ ...(local || {}), cooldown_minutes: parseInt(e.target.value, 10) })} />
        </div>
        <div>
          <Label>Daily-Cap (max Auto-Sends pro Tag)</Label>
          <Input type="number" min={0} max={100000} value={local?.daily_cap ?? 50}
            onChange={(e) => setLocal({ ...(local || {}), daily_cap: parseInt(e.target.value, 10) })} />
        </div>
        <div>
          <Label>Stichproben-Audit-Rate: {((local?.audit_sample_rate ?? 0.2) * 100).toFixed(0)}%</Label>
          <Slider min={0} max={1} step={0.05} value={[local?.audit_sample_rate ?? 0.2]}
            onValueChange={([v]) => setLocal({ ...(local || {}), audit_sample_rate: v })} />
          <p className="text-xs text-muted-foreground mt-1">
            Anteil der auto-gesendeten Mails, die zusätzlich im "Nachträglich prüfen"-Tab landen.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h3 className="font-semibold">DSGVO-Footer</h3>
        <p className="text-sm text-muted-foreground">
          Auto-gesendete Mails bekommen einen Transparenz-Hinweis. Leer lassen für System-Default:
          "Diese E-Mail wurde mit Unterstützung von UseEasy AI generiert."
        </p>
        <div className="flex items-center justify-between">
          <Label>Footer anhängen</Label>
          <Switch checked={local?.footer_enabled ?? true} onCheckedChange={(v) => setLocal({ ...(local || {}), footer_enabled: v })} />
        </div>
        <Textarea placeholder="(Leer = System-Default-Text)"
          value={local?.footer_text ?? ""}
          onChange={(e) => setLocal({ ...(local || {}), footer_text: e.target.value || null })}
          disabled={!(local?.footer_enabled ?? true)} rows={3} maxLength={500} />
      </div>

      <div className="glass-card p-6 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> DSGVO-Rechtsgrundlage</h3>
        <p className="text-sm text-muted-foreground">
          Erforderlich für Promotion auf AUTONOMOUS. Du bestätigst, dass deine Tenant-Datenverarbeitung
          eine Rechtsgrundlage hat (Art. 6 DSGVO) und autonom versandte Antworten unter Art. 22 zulässig sind.
          Empfehlung: vor erster AUTONOMOUS-Aktivierung mit Datenschutz-Anwalt klären.
        </p>
        <div className="flex items-center justify-between">
          <Label>Rechtsgrundlage bestätigt</Label>
          <Switch checked={local?.legal_basis_ack ?? false}
            onCheckedChange={(v) => setLocal({ ...(local || {}), legal_basis_ack: v })}
            disabled={policy?.legal_basis_ack === true} />
        </div>
        {policy?.legal_basis_ack && policy.legal_basis_ack_at && (
          <p className="text-xs text-muted-foreground">
            Bestätigt am {new Date(policy.legal_basis_ack_at).toLocaleString("de-DE")} durch {policy.legal_basis_ack_by}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending || !local}>
          {save.isPending ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
