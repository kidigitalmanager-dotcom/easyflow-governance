import { useState, useEffect } from "react";
import { useMe } from "@/hooks/use-api";
import {
  useAdminTenants, useAdminTenantSetup, useSaveAdminTenantSetup, useCreateAdminTenant,
  useArchiveTenant, useDeleteTenant,
} from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ShieldAlert, PhoneCall, ShieldCheck, ListChecks, Clock, Check, X,
  Loader2, UserPlus, Zap, CircleCheck, CircleAlert, Archive, ArchiveRestore, Trash2,
  Building2, Mail, ToggleLeft,
} from "lucide-react";
import type { TenantSetup, TenantSetupWriteBody } from "@/lib/api-client";
import VoiceAgentsTab from "@/components/VoiceAgentsTab";
import VoiceLinesTab from "@/components/VoiceLinesTab";

// v4.32.0/v4.33.0 — Super-Admin Tenant-Setup: Voice/Assistenz + Tenant-Verwaltung
// (Archivieren/Löschen) + erweitertes Setup (Status/Tarif, Pack/Branche, Postfach-
// Status, Feature-Flags) — alles ohne SQL. Gated über is_super_admin (+ Backend-403).

const WEEKDAYS = [
  { n: 1, label: "Mo" }, { n: 2, label: "Di" }, { n: 3, label: "Mi" },
  { n: 4, label: "Do" }, { n: 5, label: "Fr" }, { n: 6, label: "Sa" }, { n: 7, label: "So" },
];

// Klartext-Erklärungen für die Assistenz-Aktionen (Tooltip bei ?-Hover).
const ACTION_HELP: Record<string, string> = {
  email_clarify: "Die Assistenz darf bei Unklarheiten selbstständig eine Rückfrage-E-Mail an den Kontakt als Entwurf formulieren (z. B. fehlende Bestellnummer erfragen). Versand erfolgt im Autopilot-Rahmen / nach Freigabe.",
  voice_call: "Die Assistenz darf einen Kontakt telefonisch klären lassen (Jana/VAPI). Erfordert: Telefonie aktiv + DSGVO-Aufzeichnungs-Einwilligung + freigegebene Anrufzeiten. Nach jedem Anruf gibt es einen Checkpoint.",
  crm_update: "Die Assistenz darf Kontakt-/Deal-Daten im verbundenen CRM (HubSpot) aktualisieren — z. B. Lead-Status setzen oder ein Feld pflegen.",
  note_capture: "Die Assistenz darf eine interne Notiz zum Vorgang festhalten (z. B. Gesprächsergebnis). Kein Versand nach außen.",
};

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/tip align-middle ml-1">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-border text-[10px] leading-none text-muted-foreground cursor-help select-none">?</span>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 hidden w-64 -translate-x-1/2 group-hover/tip:block rounded-md border border-border bg-card px-2.5 py-2 text-xs font-normal text-foreground shadow-lg leading-snug whitespace-normal text-left">{text}</span>
    </span>
  );
}

