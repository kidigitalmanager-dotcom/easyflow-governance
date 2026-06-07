import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Phone, Loader2, Plus, Pencil, Trash2, X, Check, CircleCheck, CircleAlert, Info,
} from "lucide-react";
import {
  useVoiceProfiles, useCreateVoiceLine, useUpdateVoiceLine, useDeleteVoiceLine,
} from "@/hooks/use-api";
import type { VoiceLine, VoiceLineWriteBody } from "@/lib/api-client";

// v4.54.0 — Tab "Rufnummern": governance.voice_lines. Nummer → Tenant → Routing
// (Einzel-Agent / Triage→Spezialisten / Weiterleitung Mensch) + Geschäftszeiten
// + After-Hours. Nummern-Kauf/-Import (Twilio + VAPI) bleibt Super-Admin-
// Handarbeit — der VAPI-Import-Status ist hier sichtbar (Phone-Number-ID).

const WEEKDAYS = [
  { n: 1, label: "Mo" }, { n: 2, label: "Di" }, { n: 3, label: "Mi" },
  { n: 4, label: "Do" }, { n: 5, label: "Fr" }, { n: 6, label: "Sa" }, { n: 7, label: "So" },
];

type LineForm = {
  id: number | null;
  phone_number: string;
  label: string;
  vapi_phone_number_id: string;
  routing_mode: string;
  default_profile_key: string;
  triage_profile_key: string;
  member_profile_keys: string[];
  hours_enabled: boolean;
  days: number[];
  from: string;
  to: string;
  after_hours: string;
  after_hours_number: string;
  forward_number: string;
  is_active: boolean;
};

function emptyForm(): LineForm {
  return {
    id: null, phone_number: "", label: "", vapi_phone_number_id: "",
    routing_mode: "single", default_profile_key: "", triage_profile_key: "",
    member_profile_keys: [], hours_enabled: false, days: [1, 2, 3, 4, 5],
    from: "08:00", to: "17:00", after_hours: "assistant",
    after_hours_number: "", forward_number: "", is_active: true,
  };
}

function fromLine(l: VoiceLine): LineForm {
  return {
    id: l.id,
    phone_number: l.phone_number,
    label: l.label ?? "",
    vapi_phone_number_id: l.vapi_phone_number_id ?? "",
    routing_mode: l.routing_mode,
    default_profile_key: l.default_profile_key ?? "",
    triage_profile_key: l.triage_profile_key ?? "",
    member_profile_keys: l.member_profile_keys ?? [],
    hours_enabled: !!l.business_hours,
    days: l.business_hours?.days ?? [1, 2, 3, 4, 5],
    from: l.business_hours?.from ?? "08:00",
    to: l.business_hours?.to ?? "17:00",
    after_hours: l.after_hours ?? "assistant",
    after_hours_number: l.after_hours_number ?? "",
    forward_number: l.forward_number ?? "",
    is_active: l.is_active,
  };
}

function toBody(f: LineForm, tenantId: string): VoiceLineWriteBody {
  return {
    tenant_id: tenantId,
    phone_number: f.phone_number.trim(),
    label: f.label.trim() || null,
    vapi_phone_number_id: f.vapi_phone_number_id.trim() || null,
    routing_mode: f.routing_mode,
    default_profile_key: f.routing_mode === "single" ? (f.default_profile_key || null) : f.default_profile_key || null,
    triage_profile_key: f.triage_profile_key || null,
    member_profile_keys: f.member_profile_keys,
    business_hours: f.hours_enabled ? { days: f.days, from: f.from, to: f.to, tz: "Europe/Berlin" } : null,
    after_hours: f.after_hours,
    after_hours_number: f.after_hours_number.trim() || null,
    forward_number: f.forward_number.trim() || null,
    is_active: f.is_active,
  };
}

const MODE_LABEL: Record<string, string> = {
  single: "Einzel-Agent",
  triage_squad: "Triage → Spezialisten",
  forward_human: "Weiterleitung Mensch",
};

const ERROR_HINTS: Record<string, string> = {
  dialer_number_blocked: "Diese Nummer gehört zum Sales-Dialer (Co-Pilot) und kann nicht als Voice-Line verwendet werden.",
  phone_number_already_assigned: "Diese Nummer ist bereits einem Kunden zugeordnet.",
  single_requires_default_profile: "Einzel-Agent braucht ein Standard-Profil (im Feld „Agent“ wählen).",
  triage_requires_triage_and_members: "Triage braucht einen Empfangs-Agent UND mindestens einen Spezialisten.",
  forward_requires_number: "Weiterleitung braucht eine Ziel-Nummer.",
  unknown_profile_keys: "Mindestens ein gewähltes Profil existiert (noch) nicht — erst im Voice-Agents-Tab anlegen.",
  invalid_phone_number: "Nummer bitte im Format +49… angeben.",
  invalid_business_hours: "Geschäftszeiten unvollständig (Tage + von/bis nötig).",
};

