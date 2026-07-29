import { useState, useEffect, type ReactNode } from "react";
import { useMe } from "@/hooks/use-api";
import {
  useAdminTenants, useAdminTenantSetup, useSaveAdminTenantSetup, useCreateAdminTenant,
  useArchiveTenant, useDeleteTenant,
} from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, Dot } from "@/components/ue/primitives";
import { toast } from "sonner";
import {
  ShieldAlert, PhoneCall, ShieldCheck, ListChecks, Clock, Check, X,
  Loader2, UserPlus, Zap, CircleCheck, CircleAlert, Archive, ArchiveRestore, Trash2,
  Building2, Mail, ToggleLeft,
} from "lucide-react";
import type { TenantSetup, TenantSetupWriteBody } from "@/lib/api-client";
import {
  TENANT_FLAG_ROWS, visibleTenantFlags, buildTenantFlagPayload, describeSkippedFlags,
  type TenantFlagKey,
} from "@/lib/tenant-flags";
import AgentTenantAdminTab from "@/components/voice/AgentTenantAdminTab";
import VoiceLinesTab from "@/components/VoiceLinesTab";

// v4.32.0/v4.33.0 — Super-Admin Tenant-Setup: Voice/Assistenz + Tenant-Verwaltung
// (Archivieren/Löschen) + erweitertes Setup (Status/Tarif, Pack/Branche, Postfach-
// Status, Feature-Flags) — alles ohne SQL. Gated über is_super_admin (+ Backend-403).
//
// Redesign 27.07.2026: Abschnitte als SectionCard, Eingaben im Konsolen-Look
// (dunkle Fläche, Emerald-Fokus). Die Seite liegt im AppLayout — kein eigener
// max-w-Container mehr. Sämtliche Bestätigungsabfragen (Voice-Preset, zweifaches
// Löschen) bleiben unverändert.

const WEEKDAYS = [
  { n: 1, label: "Mo" }, { n: 2, label: "Di" }, { n: 3, label: "Mi" },
  { n: 4, label: "Do" }, { n: 5, label: "Fr" }, { n: 6, label: "Sa" }, { n: 7, label: "So" },
];

/* Eingabe/Select im Konsolen-Look — ein nacktes <input> fällt auf dunklem Grund
   optisch heraus (gleiche Sprache wie .ue-input, nur kompakter). */
const FIELD_CLASS =
  "mt-1 w-full rounded-[10px] border border-border bg-muted px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-tx-weak focus:border-primary";
const LABEL_CLASS = "block text-[11.5px] text-muted-foreground";
/* Wie FIELD_CLASS, nur ohne den mt-1-Abstand (steht nicht unter einem Label).
   Bewusst eine eigene Konstante: `FIELD_CLASS + " mt-0"` waere wirkungslos —
   bei gleicher Spezifitaet entscheidet die Reihenfolge im Stylesheet, nicht die
   im class-Attribut. */
const PICKER_CLASS =
  "w-full rounded-[10px] border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

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
      <span role="tooltip" className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 hidden w-64 -translate-x-1/2 group-hover/tip:block rounded-[10px] border border-border bg-card px-2.5 py-2 text-xs font-normal text-foreground shadow-lg leading-snug whitespace-normal text-left">{text}</span>
    </span>
  );
}

