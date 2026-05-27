import { useState, useEffect } from "react";
import { useMe } from "@/hooks/use-api";
import {
  useAdminTenants, useAdminTenantSetup, useSaveAdminTenantSetup, useCreateAdminTenant,
} from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ShieldAlert, PhoneCall, ShieldCheck, ListChecks, Clock, Check, X,
  Loader2, UserPlus, Zap, CircleCheck, CircleAlert,
} from "lucide-react";
import type { TenantSetup, TenantSetupWriteBody } from "@/lib/api-client";

// v4.32.0 — Super-Admin Tenant-Setup: visuelles Voice-/Assistenz-Setup ohne SQL.
// Tenant wählen → Häkchen/Felder → speichern. 1-Klick "Voice-Call aktivieren".
// Plus "Neuer Kunde anlegen". Gated über is_super_admin (+ Backend-403).

const WEEKDAYS = [
  { n: 1, label: "Mo" }, { n: 2, label: "Di" }, { n: 3, label: "Mi" },
  { n: 4, label: "Do" }, { n: 5, label: "Fr" }, { n: 6, label: "Sa" }, { n: 7, label: "So" },
];

type FormState = {
  jana_enabled: boolean;
  vapi_assistant_id: string;
  caller_id: string;            // twilio_phone_number ODER vapi_phone_number_id
  domain: string;
  recording_consent_enabled: boolean;
  recording_consent_banner_text: string;
  assistant_enabled: boolean;
  allowed_actions: string[];
  timeout_preset: string;
  active_hours_start: string;
  active_hours_end: string;
  active_days: number[];
  timezone: string;
  daily_cap: number;
};

function initForm(s: TenantSetup): FormState {
  return {
    jana_enabled: s.voice.jana_enabled,
    vapi_assistant_id: s.voice.vapi_assistant_id ?? "",
    caller_id: s.voice.caller_id ?? "",
    domain: s.voice.domain ?? "",
    recording_consent_enabled: s.consent.recording_consent_enabled,
    recording_consent_banner_text: s.consent.recording_consent_banner_text ?? "",
    assistant_enabled: s.assistant.enabled,
    allowed_actions: s.assistant.allowed_actions ?? [],
    timeout_preset: s.assistant.timeout_preset ?? "patient",
    active_hours_start: s.voice_policy.active_hours_start ?? "09:00",
    active_hours_end: s.voice_policy.active_hours_end ?? "18:00",
    active_days: s.voice_policy.active_days ?? [1, 2, 3, 4, 5],
    timezone: s.voice_policy.timezone ?? "Europe/Berlin",
    daily_cap: s.voice_policy.daily_cap ?? 10,
  };
}

// Caller-ID, die nur eine Telefonnummer (E.164) ist, geht ins twilio_phone_number-
// Feld; alles andere wird als vapi_phone_number_id interpretiert.
function buildVoiceWrite(f: FormState) {
  const isE164 = /^\+[1-9]\d{6,14}$/.test(f.caller_id.trim());
  return {
    jana_enabled: f.jana_enabled,
    vapi_assistant_id: f.vapi_assistant_id.trim() || null,
    twilio_phone_number: isE164 ? f.caller_id.trim() : null,
    vapi_phone_number_id: !isE164 && f.caller_id.trim() ? f.caller_id.trim() : null,
    domain: f.domain.trim() || undefined,
  };
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button type="button" onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground leading-snug">{hint}</span>}
      </span>
    </label>
  );
}