export default function VoiceLinesTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useVoiceProfiles(tenantId);
  const createL = useCreateVoiceLine();
  const updateL = useUpdateVoiceLine(tenantId);
  const deleteL = useDeleteVoiceLine(tenantId);

  const [form, setForm] = useState<LineForm | null>(null);

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Lade Rufnummern …</div>;
  if (!data?.ok) return <div className="text-sm text-destructive py-4">Rufnummern konnten nicht geladen werden.</div>;

  const lines = data.lines;
  const profiles = data.profiles.filter((p) => p.is_active);
  const upd = (patch: Partial<LineForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const onError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(ERROR_HINTS[msg] || "Fehler: " + msg);
  };

  const doSave = () => {
    if (!form) return;
    if (form.id === null) {
      createL.mutate(toBody(form, tenantId), {
        onSuccess: () => { toast.success("Rufnummer angelegt."); setForm(null); },
        onError,
      });
    } else {
      updateL.mutate({ id: form.id, body: toBody(form, tenantId) }, {
        onSuccess: () => { toast.success("Rufnummer gespeichert."); setForm(null); },
        onError,
      });
    }
  };

  const doDelete = (l: VoiceLine) => {
    if (!window.confirm(`Rufnummer ${l.phone_number} wirklich entfernen?\n\nEingehende Anrufe auf dieser Nummer werden dann nicht mehr beantwortet (Fail-safe-Ansage).`)) return;
    deleteL.mutate(l.id, { onSuccess: () => toast.success("Rufnummer entfernt."), onError });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-xl flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Eine Nummer pro Kunde reicht für beliebig viele Agents (Routing „Triage → Spezialisten"). Kauf + VAPI-Import der Nummer macht der Super-Admin (Runbook in der Deploy-Anleitung) — danach hier die VAPI-Phone-Number-ID eintragen.</span>
        </p>
        <Button size="sm" onClick={() => setForm(emptyForm())} className="gap-1.5"><Plus className="w-4 h-4" /> Neue Rufnummer</Button>
      </div>

      {/* Editor */}
      {form && (
        <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> {form.id === null ? "Neue Rufnummer" : `Rufnummer bearbeiten: ${form.phone_number}`}
            </h3>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setForm(null)}><X className="w-4 h-4" /></button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-muted-foreground">Nummer (+49…)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground font-mono"
                value={form.phone_number} onChange={(e) => upd({ phone_number: e.target.value })} placeholder="+49 30 12345678" />
            </label>
            <label className="text-xs text-muted-foreground">Bezeichnung
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={form.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Kundenservice" />
            </label>
            <label className="text-xs text-muted-foreground">VAPI Phone-Number-ID (nach Import)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground font-mono"
                value={form.vapi_phone_number_id} onChange={(e) => upd({ vapi_phone_number_id: e.target.value })} placeholder="aus VAPI → Phone Numbers" />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Routing
              <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={form.routing_mode} onChange={(e) => upd({ routing_mode: e.target.value })}>
                {data.catalogs.routing_modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            {form.routing_mode === "single" && (
              <label className="text-xs text-muted-foreground">Agent
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={form.default_profile_key} onChange={(e) => upd({ default_profile_key: e.target.value })}>
                  <option value="">— wählen —</option>
                  {profiles.map((p) => <option key={p.profile_key} value={p.profile_key}>{p.display_name}</option>)}
                </select>
              </label>
            )}
            {form.routing_mode === "forward_human" && (
              <label className="text-xs text-muted-foreground">Weiterleiten an (+49…)
                <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={form.forward_number} onChange={(e) => upd({ forward_number: e.target.value })} placeholder="+49 171 2345678" />
              </label>
            )}
          </div>

          {form.routing_mode === "triage_squad" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Empfangs-Agent (Triage — nimmt ab, fragt das Anliegen ab)
                <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={form.triage_profile_key} onChange={(e) => upd({ triage_profile_key: e.target.value })}>
                  <option value="">— wählen —</option>
                  {profiles.map((p) => <option key={p.profile_key} value={p.profile_key}>{p.display_name}</option>)}
                </select>
              </label>
              <div className="text-xs text-muted-foreground">
                Spezialisten (Übergabe nach Anliegen — Kriterium = Beschreibung des Agents)
                <div className="mt-1 space-y-1">
                  {profiles.filter((p) => p.profile_key !== form.triage_profile_key).map((p) => (
                    <label key={p.profile_key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-primary"
                        checked={form.member_profile_keys.includes(p.profile_key)}
                        onChange={(e) => upd({
                          member_profile_keys: e.target.checked
                            ? [...form.member_profile_keys, p.profile_key]
                            : form.member_profile_keys.filter((k) => k !== p.profile_key),
                        })} />
                      {p.display_name}
                    </label>
                  ))}
                  {profiles.length === 0 && <p className="text-xs">Erst Agents im Voice-Agents-Tab anlegen.</p>}
                </div>
              </div>
            </div>
          )}

          {/* Geschäftszeiten */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.hours_enabled} onChange={(e) => upd({ hours_enabled: e.target.checked })} />
              Geschäftszeiten begrenzen <span className="text-xs text-muted-foreground">(aus = Agent nimmt rund um die Uhr an)</span>
            </label>
            {form.hours_enabled && (
              <div className="flex flex-wrap items-center gap-3 pl-6">
                <div className="flex gap-1">
                  {WEEKDAYS.map((d) => (
                    <button key={d.n} type="button"
                      onClick={() => upd({ days: form.days.includes(d.n) ? form.days.filter((x) => x !== d.n) : [...form.days, d.n].sort() })}
                      className={`px-2 py-1 rounded text-xs font-medium border ${form.days.includes(d.n) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <label className="text-xs text-muted-foreground">von
                  <input type="time" className="ml-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" value={form.from} onChange={(e) => upd({ from: e.target.value })} />
                </label>
                <label className="text-xs text-muted-foreground">bis
                  <input type="time" className="ml-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" value={form.to} onChange={(e) => upd({ to: e.target.value })} />
                </label>
                <label className="text-xs text-muted-foreground">außerhalb
                  <select className="ml-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" value={form.after_hours} onChange={(e) => upd({ after_hours: e.target.value })}>
                    {data.catalogs.after_hours_modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                {form.after_hours === "forward" && (
                  <input className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" placeholder="+49 …"
                    value={form.after_hours_number} onChange={(e) => upd({ after_hours_number: e.target.value })} />
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.is_active} onChange={(e) => upd({ is_active: e.target.checked })} />
            Aktiv
          </label>

          <div className="flex gap-2">
            <Button size="sm" onClick={doSave} disabled={createL.isPending || updateL.isPending} className="gap-1.5">
              {(createL.isPending || updateL.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {form.id === null ? "Anlegen" : "Speichern"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Liste */}
      {lines.length === 0 && !form && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
          <Phone className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Noch keine Rufnummer für diesen Kunden.</p>
        </div>
      )}
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.id} className={`rounded-lg border border-border bg-card p-3.5 flex flex-wrap items-center gap-3 ${l.is_active ? "" : "opacity-60"}`}>
            <Phone className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground font-mono">{l.phone_number}</p>
              <p className="text-xs text-muted-foreground">{l.label || "—"} · {MODE_LABEL[l.routing_mode] || l.routing_mode}
                {l.routing_mode === "single" && l.default_profile_key ? ` → ${l.default_profile_key}` : ""}
                {l.routing_mode === "triage_squad" ? ` (${(l.member_profile_keys ?? []).length} Spezialisten)` : ""}
              </p>
            </div>
            <span className={`text-xs flex items-center gap-1 ml-auto ${l.vapi_phone_number_id ? "text-emerald-600" : "text-amber-600"}`}>
              {l.vapi_phone_number_id ? <CircleCheck className="w-3.5 h-3.5" /> : <CircleAlert className="w-3.5 h-3.5" />}
              {l.vapi_phone_number_id ? "VAPI importiert" : "VAPI-Import offen"}
            </span>
            <span className="text-xs text-muted-foreground">{l.business_hours ? `${l.business_hours.from}–${l.business_hours.to}` : "24/7"}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => setForm(fromLine(l))}><Pencil className="w-3 h-3" /> Bearbeiten</Button>
            <button type="button" className="text-muted-foreground hover:text-destructive" title="Entfernen" onClick={() => doDelete(l)}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