type FormState = {
  // Voice
  jana_enabled: boolean; vapi_assistant_id: string; caller_id: string; domain: string;
  // Consent
  recording_consent_enabled: boolean; recording_consent_banner_text: string;
  // Assistant
  assistant_enabled: boolean; allowed_actions: string[]; timeout_preset: string;
  // Voice policy
  active_hours_start: string; active_hours_end: string; active_days: number[]; timezone: string; daily_cap: number;
  // Tenant meta (v4.33.0)
  status: string; plan: string;
  // Pack/Branche (v4.33.0)
  mailbox_profile: string;
  // Flags (v4.33.0)
  spreadsheet_enabled: boolean; autopilot_kill_switch: boolean;
  auto_consent_on_inquiry: boolean; email_cta_enabled: boolean;
  telegram_enabled: boolean; whatsapp_enabled: boolean;
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
    status: s.tenant.status ?? "active",
    plan: s.tenant.plan ?? "",
    mailbox_profile: s.tenant.mailbox_profile ?? "",
    spreadsheet_enabled: s.flags?.spreadsheet_enabled ?? false,
    autopilot_kill_switch: s.flags?.autopilot_kill_switch ?? false,
    auto_consent_on_inquiry: s.flags?.auto_consent_on_inquiry ?? false,
    email_cta_enabled: s.flags?.email_cta_enabled ?? false,
    telegram_enabled: s.flags?.telegram_enabled ?? false,
    whatsapp_enabled: s.flags?.whatsapp_enabled ?? false,
  };
}

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
  const [showArchived, setShowArchived] = useState(false);
  const { data: list, isLoading: listLoading } = useAdminTenants(showArchived);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: setup, isLoading: setupLoading } = useAdminTenantSetup(selected);
  const save = useSaveAdminTenantSetup();
  const create = useCreateAdminTenant();
  const archive = useArchiveTenant();
  const del = useDeleteTenant();

  const [form, setForm] = useState<FormState | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"setup" | "agents" | "lines">("setup"); // v4.54.0 Voice-Agents/Rufnummern
  const [newT, setNewT] = useState({ tenant_id: "", tenant_name: "", pack_key: "ecom_core", provider: "gmail", plan: "", admin_email: "" });

  useEffect(() => { if (setup?.ok) setForm(initForm(setup)); }, [setup]);

  // v4.35.0 — Rückkehr vom Outlook/M365-OAuth-Reconnect: Toast + URL säubern.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("outlook");
    if (!outcome) return;
    if (outcome === "connected") {
      toast.success(`Outlook neu verbunden${params.get("mailbox") ? `: ${params.get("mailbox")}` : ""}.`);
    } else if (outcome === "error") {
      const reason = params.get("reason") || "unbekannt";
      toast.error(`Outlook-Verbindung fehlgeschlagen: ${reason}`);
    }
    const url = new URL(window.location.href);
    ["outlook", "mailbox", "tenant", "reason", "got", "expected"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  if (meLoading) return <div className="text-sm text-muted-foreground">Lädt …</div>;
  if (!me?.user?.is_super_admin) {
    return <div className="max-w-lg flex items-center gap-2 text-destructive"><ShieldAlert className="w-5 h-5" /><h1 className="text-lg font-semibold">Kein Zugriff</h1></div>;
  }

  const kv = setup?.known_values ?? list?.known_values;
  const selItem = (list?.tenants ?? []).find((t) => t.tenant_id === selected);
  const isProtected = setup?.tenant?.protected || selItem?.protected;
  const isArchived = setup?.tenant?.status === "archived" || selItem?.archived;
  const upd = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const doSave = (extra?: Partial<TenantSetupWriteBody>) => {
    if (!selected || !form) return;
    const body: TenantSetupWriteBody = {
      voice: buildVoiceWrite(form),
      consent: { recording_consent_enabled: form.recording_consent_enabled, recording_consent_banner_text: form.recording_consent_banner_text || null },
      assistant: { enabled: form.assistant_enabled, allowed_actions: form.allowed_actions, timeout_preset: form.timeout_preset },
      voice_policy: { active_hours_start: form.active_hours_start, active_hours_end: form.active_hours_end, active_days: form.active_days, timezone: form.timezone, daily_cap: form.daily_cap },
      tenant: { status: form.status, plan: form.plan || undefined },
      pack: form.mailbox_profile ? { mailbox_profile: form.mailbox_profile } : undefined,
      flags: {
        spreadsheet_enabled: form.spreadsheet_enabled, autopilot_kill_switch: form.autopilot_kill_switch,
        auto_consent_on_inquiry: form.auto_consent_on_inquiry, email_cta_enabled: form.email_cta_enabled,
        telegram_enabled: form.telegram_enabled, whatsapp_enabled: form.whatsapp_enabled,
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
    if (!window.confirm("Voice-Call für diesen Kunden aktivieren?\n\nSetzt: Telefonie an, DSGVO-Aufzeichnungs-Einwilligung an, Aktion Telefon-Anruf frei, Anrufzeiten 09–18 Uhr Mo–Fr. Nur aktivieren, wenn der Kunde DSGVO-konform aufzeichnet.")) return;
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

  const doArchive = (archived: boolean) => {
    if (!selected) return;
    archive.mutate({ tenantId: selected, archived }, {
      onSuccess: () => toast.success(archived ? "Tenant archiviert." : "Tenant reaktiviert."),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };
  const doDelete = () => {
    if (!selected) return;
    if (isProtected) { toast.error("Prod-Tenant — nur Archivieren erlaubt."); return; }
    if (!window.confirm(`Tenant „${selected}" ENDGÜLTIG löschen?\n\nEntfernt Identitäts- und Setup-Daten unwiderruflich aus der DB.`)) return;
    if (!window.confirm(`Wirklich sicher? Letzte Bestätigung für „${selected}".`)) return;
    del.mutate(selected, {
      onSuccess: (r) => { toast.success(`Gelöscht (${r.deleted.length} Tabellen).`); setSelected(null); },
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const toggleAction = (a: string) => upd({ allowed_actions: form!.allowed_actions.includes(a) ? form!.allowed_actions.filter((x) => x !== a) : [...form!.allowed_actions, a] });
  const toggleDay = (n: number) => upd({ active_days: form!.active_days.includes(n) ? form!.active_days.filter((x) => x !== n) : [...form!.active_days, n].sort() });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tenant-Setup</h1>
          <p className="text-sm text-muted-foreground">Kunden visuell verwalten &amp; einrichten — ohne SQL. Status, Tarif, Branche, Telefonie, DSGVO, Assistenz-Aktionen, Anrufzeiten, Feature-Flags.</p>
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
                <option value="gmail">Gmail</option><option value="outlook">Outlook / Microsoft 365</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Tarif (optional)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.plan} onChange={(e) => setNewT({ ...newT, plan: e.target.value })} placeholder="team" />
            </label>
            <label className="text-xs text-muted-foreground">Admin-E-Mail (optional)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={newT.admin_email} onChange={(e) => setNewT({ ...newT, admin_email: e.target.value })} placeholder="chef@kunde.de" />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">Das E-Mail-Postfach (Gmail/Outlook/M365) wird separat über den Connect-Flow (OAuth) verbunden. Hier wird der Tenant + leere Voice-Konfiguration angelegt.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={doCreate} disabled={create.isPending}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anlegen"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Tenant-Picker + Verwaltung */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Kunde auswählen</label>
          <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-primary" />
            Archivierte anzeigen{typeof list?.archived_count === "number" ? ` (${list.archived_count})` : ""}
          </label>
        </div>
        <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
          <option value="">{listLoading ? "Lädt …" : "— Kunde wählen —"}</option>
          {(list?.tenants ?? []).map((t) => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.archived ? "🗄 " : t.voice_ready ? "✅ " : ""}{t.tenant_name} ({t.tenant_id}){t.status && t.status !== "active" ? ` · ${t.status}` : ""}
            </option>
          ))}
        </select>
        {selected && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isArchived
              ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => doArchive(false)} disabled={archive.isPending}><ArchiveRestore className="w-3.5 h-3.5" /> Reaktivieren</Button>
              : <Button size="sm" variant="outline" className="gap-1.5" onClick={() => doArchive(true)} disabled={archive.isPending}><Archive className="w-3.5 h-3.5" /> Archivieren</Button>}
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={doDelete} disabled={del.isPending || isProtected}
              title={isProtected ? "Prod-Tenant — nur Archivieren erlaubt" : "Endgültig löschen"}>
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </Button>
            {isProtected && <span className="text-[11px] text-muted-foreground">Prod-Tenant (geschützt)</span>}
          </div>
        )}
      </div>

      {selected && setupLoading && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Setup lädt …</div>}

      {/* v4.54.0 — Tabs: Setup | Voice-Agents | Rufnummern */}
      {selected && (
        <div className="flex gap-1 border-b border-border">
          {([["setup", "Setup"], ["agents", "Voice-Agents"], ["lines", "Rufnummern"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {selected && tab === "agents" && <VoiceAgentsTab tenantId={selected} />}
      {selected && tab === "lines" && <VoiceLinesTab tenantId={selected} />}

      {tab === "setup" && selected && form && setup && (
        <>
          {/* Voice-Readiness */}
          <div className={`rounded-lg border p-4 ${setup.voice_ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {setup.voice_ready ? <CircleCheck className="w-5 h-5 text-emerald-500" /> : <CircleAlert className="w-5 h-5 text-amber-500" />}
                <span className="font-medium text-sm">{setup.voice_ready ? "Bereit für Telefon-Anrufe" : "Telefon-Anrufe noch nicht bereit"}</span>
              </div>
              {!setup.voice_ready && (
                <Button size="sm" onClick={doPreset} disabled={save.isPending} className="gap-1.5"><Zap className="w-4 h-4" /> Voice-Call aktivieren</Button>
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

          {/* A) Status & Tarif */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><ToggleLeft className="w-4 h-4 text-primary" /> Status &amp; Tarif</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Status
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.status} onChange={(e) => upd({ status: e.target.value })}>
                  {(kv?.status_options ?? ["active", "suspended", "archived"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">Tarif
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.plan} onChange={(e) => upd({ plan: e.target.value })}>
                  <option value="">— kein —</option>
                  {(kv?.plan_options ?? ["starter", "team", "scale", "pro", "enterprise"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>
          </section>

          {/* B) Pack/Branche & Domain */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Branche / Pack <InfoTip text="Steuert, welche Klassifikations-Regeln laufen und wie Labels heißen (z. B. Hausverwaltung vs. E-Commerce). Domain wird automatisch passend gesetzt." /></h2>
            <label className="text-xs text-muted-foreground block">Pack
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={form.mailbox_profile} onChange={(e) => upd({ mailbox_profile: e.target.value })}>
                <option value="">{setup.tenant.mailbox_profile ? `aktuell: ${setup.tenant.mailbox_profile}` : "— wählen —"}</option>
                {(kv?.packs ?? []).map((p) => <option key={p.pack_key} value={p.pack_key}>{p.label} ({p.domain})</option>)}
              </select>
            </label>
            <p className="text-[11px] text-muted-foreground">Aktuelle Domain: {setup.tenant.domain ?? "—"} · Packs: {(setup.tenant.active_pack_keys ?? []).join(", ") || "—"}</p>
          </section>

          {/* C) Postfach-Status & Connect */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Postfach-Status</h2>
            {(setup.mailboxes ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Kein Postfach verbunden. Der Kunde verbindet Gmail bzw. Outlook/Microsoft 365 selbst über den Connect-Button (OAuth, One-Click) in seinem Dashboard.</p>
            ) : (
              <ul className="space-y-1.5">
                {(setup.mailboxes ?? []).map((m, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full ${m.expired ? "bg-destructive" : "bg-emerald-500"}`} />
                    <span className="text-foreground">{m.provider}</span>
                    <span className="text-muted-foreground">{m.email}</span>
                    <span className="text-[11px] text-muted-foreground">{m.expired ? "· Token abgelaufen (Reconnect nötig)" : "· verbunden"}</span>
                    {m.provider === "outlook" && selected && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7 px-2 text-xs"
                        onClick={() => {
                          const u = new URL("https://api.useeasy.ai/v1/outlook/oauth/start");
                          u.searchParams.set("tenant_id", selected);
                          u.searchParams.set("mailbox", m.email);
                          window.location.href = u.toString();
                        }}
                      >
                        Neu verbinden
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">Hinweis: Verbinden läuft über OAuth (kein Token-Eintippen). Ein „Outlook / Microsoft 365"-Button deckt beide ab, sobald die Azure-App „organizational + personal accounts" erlaubt.</p>
          </section>

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

          {/* 3) Assistenz-Aktionen (mit Tooltips) */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" /> Assistenz-Aktionen</h2>
            <Toggle checked={form.assistant_enabled} onChange={(v) => upd({ assistant_enabled: v })} label="Operations-Assistenz aktiv" />
            <div className="space-y-1.5">
              {(kv?.action_options ?? []).map((opt) => (
                <label key={opt.action} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.allowed_actions.includes(opt.action)} onChange={() => toggleAction(opt.action)} className="accent-primary" />
                  <span className="text-foreground">{opt.label}</span>
                  {ACTION_HELP[opt.action] && <InfoTip text={ACTION_HELP[opt.action]} />}
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

          {/* D) Feature-Flags */}
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="font-medium text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Feature-Flags</h2>
            <Toggle checked={form.spreadsheet_enabled} onChange={(v) => upd({ spreadsheet_enabled: v })} label="Excel Live-Sync aktiv" hint="Erlaubt das automatische Aktualisieren verbundener Tabellen." />
            <Toggle checked={form.autopilot_kill_switch} onChange={(v) => upd({ autopilot_kill_switch: v })} label="Autopilot-Notbremse (Kill-Switch)" hint="Wenn AN: stoppt jeden automatischen Versand sofort, egal welcher Modus." />
            <Toggle checked={form.auto_consent_on_inquiry} onChange={(v) => upd({ auto_consent_on_inquiry: v })} label="Auto-Einwilligung bei eingehender Anfrage" hint="Wenn der Kunde von sich aus schreibt/anruft, gilt die Aufzeichnungs-Einwilligung als gegeben (für Rückrufe)." />
            <Toggle checked={form.email_cta_enabled} onChange={(v) => upd({ email_cta_enabled: v })} label="Rückruf-CTA in E-Mails" hint="Hängt bei passenden Antworten einen Rückruf-Hinweis an (nur wenn Auto-Versand aus)." />
            <Toggle checked={form.telegram_enabled} onChange={(v) => upd({ telegram_enabled: v })} label="Telegram-Steuerung erlauben" hint="Erlaubt diesem Kunden, sein UseEasy per Telegram zu steuern (Verknüpfung via Magic-Link). Greift, sobald der Telegram-Bot live ist." />
            <Toggle checked={form.whatsapp_enabled} onChange={(v) => upd({ whatsapp_enabled: v })} label="WhatsApp-Steuerung erlauben" hint="Wie Telegram, aber über WhatsApp (sobald der WhatsApp-Kanal live ist)." />
            <div className="border-t border-border pt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Integrationen (Status)</p>
              <p className="text-xs flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${setup.flags?.hubspot_connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /> HubSpot: {setup.flags?.hubspot_connected ? "verbunden" : "nicht verbunden"}</p>
              <p className="text-xs flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${(setup.flags?.mailbox_count ?? 0) > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"}`} /> Postfächer verbunden: {setup.flags?.mailbox_count ?? 0}</p>
              <p className="text-[11px] text-muted-foreground pt-1">Autopilot-Modus: {setup.flags?.autopilot_mode ?? "—"} (Freigabe/Reifegate über „Autopilot-Promotion").</p>
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