export default function AdminTenantSetup() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: list, isLoading: listLoading } = useAdminTenants();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: setup, isLoading: setupLoading } = useAdminTenantSetup(selected);
  const save = useSaveAdminTenantSetup();
  const create = useCreateAdminTenant();

  const [form, setForm] = useState<FormState | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newT, setNewT] = useState({ tenant_id: "", tenant_name: "", pack_key: "ecom_core", provider: "gmail", plan: "", admin_email: "" });

  useEffect(() => { if (setup?.ok) setForm(initForm(setup)); }, [setup]);

  if (meLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return <div className="max-w-lg flex items-center gap-2 text-destructive"><ShieldAlert className="w-5 h-5" /><h1 className="text-lg font-semibold">Kein Zugriff</h1></div>;
  }

  const kv = setup?.known_values ?? list?.known_values;
  const upd = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const doSave = (extra?: Partial<TenantSetupWriteBody>) => {
    if (!selected || !form) return;
    const body: TenantSetupWriteBody = {
      voice: buildVoiceWrite(form),
      consent: { recording_consent_enabled: form.recording_consent_enabled, recording_consent_banner_text: form.recording_consent_banner_text || null },
      assistant: { enabled: form.assistant_enabled, allowed_actions: form.allowed_actions, timeout_preset: form.timeout_preset },
      voice_policy: {
        active_hours_start: form.active_hours_start, active_hours_end: form.active_hours_end,
        active_days: form.active_days, timezone: form.timezone, daily_cap: form.daily_cap,
      },
      ...extra,
    };
    save.mutate({ tenantId: selected, body }, {
      onSuccess: () => toast.success("Setup gespeichert."),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doPreset = () => {
    if (!selected) return;
    if (!window.confirm(
      "Voice-Call für diesen Kunden aktivieren?\n\nSetzt: Telefonie an, DSGVO-Aufzeichnungs-Einwilligung an, Aktion Telefon-Anruf frei, Anrufzeiten 09–18 Uhr Mo–Fr. Nur aktivieren, wenn der Kunde DSGVO-konform aufzeichnet."
    )) return;
    save.mutate({ tenantId: selected, body: { apply_voice_preset: true } }, {
      onSuccess: () => toast.success("Voice-Call aktiviert (Preset angewendet)."),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doCreate = () => {
    if (!newT.tenant_id.trim()) { toast.error("Tenant-ID erforderlich."); return; }
    create.mutate(newT, {
      onSuccess: (r) => { toast.success(`Kunde „${r.tenant_id}" angelegt.`); setShowNew(false); setSelected(r.tenant_id); setNewT({ tenant_id: "", tenant_name: "", pack_key: "ecom_core", provider: "gmail", plan: "", admin_email: "" }); },
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const toggleAction = (a: string) => upd({ allowed_actions: form!.allowed_actions.includes(a) ? form!.allowed_actions.filter((x) => x !== a) : [...form!.allowed_actions, a] });
  const toggleDay = (n: number) => upd({ active_days: form!.active_days.includes(n) ? form!.active_days.filter((x) => x !== n) : [...form!.active_days, n].sort() });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tenant-Setup (Voice &amp; Assistenz)</h1>
          <p className="text-sm text-muted-foreground">Kunden visuell einrichten — ohne SQL. Telefonie, DSGVO-Einwilligung, Assistenz-Aktionen und Anrufzeiten.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)} className="gap-1.5 flex-shrink-0">
          <UserPlus className="w-4 h-4" /> Neuer Kunde
        </Button>
      </div>

      {showNew && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="font-medium text-sm flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" /> Neuen Kunden anlegen</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Tenant-ID (Kürzel, klein)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.tenant_id} onChange={(e) => setNewT({ ...newT, tenant_id: e.target.value })} placeholder="z. B. mueller_immobilien" />
            </label>
            <label className="text-xs text-muted-foreground">Firmenname
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.tenant_name} onChange={(e) => setNewT({ ...newT, tenant_name: e.target.value })} placeholder="Müller Immobilien GmbH" />
            </label>
            <label className="text-xs text-muted-foreground">Branche / Pack
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.pack_key} onChange={(e) => setNewT({ ...newT, pack_key: e.target.value })}>
                {(kv?.packs ?? [{ pack_key: "ecom_core", label: "E-Commerce", domain: "ecom" }]).map((p) => <option key={p.pack_key} value={p.pack_key}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">E-Mail-Anbieter
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.provider} onChange={(e) => setNewT({ ...newT, provider: e.target.value })}>
                <option value="gmail">Gmail</option><option value="outlook">Outlook</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Tarif (optional)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.plan} onChange={(e) => setNewT({ ...newT, plan: e.target.value })} placeholder="team" />
            </label>
            <label className="text-xs text-muted-foreground">Admin-E-Mail (optional)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.admin_email} onChange={(e) => setNewT({ ...newT, admin_email: e.target.value })} placeholder="chef@kunde.de" />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">Das E-Mail-Postfach (Gmail/Outlook) wird separat über den Connect-Flow verbunden. Hier wird der Tenant + leere Voice-Konfiguration angelegt.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={doCreate} disabled={create.isPending}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anlegen"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Tenant-Picker */}
      <div className="rounded-lg border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground">Kunde auswählen</label>
        <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
          <option value="">{listLoading ? "Lädt …" : "— Kunde wählen —"}</option>
          {(list?.tenants ?? []).map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.voice_ready ? "✅ " : ""}{t.tenant_name} ({t.tenant_id}){t.status && t.status !== "active" ? ` · ${t.status}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && setupLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Setup lädt …</div>}

      {selected && form && setup && (
        <>
          {/* Voice-Readiness */}
          <div className={`rounded-lg border p-4 ${setup.voice_ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {setup.voice_ready ? <CircleCheck className="w-5 h-5 text-emerald-500" /> : <CircleAlert className="w-5 h-5 text-amber-500" />}
                <span className="font-medium text-sm">{setup.voice_ready ? "Bereit für Telefon-Anrufe" : "Telefon-Anrufe noch nicht bereit"}</span>
              </div>
              {!setup.voice_ready && (
                <Button size="sm" onClick={doPreset} disabled={save.isPending} className="gap-1.5">
                  <Zap className="w-4 h-4" /> Voice-Call aktivieren
                </Button>
              )}
            </div>
            <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
              {setup.voice_ready_checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  {c.ok ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 1) Telefonie */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h2 className="font-medium text-sm flex items-center gap-2"><PhoneCall className="w-4 h-4 text-primary" /> Telefonie (Jana)</h2>
            <Toggle checked={form.jana_enabled} onChange={(v) => upd({ jana_enabled: v })} label="Telefonie aktiviert" hint="Erlaubt Jana, für diesen Kunden Anrufe zu platzieren." />
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">VAPI-Assistent
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={(kv?.assistants ?? []).some((a) => a.id === form.vapi_assistant_id) || !form.vapi_assistant_id ? form.vapi_assistant_id : "__custom__"}
                  onChange={(e) => upd({ vapi_assistant_id: e.target.value === "__custom__" ? "" : e.target.value })}>
                  <option value="">— wählen —</option>
                  {(kv?.assistants ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}{a.is_default ? " · Standard" : ""}</option>)}
                  <option value="__custom__">Andere (manuell)…</option>
                </select>
                {!((kv?.assistants ?? []).some((a) => a.id === form.vapi_assistant_id)) && (
                  <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.vapi_assistant_id} onChange={(e) => upd({ vapi_assistant_id: e.target.value })} placeholder="VAPI Assistant-ID" />
                )}
              </label>
              <label className="text-xs text-muted-foreground">Anruf-Nummer / Caller-ID
                <input list="known-caller-ids" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={form.caller_id} onChange={(e) => upd({ caller_id: e.target.value })} placeholder="+4915… oder VAPI phone_number_id" />
                <datalist id="known-caller-ids">{(kv?.caller_ids ?? []).map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
          </section>

          {/* 2) DSGVO-Consent */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> DSGVO-Aufzeichnungs-Einwilligung</h2>
            <Toggle checked={form.recording_consent_enabled} onChange={(v) => upd({ recording_consent_enabled: v })} label="Aufzeichnungs-Einwilligung aktiv" hint="Pflicht, bevor Jana anrufen darf. Nur aktivieren, wenn der Kunde DSGVO-konform aufzeichnet." />
            <label className="text-xs text-muted-foreground block">Ansage-Text (optional)
              <textarea rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.recording_consent_banner_text} onChange={(e) => upd({ recording_consent_banner_text: e.target.value })} placeholder={kv?.default_consent_banner ?? ""} />
            </label>
          </section>

          {/* 3) Assistenz-Aktionen */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" /> Assistenz-Aktionen</h2>
            <Toggle checked={form.assistant_enabled} onChange={(v) => upd({ assistant_enabled: v })} label="Operations-Assistenz aktiv" />
            <div className="space-y-1.5">
              {(kv?.action_options ?? []).map((opt) => (
                <label key={opt.action} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.allowed_actions.includes(opt.action)} onChange={() => toggleAction(opt.action)} className="accent-primary" />
                  <span className="text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
            <label className="text-xs text-muted-foreground block">Nachfass-Tempo
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.timeout_preset} onChange={(e) => upd({ timeout_preset: e.target.value })}>
                {(kv?.timeout_presets ?? [{ value: "patient", label: "Geduldig" }, { value: "brisk", label: "Zügig" }]).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
          </section>

          {/* 4) Anrufzeiten & Limits */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Anrufzeiten &amp; Tageslimit</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-xs text-muted-foreground">Von
                <input type="time" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.active_hours_start} onChange={(e) => upd({ active_hours_start: e.target.value })} />
              </label>
              <label className="text-xs text-muted-foreground">Bis
                <input type="time" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.active_hours_end} onChange={(e) => upd({ active_hours_end: e.target.value })} />
              </label>
              <label className="text-xs text-muted-foreground">Zeitzone
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.timezone} onChange={(e) => upd({ timezone: e.target.value })} />
              </label>
              <label className="text-xs text-muted-foreground">Max. Anrufe/Tag
                <input type="number" min={0} max={500} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.daily_cap} onChange={(e) => upd({ daily_cap: Number(e.target.value) })} />
              </label>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Wochentage</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button key={d.n} type="button" onClick={() => toggleDay(d.n)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${form.active_days.includes(d.n) ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="flex items-center gap-3 sticky bottom-0 bg-background/80 backdrop-blur py-3">
            <Button onClick={() => doSave()} disabled={save.isPending} className="gap-1.5">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Speichern
            </Button>
            {setup.voice_ready && <span className="text-xs text-emerald-600 flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> Voice-bereit</span>}
          </div>
        </>
      )}
    </div>
  );
}