/* Kartenkopf mit Icon — spart in jedem Abschnitt drei Zeilen Markup. */
function CardTitle({ icon: Icon, children }: { icon: typeof PhoneCall; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" /> {children}
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
  status: string; plan: string; legal_basis_default: string;
  // Pack/Branche (v4.33.0)
  mailbox_profile: string;
  // Flags (v4.33.0)
  spreadsheet_enabled: boolean; autopilot_kill_switch: boolean;
  auto_consent_on_inquiry: boolean; email_cta_enabled: boolean;
  telegram_enabled: boolean; whatsapp_enabled: boolean;
}
  // Flags (v4.149.0) — die acht public.tenants-Gates, vorher nur per SQL setzbar.
  // Bewusst aus TENANT_FLAG_ROWS abgeleitet: kommt dort ein Gate dazu, verlangt
  // tsc es hier und in initForm — die Liste kann nicht auseinanderlaufen.
  & Record<TenantFlagKey, boolean>;


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
    legal_basis_default: s.tenant.legal_basis_default ?? "unknown",
    mailbox_profile: s.tenant.mailbox_profile ?? "",
    spreadsheet_enabled: s.flags?.spreadsheet_enabled ?? false,
    autopilot_kill_switch: s.flags?.autopilot_kill_switch ?? false,
    auto_consent_on_inquiry: s.flags?.auto_consent_on_inquiry ?? false,
    email_cta_enabled: s.flags?.email_cta_enabled ?? false,
    telegram_enabled: s.flags?.telegram_enabled ?? false,
    whatsapp_enabled: s.flags?.whatsapp_enabled ?? false,
    documents_enabled: s.flags?.documents_enabled ?? false,
    accounting_ap_enabled: s.flags?.accounting_ap_enabled ?? false,
    auto_offer_enabled: s.flags?.auto_offer_enabled ?? false,
    dunning_scan_enabled: s.flags?.dunning_scan_enabled ?? false,
    einvoice_enabled: s.flags?.einvoice_enabled ?? false,
    sales_pack_enabled: s.flags?.sales_pack_enabled ?? false,
    spam_rescue_enabled: s.flags?.spam_rescue_enabled ?? false,
    auto_draft_enabled: s.flags?.auto_draft_enabled ?? false,
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
      <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
        className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-secondary"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-foreground transition-transform mt-0.5 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

// Paket 5 (2026-06-11): 'bau' als wählbare Branche — Backend-KNOWN_PACKS kennt bau noch
// nicht (Frontend-only-Erweiterung lt. Addendum-Briefing). Der Write-Endpoint nimmt freie
// Werte: _writePack leitet domain via deriveDomainFromMailboxProfile('bau_core_v1') → 'bau'
// ab und schreibt active_pack_keys=['bau_core_v1']. Regeln bleiben dormant bis W2-Abschluss.
const EXTRA_PACK_OPTIONS = [
  { pack_key: "bau_core_v1", label: "Bau & Handwerk", domain: "bau" },
];
function mergePackOptions(packs?: { pack_key: string; label: string; domain: string }[]) {
  const base = packs ?? [];
  const known = new Set(base.map((p) => p.pack_key));
  return [...base, ...EXTRA_PACK_OPTIONS.filter((p) => !known.has(p.pack_key))];
}

// v4.186.0 — Klartext fuer die Rechtsgrundlagen. Die Schluessel spiegeln
// LEGAL_BASIS_OPTIONS in admin_tenant_setup.js; unbekannte Werte zeigt die Seite
// im Rohtext an, statt sie zu verschlucken.
const LEGAL_BASIS_LABELS: Record<string, string> = {
  contract: "Vertragserfuellung",
  consent: "Einwilligung",
  legitimate_interest: "Berechtigtes Interesse",
  unknown: "— noch nicht erklaert —",
};

export default function AdminTenantSetup() {
  const meQ = useMe();
  const me = meQ.data;
  const [showArchived, setShowArchived] = useState(false);
  const listQ = useAdminTenants(showArchived);
  const list = listQ.data;
  const [selected, setSelected] = useState<string | null>(null);
  const setupQ = useAdminTenantSetup(selected);
  const setup = setupQ.data;
  const save = useSaveAdminTenantSetup();
  const create = useCreateAdminTenant();
  const archive = useArchiveTenant();
  const del = useDeleteTenant();

  const [form, setForm] = useState<FormState | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState<"setup" | "agents" | "lines">("setup"); // v4.54.0 Voice-Agents/Rufnummern
  const [newT, setNewT] = useState({ tenant_id: "", tenant_name: "", pack_key: "ecom_core", provider: "gmail", plan: "", admin_email: "" });

  useEffect(() => { if (setup?.ok) setForm(initForm(setup)); }, [setup]);

  // v4.149.0 — nur Gates anzeigen und schreiben, die die DB wirklich kennt.
  // `flags_available === null` heisst „unbekannt" (keine Tenant-Zeile) → dann
  // alle zeigen, statt dem Kunden Schalter zu verstecken, die es geben koennte.
  const flagRows = visibleTenantFlags(setup?.flags_available);

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

  if (meQ.isLoading) return <Skeleton className="h-8 w-56" />;
  // Ein /me-Fehler ist kein „Kein Zugriff" — der Gate bleibt trotzdem zu.
  if (meQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Admin" title="Tenant-Setup" />
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
      tenant: {
        status: form.status,
        plan: form.plan || undefined,
        legal_basis_default: form.legal_basis_default || undefined,
      },
      pack: form.mailbox_profile ? { mailbox_profile: form.mailbox_profile } : undefined,
      flags: {
        autopilot_kill_switch: form.autopilot_kill_switch,
        auto_consent_on_inquiry: form.auto_consent_on_inquiry, email_cta_enabled: form.email_cta_enabled,
        telegram_enabled: form.telegram_enabled, whatsapp_enabled: form.whatsapp_enabled,
        // v4.149.0 — nur die Gates mitschicken, die auch als Schalter dastehen.
        // Was nicht im Body steht, laesst der Server unangetastet (Partial-Merge).
        ...buildTenantFlagPayload(flagRows, form),
      },
      ...extra,
    };
    save.mutate({ tenantId: selected, body }, {
      onSuccess: (res) => {
        // v4.149.0 — ehrlich bleiben: hat der Server ein Gate NICHT geschrieben
        // (Spalte fehlt / keine Tenant-Zeile), ist das kein „gespeichert".
        const skipped = describeSkippedFlags(res?.skipped_flags);
        if (skipped) toast.warning(`Gespeichert, aber nicht alles: ${skipped}`);
        else toast.success("Setup gespeichert.");
      },
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
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Tenant-Setup"
        subtitle="Kunden visuell verwalten & einrichten — ohne SQL. Status, Tarif, Branche, Telefonie, DSGVO, Assistenz-Aktionen, Anrufzeiten, Feature-Flags."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowNew((v) => !v)} className="gap-1.5 flex-shrink-0">
            <UserPlus className="w-4 h-4" /> Neuer Kunde
          </Button>
        }
      />

      {showNew && (
        <SectionCard title={<CardTitle icon={UserPlus}>Neuen Kunden anlegen</CardTitle>}>
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className={LABEL_CLASS}>Tenant-ID (Kürzel, klein)
                <input className={FIELD_CLASS} value={newT.tenant_id} onChange={(e) => setNewT({ ...newT, tenant_id: e.target.value })} placeholder="z. B. mueller_immobilien" />
              </label>
              <label className={LABEL_CLASS}>Firmenname
                <input className={FIELD_CLASS} value={newT.tenant_name} onChange={(e) => setNewT({ ...newT, tenant_name: e.target.value })} placeholder="Müller Immobilien GmbH" />
              </label>
              <label className={LABEL_CLASS}>Branche / Pack
                <select className={FIELD_CLASS} value={newT.pack_key} onChange={(e) => setNewT({ ...newT, pack_key: e.target.value })}>
                  {mergePackOptions(kv?.packs ?? [{ pack_key: "ecom_core", label: "E-Commerce", domain: "ecom" }]).map((p) => <option key={p.pack_key} value={p.pack_key}>{p.label}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>E-Mail-Anbieter
                <select className={FIELD_CLASS} value={newT.provider} onChange={(e) => setNewT({ ...newT, provider: e.target.value })}>
                  <option value="gmail">Gmail</option><option value="outlook">Outlook / Microsoft 365</option>
                </select>
              </label>
              <label className={LABEL_CLASS}>Tarif (optional)
                <input className={FIELD_CLASS} value={newT.plan} onChange={(e) => setNewT({ ...newT, plan: e.target.value })} placeholder="team" />
              </label>
              <label className={LABEL_CLASS}>Admin-E-Mail (optional)
                <input className={FIELD_CLASS} value={newT.admin_email} onChange={(e) => setNewT({ ...newT, admin_email: e.target.value })} placeholder="chef@kunde.de" />
              </label>
            </div>
            <p className="text-[11.5px] text-muted-foreground">Das E-Mail-Postfach (Gmail/Outlook/M365) wird separat über den Connect-Flow (OAuth) verbunden. Hier wird der Tenant + leere Voice-Konfiguration angelegt.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={doCreate} disabled={create.isPending}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anlegen"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Abbrechen</Button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Tenant-Picker + Verwaltung */}
      <SectionCard
        title="Kunde auswählen"
        action={
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-primary" />
            Archivierte anzeigen{typeof list?.archived_count === "number" ? ` (${list.archived_count})` : ""}
          </label>
        }
      >
        {/* Fehler ≠ leere Kundenliste: sonst sähe ein Ausfall aus wie „keine Kunden". */}
        {listQ.isError ? (
          <QueryErrorNotice
            label="Die Kundenliste konnte nicht geladen werden."
            onRetry={() => listQ.refetch()}
            retrying={listQ.isFetching}
          />
        ) : (
          <div className="space-y-3">
            <select className={PICKER_CLASS} aria-label="Kunde auswählen"
              value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
              <option value="">{listQ.isLoading ? "Lädt …" : "— Kunde wählen —"}</option>
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
                <Button size="sm" variant="ghost" className="gap-1.5 text-danger hover:text-danger" onClick={doDelete} disabled={del.isPending || isProtected}
                  title={isProtected ? "Prod-Tenant — nur Archivieren erlaubt" : "Endgültig löschen"}>
                  <Trash2 className="w-3.5 h-3.5" /> Löschen
                </Button>
                {isProtected && <span className="text-[11.5px] text-muted-foreground">Prod-Tenant (geschützt)</span>}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Fehler beim Setup selbst — nicht stillschweigend die Formulare ausblenden. */}
      {selected && setupQ.isError && (
        <QueryErrorNotice
          label={`Das Setup für „${selected}" konnte nicht geladen werden.`}
          onRetry={() => setupQ.refetch()}
          retrying={setupQ.isFetching}
        />
      )}

      {selected && setupQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Setup lädt …
        </div>
      )}

      {/* v4.54.0 — Tabs: Setup | Voice-Agents | Rufnummern */}
      {selected && (
        <div className="flex gap-1 border-b border-border">
          {([["setup", "Setup"], ["agents", "Voice-Agents"], ["lines", "Rufnummern"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      {selected && tab === "agents" && <AgentTenantAdminTab tenantId={selected} />}
      {selected && tab === "lines" && <VoiceLinesTab tenantId={selected} />}

      {tab === "setup" && selected && form && setup && (
        <>
          {/* Voice-Readiness */}
          <div className={`rounded-[var(--radius)] border p-4 ${setup.voice_ready ? "border-primary/30 bg-emerald-surface/40" : "border-amber/30 bg-amber-surface/50"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {setup.voice_ready ? <CircleCheck className="w-5 h-5 text-primary" /> : <CircleAlert className="w-5 h-5 text-amber" />}
                <span className="text-sm font-medium text-foreground">{setup.voice_ready ? "Bereit für Telefon-Anrufe" : "Telefon-Anrufe noch nicht bereit"}</span>
              </div>
              {!setup.voice_ready && (
                <Button size="sm" onClick={doPreset} disabled={save.isPending} className="gap-1.5"><Zap className="w-4 h-4" /> Voice-Call aktivieren</Button>
              )}
            </div>
            <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
              {setup.voice_ready_checklist.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-[12px]">
                  {c.ok ? <Check className="w-3.5 h-3.5 text-primary" /> : <X className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className={c.ok ? "text-tx-secondary" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* A) Status & Tarif */}
          <SectionCard title={<CardTitle icon={ToggleLeft}>Status &amp; Tarif</CardTitle>}>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className={LABEL_CLASS}>Status
                <select className={FIELD_CLASS} value={form.status} onChange={(e) => upd({ status: e.target.value })}>
                  {(kv?.status_options ?? ["active", "suspended", "archived"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>Tarif
                <select className={FIELD_CLASS} value={form.plan} onChange={(e) => upd({ plan: e.target.value })}>
                  <option value="">— kein —</option>
                  {(kv?.plan_options ?? ["starter", "team", "scale", "pro", "enterprise"]).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>
            <label className={`${LABEL_CLASS} mt-3 block`}>
              <span className="flex items-center gap-1">
                Rechtsgrundlage der Verarbeitung
                <InfoTip text="Auf welcher Grundlage nach DSGVO Art. 6 dieser Kunde E-Mails verarbeitet. Solange hier nichts erklaert ist, haelt der Autopilot jede Mail zurueck und meldet, die rechtliche Freigabe fehle. Das Setzen ersetzt keine Pruefung — es haelt die Entscheidung des Kunden fest." />
              </span>
              <select
                className={FIELD_CLASS}
                value={form.legal_basis_default}
                onChange={(e) => upd({ legal_basis_default: e.target.value })}
              >
                {(setup.tenant.legal_basis_options ?? ["contract", "consent", "legitimate_interest", "unknown"]).map((o) => (
                  <option key={o} value={o}>{LEGAL_BASIS_LABELS[o] ?? o}</option>
                ))}
              </select>
              {form.legal_basis_default === "unknown" && (
                <span className="mt-1 block text-xs text-amber-600">
                  Nicht erklaert — der Autopilot sendet fuer diesen Kunden nichts von allein.
                </span>
              )}
            </label>
          </SectionCard>

          {/* B) Pack/Branche & Domain */}
          <SectionCard
            title={
              <CardTitle icon={Building2}>
                Branche / Pack
                <InfoTip text="Steuert, welche Klassifikations-Regeln laufen und wie Labels heißen (z. B. Hausverwaltung vs. E-Commerce). Domain wird automatisch passend gesetzt." />
              </CardTitle>
            }
          >
            <label className={LABEL_CLASS}>Pack
              <select className={FIELD_CLASS} value={form.mailbox_profile} onChange={(e) => upd({ mailbox_profile: e.target.value })}>
                <option value="">{setup.tenant.mailbox_profile ? `aktuell: ${setup.tenant.mailbox_profile}` : "— wählen —"}</option>
                {mergePackOptions(kv?.packs).map((p) => <option key={p.pack_key} value={p.pack_key}>{p.label} ({p.domain})</option>)}
              </select>
            </label>
            <p className="mt-3 text-[11.5px] text-muted-foreground">Aktuelle Domain: {setup.tenant.domain ?? "—"} · Packs: {(setup.tenant.active_pack_keys ?? []).join(", ") || "—"}</p>
          </SectionCard>

          {/* C) Postfach-Status & Connect */}
          <SectionCard title={<CardTitle icon={Mail}>Postfach-Status</CardTitle>}>
            {(setup.mailboxes ?? []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Kein Postfach verbunden. Der Kunde verbindet Gmail bzw. Outlook/Microsoft 365 selbst über den Connect-Button (OAuth, One-Click) in seinem Dashboard.</p>
            ) : (
              <ul className="space-y-1.5">
                {(setup.mailboxes ?? []).map((m, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Dot tone={m.expired ? "danger" : "emerald"} />
                    <span className="text-foreground">{m.provider}</span>
                    <span className="text-muted-foreground">{m.email}</span>
                    <span className="text-[11.5px] text-muted-foreground">{m.expired ? "· Token abgelaufen (Reconnect nötig)" : "· verbunden"}</span>
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
            <p className="mt-3 text-[11.5px] text-muted-foreground">Hinweis: Verbinden läuft über OAuth (kein Token-Eintippen). Ein „Outlook / Microsoft 365"-Button deckt beide ab, sobald die Azure-App „organizational + personal accounts" erlaubt.</p>
          </SectionCard>

          {/* 1) Telefonie */}
          <SectionCard title={<CardTitle icon={PhoneCall}>Telefonie (Jana)</CardTitle>}>
            <div className="space-y-4">
              <Toggle checked={form.jana_enabled} onChange={(v) => upd({ jana_enabled: v })} label="Telefonie aktiviert" hint="Erlaubt Jana, für diesen Kunden Anrufe zu platzieren." />
              <div className="grid sm:grid-cols-2 gap-3">
                <label className={LABEL_CLASS}>VAPI-Assistent
                  <select className={FIELD_CLASS}
                    value={(kv?.assistants ?? []).some((a) => a.id === form.vapi_assistant_id) || !form.vapi_assistant_id ? form.vapi_assistant_id : "__custom__"}
                    onChange={(e) => upd({ vapi_assistant_id: e.target.value === "__custom__" ? "" : e.target.value })}>
                    <option value="">— wählen —</option>
                    {(kv?.assistants ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}{a.is_default ? " · Standard" : ""}</option>)}
                    <option value="__custom__">Andere (manuell)…</option>
                  </select>
                  {!((kv?.assistants ?? []).some((a) => a.id === form.vapi_assistant_id)) && (
                    <input className={FIELD_CLASS} value={form.vapi_assistant_id} onChange={(e) => upd({ vapi_assistant_id: e.target.value })} placeholder="VAPI Assistant-ID" />
                  )}
                </label>
                <label className={LABEL_CLASS}>Anruf-Nummer / Caller-ID
                  <input list="known-caller-ids" className={FIELD_CLASS}
                    value={form.caller_id} onChange={(e) => upd({ caller_id: e.target.value })} placeholder="+4915… oder VAPI phone_number_id" />
                  <datalist id="known-caller-ids">{(kv?.caller_ids ?? []).map((c) => <option key={c} value={c} />)}</datalist>
                </label>
              </div>
            </div>
          </SectionCard>

          {/* 2) DSGVO-Consent */}
          <SectionCard title={<CardTitle icon={ShieldCheck}>DSGVO-Aufzeichnungs-Einwilligung</CardTitle>}>
            <div className="space-y-3">
              <Toggle checked={form.recording_consent_enabled} onChange={(v) => upd({ recording_consent_enabled: v })} label="Aufzeichnungs-Einwilligung aktiv" hint="Pflicht, bevor Jana anrufen darf. Nur aktivieren, wenn der Kunde DSGVO-konform aufzeichnet." />
              <label className={LABEL_CLASS}>Ansage-Text (optional)
                <textarea rows={2} className={FIELD_CLASS} value={form.recording_consent_banner_text} onChange={(e) => upd({ recording_consent_banner_text: e.target.value })} placeholder={kv?.default_consent_banner ?? ""} />
              </label>
            </div>
          </SectionCard>

          {/* 3) Assistenz-Aktionen (mit Tooltips) */}
          <SectionCard title={<CardTitle icon={ListChecks}>Assistenz-Aktionen</CardTitle>}>
            <div className="space-y-3">
              <Toggle checked={form.assistant_enabled} onChange={(v) => upd({ assistant_enabled: v })} label="Operations-Assistenz aktiv" />
              <div className="space-y-1.5">
                {(kv?.action_options ?? []).map((opt) => (
                  <label key={opt.action} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.allowed_actions.includes(opt.action)} onChange={() => toggleAction(opt.action)} className="accent-primary" />
                    <span className="text-tx-secondary">{opt.label}</span>
                    {ACTION_HELP[opt.action] && <InfoTip text={ACTION_HELP[opt.action]} />}
                  </label>
                ))}
              </div>
              <label className={LABEL_CLASS}>Nachfass-Tempo
                <select className={FIELD_CLASS} value={form.timeout_preset} onChange={(e) => upd({ timeout_preset: e.target.value })}>
                  {(kv?.timeout_presets ?? [{ value: "patient", label: "Geduldig" }, { value: "brisk", label: "Zügig" }]).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
            </div>
          </SectionCard>

          {/* 4) Anrufzeiten & Limits */}
          <SectionCard title={<CardTitle icon={Clock}>Anrufzeiten &amp; Tageslimit</CardTitle>}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className={LABEL_CLASS}>Von
                  <input type="time" className={FIELD_CLASS + " tabular"} value={form.active_hours_start} onChange={(e) => upd({ active_hours_start: e.target.value })} />
                </label>
                <label className={LABEL_CLASS}>Bis
                  <input type="time" className={FIELD_CLASS + " tabular"} value={form.active_hours_end} onChange={(e) => upd({ active_hours_end: e.target.value })} />
                </label>
                <label className={LABEL_CLASS}>Zeitzone
                  <input className={FIELD_CLASS} value={form.timezone} onChange={(e) => upd({ timezone: e.target.value })} />
                </label>
                <label className={LABEL_CLASS}>Max. Anrufe/Tag
                  <input type="number" min={0} max={500} className={FIELD_CLASS + " tabular"} value={form.daily_cap} onChange={(e) => upd({ daily_cap: Number(e.target.value) })} />
                </label>
              </div>
              <div>
                <span className="text-[11.5px] text-muted-foreground">Wochentage</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button key={d.n} type="button" onClick={() => toggleDay(d.n)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${form.active_days.includes(d.n) ? "border-emerald-surface bg-emerald-surface/70 text-emerald-light" : "border-border bg-muted text-muted-foreground hover:text-foreground hover:border-primary/35"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* D) Feature-Flags */}
          <SectionCard title={<CardTitle icon={Zap}>Feature-Flags</CardTitle>}>
            <div className="space-y-3">
              {/* v4.149.0 — Freischaltung ohne SQL. Ohne diese Gates meldet der
                  Postfach-Scan beim Kunden „Scan uebersprungen: tenant_disabled". */}
              {flagRows.map((r) => (
                <Toggle key={r.key} checked={form[r.key]} onChange={(v) => upd({ [r.key]: v } as Partial<FormState>)} label={r.label} hint={r.hint} />
              ))}
              {flagRows.length < TENANT_FLAG_ROWS.length && (
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  {TENANT_FLAG_ROWS.length - flagRows.length} weitere Schalter sind ausgeblendet: die zugehoerige Spalte fehlt in der Datenbank.
                </p>
              )}
              <div className="border-t border-line-soft pt-3" />
              <Toggle checked={form.autopilot_kill_switch} onChange={(v) => upd({ autopilot_kill_switch: v })} label="Autopilot-Notbremse (Kill-Switch)" hint="Wenn AN: stoppt jeden automatischen Versand sofort, egal welcher Modus." />
              <Toggle checked={form.auto_consent_on_inquiry} onChange={(v) => upd({ auto_consent_on_inquiry: v })} label="Auto-Einwilligung bei eingehender Anfrage" hint="Wenn der Kunde von sich aus schreibt/anruft, gilt die Aufzeichnungs-Einwilligung als gegeben (für Rückrufe)." />
              <Toggle checked={form.email_cta_enabled} onChange={(v) => upd({ email_cta_enabled: v })} label="Rückruf-CTA in E-Mails" hint="Hängt bei passenden Antworten einen Rückruf-Hinweis an (nur wenn Auto-Versand aus)." />
              <Toggle checked={form.telegram_enabled} onChange={(v) => upd({ telegram_enabled: v })} label="Telegram-Steuerung erlauben" hint="Erlaubt diesem Kunden, sein UseEasy per Telegram zu steuern (Verknüpfung via Magic-Link). Greift, sobald der Telegram-Bot live ist." />
              <Toggle checked={form.whatsapp_enabled} onChange={(v) => upd({ whatsapp_enabled: v })} label="WhatsApp-Steuerung erlauben" hint="Wie Telegram, aber über WhatsApp (sobald der WhatsApp-Kanal live ist)." />
              <div className="border-t border-line-soft pt-3 space-y-1.5">
                <p className="ue-kicker">Integrationen (Status)</p>
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Dot tone={setup.flags?.hubspot_connected ? "emerald" : "muted"} /> HubSpot: {setup.flags?.hubspot_connected ? "verbunden" : "nicht verbunden"}
                </p>
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {/* Kein `?? 0`: liefert der Server nichts, steht hier „–" statt einer erfundenen Null. */}
                  <Dot tone={(setup.flags?.mailbox_count ?? 0) > 0 ? "emerald" : "muted"} /> Postfächer verbunden: <span className="tabular">{setup.flags?.mailbox_count ?? "–"}</span>
                </p>
                <p className="pt-1 text-[11.5px] text-muted-foreground">Autopilot-Modus: {setup.flags?.autopilot_mode ?? "—"} (Freigabe/Reifegate über „Autopilot-Promotion").</p>
              </div>
            </div>
          </SectionCard>

          <div className="sticky bottom-0 flex items-center gap-3 bg-background/85 py-3 backdrop-blur">
            <Button onClick={() => doSave()} disabled={save.isPending} className="gap-1.5">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Speichern
            </Button>
            {setup.voice_ready && <span className="flex items-center gap-1 text-[12px] text-primary"><CircleCheck className="w-3.5 h-3.5" /> Voice-bereit</span>}
          </div>
        </>
      )}
    </div>
  );
}
