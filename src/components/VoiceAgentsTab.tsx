import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Bot, Loader2, Plus, Pencil, Trash2, PhoneCall, ShieldCheck, X, Check,
  ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import {
  useVoiceProfiles, useCreateVoiceProfile, useUpdateVoiceProfile,
  useDeleteVoiceProfile, useVoiceProfileTestCall,
} from "@/hooks/use-api";
import type { VoiceAgentProfile, VoiceProfileTemplate, VoiceProfileWriteBody } from "@/lib/api-client";

// v4.54.0 — Tab "Voice-Agents": Karten-Grid pro Agent-Profil (governance.
// voice_agent_profiles). "Agents sind Daten" — Anlegen aus Vorlage, Editor mit
// Kernfeldern + "Erweitert"-Collapse, Aktiv-Toggle, Test-Call. Die HARTEN
// REGELN (Guardrails) hängt der Server an — hier bewusst NICHT editierbar.

type EditorState = {
  id: number | null; // null = neu
  display_name: string;
  first_message: string;
  system_prompt: string;
  voice_id: string;
  transfer_number: string;
  is_active: boolean;
  // Erweitert
  description: string;
  tools: string[];
  model_name: string;
  temperature: string;
  language: string;
  profile_key: string; // nur Anzeige (neu: aus Vorlage)
};

function fromProfile(p: VoiceAgentProfile): EditorState {
  return {
    id: p.id,
    display_name: p.display_name,
    first_message: p.first_message,
    system_prompt: p.system_prompt,
    voice_id: p.voice?.voiceId ?? "",
    transfer_number: p.transfer_number ?? "",
    is_active: p.is_active,
    description: p.description ?? "",
    tools: p.tools ?? ["callResult"],
    model_name: p.model?.model ?? "gpt-4o",
    temperature: String(p.model?.temperature ?? 0.4),
    language: p.language ?? "de",
    profile_key: p.profile_key,
  };
}

function fromTemplate(t: VoiceProfileTemplate): EditorState {
  return {
    id: null,
    display_name: t.display_name,
    first_message: t.first_message,
    system_prompt: t.system_prompt,
    voice_id: "",
    transfer_number: "",
    is_active: true,
    description: t.description,
    tools: t.tools,
    model_name: "gpt-4o",
    temperature: "0.4",
    language: "de",
    profile_key: t.profile_key,
  };
}

function toWriteBody(e: EditorState, tenantId: string, templateKey?: string): VoiceProfileWriteBody {
  return {
    tenant_id: tenantId,
    ...(templateKey ? { template_key: templateKey, profile_key: e.profile_key } : {}),
    display_name: e.display_name.trim(),
    first_message: e.first_message,
    system_prompt: e.system_prompt,
    description: e.description || null,
    tools: e.tools,
    transfer_number: e.transfer_number.trim() || null,
    is_active: e.is_active,
    language: e.language || "de",
    voice: e.voice_id.trim() ? { provider: "11labs", voiceId: e.voice_id.trim(), model: "eleven_multilingual_v2" } : null,
    model: { provider: "openai", model: e.model_name || "gpt-4o", temperature: Number(e.temperature) || 0.4 },
  };
}

export default function VoiceAgentsTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useVoiceProfiles(tenantId);
  const createP = useCreateVoiceProfile();
  const updateP = useUpdateVoiceProfile(tenantId);
  const deleteP = useDeleteVoiceProfile(tenantId);
  const testCall = useVoiceProfileTestCall();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [templateKey, setTemplateKey] = useState<string | undefined>(undefined);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testFor, setTestFor] = useState<number | null>(null);
  const [testNumber, setTestNumber] = useState("");

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Lade Voice-Agents …</div>;
  if (!data?.ok) return <div className="text-sm text-destructive py-4">Voice-Agents konnten nicht geladen werden.</div>;

  const profiles = data.profiles;
  const cat = data.catalogs;
  const upd = (patch: Partial<EditorState>) => setEditor((e) => (e ? { ...e, ...patch } : e));

  const doSave = () => {
    if (!editor) return;
    if (!editor.display_name.trim()) { toast.error("Name erforderlich."); return; }
    const onError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg === "first_message_missing_consent_hint"
        ? "Aufzeichnung ist für diesen Kunden aktiv — die Begrüßung muss einen Aufzeichnungs-Hinweis enthalten (z. B. „… zeichne ich unser Gespräch kurz mit auf — passt das für Sie?“)."
        : "Fehler: " + msg);
    };
    if (editor.id === null) {
      createP.mutate(toWriteBody(editor, tenantId, templateKey), {
        onSuccess: (r) => { toast.success(`Agent „${r.profile.display_name}" angelegt.`); setEditor(null); setTemplateKey(undefined); },
        onError,
      });
    } else {
      updateP.mutate({ id: editor.id, body: toWriteBody(editor, tenantId) }, {
        onSuccess: () => { toast.success("Agent gespeichert."); setEditor(null); },
        onError,
      });
    }
  };

  const doToggleActive = (p: VoiceAgentProfile) => {
    updateP.mutate({ id: p.id, body: { is_active: !p.is_active } }, {
      onSuccess: () => toast.success(p.is_active ? `„${p.display_name}" deaktiviert.` : `„${p.display_name}" aktiviert.`),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  const doDelete = (p: VoiceAgentProfile) => {
    if (!window.confirm(`Agent „${p.display_name}" wirklich löschen?`)) return;
    deleteP.mutate(p.id, {
      onSuccess: () => toast.success("Agent gelöscht."),
      onError: (e) => {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg === "profile_in_use"
          ? "Agent wird von einer Rufnummer verwendet — erst im Rufnummern-Tab entfernen, dann löschen."
          : "Fehler: " + msg);
      },
    });
  };

  const doTestCall = (profileId: number) => {
    const num = testNumber.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(num)) { toast.error("Bitte Nummer im Format +49… angeben."); return; }
    testCall.mutate({ tenant_id: tenantId, profile_id: profileId, to_number: num }, {
      onSuccess: () => { toast.success(`Test-Anruf gestartet — Ihr Telefon klingelt gleich (${num}).`); setTestFor(null); },
      onError: (e) => {
        const msg = e instanceof Error ? e.message : String(e);
        const hints: Record<string, string> = {
          vapi_not_configured: "VAPI ist am Server nicht konfiguriert (VAPI_API_KEY fehlt).",
          vapi_webhook_secret_missing: "VAPI_WEBHOOK_SECRET fehlt am api-router (Deploy-Schritt).",
          no_caller_id: "Keine Absender-Nummer: erst eine Rufnummer importieren (Rufnummern-Tab) oder Caller-ID im Setup-Tab setzen.",
          vapi_call_failed: "VAPI hat den Anruf abgelehnt — Details im CloudWatch-Log.",
        };
        toast.error(hints[msg] || "Fehler: " + msg);
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Kopf + Guardrails-Hinweis */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-xl flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span>{cat.guardrails_info}</span>
        </p>
        <Button size="sm" onClick={() => { setShowCatalog(true); setEditor(null); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> Neu aus Vorlage
        </Button>
      </div>

      {/* Vorlagen-Katalog */}
      {showCatalog && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Vorlage wählen</h3>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowCatalog(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cat.templates.map((t) => (
              <button key={t.template_key} type="button"
                onClick={() => { setEditor(fromTemplate(t)); setTemplateKey(t.template_key); setShowCatalog(false); setShowAdvanced(false); }}
                className="text-left rounded-lg border border-border bg-background p-3 hover:border-primary/60 hover:shadow-sm transition space-y-1.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{t.display_name}</span>
                  {t.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{t.badge}</span>}
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      {editor && (
        <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              {editor.id === null ? "Neuer Voice-Agent" : `Agent bearbeiten: ${editor.display_name}`}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{editor.profile_key}</span>
            </h3>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => { setEditor(null); setTemplateKey(undefined); }}><X className="w-4 h-4" /></button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Name
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={editor.display_name} onChange={(e) => upd({ display_name: e.target.value })} placeholder="z. B. Allgemeiner Kundenservice" />
            </label>
            <label className="text-xs text-muted-foreground">Eskalations-Nummer (Mensch, +49…)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                value={editor.transfer_number} onChange={(e) => upd({ transfer_number: e.target.value })} placeholder="+49 171 2345678" />
            </label>
          </div>

          <label className="block text-xs text-muted-foreground">Begrüßung (First Message)
            {cat.recording_consent_enabled && <span className="text-amber-600"> — muss den Aufzeichnungs-Hinweis enthalten (Aufzeichnung ist für diesen Kunden aktiv)</span>}
            <textarea rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={editor.first_message} onChange={(e) => upd({ first_message: e.target.value })} />
          </label>

          <label className="block text-xs text-muted-foreground">Verhalten (System-Prompt) — Platzhalter: {"{firma}"}, {"{oeffnungszeiten}"}, {"{transfer_nummer}"}
            <textarea rows={12} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground leading-relaxed"
              value={editor.system_prompt} onChange={(e) => upd({ system_prompt: e.target.value })} />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Stimme (ElevenLabs Voice-ID — leer = Standard)
              <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground font-mono"
                value={editor.voice_id} onChange={(e) => upd({ voice_id: e.target.value })} placeholder="Voice-ID aus dem VAPI-Dashboard (z. B. von jana-cs)" />
            </label>
            <label className="flex items-end gap-2 pb-1 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={editor.is_active} onChange={(e) => upd({ is_active: e.target.checked })} />
              Aktiv (nimmt Anrufe an / wird für Calls verwendet)
            </label>
          </div>

          {/* Erweitert */}
          <button type="button" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Erweitert
          </button>
          {showAdvanced && (
            <div className="space-y-3 border-l-2 border-border pl-3">
              <label className="block text-xs text-muted-foreground">Beschreibung — <span className="font-medium">Routing-Kriterium</span>: danach entscheidet der Empfangs-Agent bei „Triage → Spezialisten", wohin ein Anruf übergeben wird
                <textarea rows={2} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={editor.description} onChange={(e) => upd({ description: e.target.value })} placeholder="z. B. Defekte, Schäden, Reparaturen, Handwerkertermine" />
              </label>
              <div className="text-xs text-muted-foreground">
                Werkzeuge
                <div className="mt-1 grid sm:grid-cols-2 gap-1.5">
                  {cat.tool_options.map((t) => (
                    <label key={t.key} className={`flex items-center gap-2 text-sm ${t.required ? "text-muted-foreground" : "text-foreground cursor-pointer"}`}>
                      <input type="checkbox" className="w-4 h-4 accent-primary" disabled={t.required}
                        checked={t.required || editor.tools.includes(t.key)}
                        onChange={(e) => upd({ tools: e.target.checked ? [...editor.tools, t.key] : editor.tools.filter((k) => k !== t.key) })} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-xs text-muted-foreground">Modell
                  <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground font-mono"
                    value={editor.model_name} onChange={(e) => upd({ model_name: e.target.value })} />
                </label>
                <label className="text-xs text-muted-foreground">Temperatur
                  <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    value={editor.temperature} onChange={(e) => upd({ temperature: e.target.value })} />
                </label>
                <label className="text-xs text-muted-foreground">Sprache
                  <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    value={editor.language} onChange={(e) => upd({ language: e.target.value })} />
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={doSave} disabled={createP.isPending || updateP.isPending} className="gap-1.5">
              {(createP.isPending || updateP.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editor.id === null ? "Agent anlegen" : "Speichern"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditor(null); setTemplateKey(undefined); }}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Karten-Grid */}
      {profiles.length === 0 && !editor && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
          <Bot className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Noch keine Voice-Agents für diesen Kunden.</p>
          <p className="text-xs text-muted-foreground">„Neu aus Vorlage" legt in 1 Klick einen fertigen HV-Agent an — danach nur noch Firmenname prüfen und Rufnummer zuordnen.</p>
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {profiles.map((p) => (
          <div key={p.id} className={`rounded-lg border bg-card p-3.5 space-y-2 ${p.is_active ? "border-border" : "border-border opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className={`w-4 h-4 flex-shrink-0 ${p.is_active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium text-foreground truncate">{p.display_name}</span>
              </div>
              <button type="button" onClick={() => doToggleActive(p)} title={p.is_active ? "Deaktivieren" : "Aktivieren"}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${p.is_active ? "bg-primary" : "bg-muted"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${p.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground">{p.profile_key}{p.voice?.voiceId ? ` · Stimme ${p.voice.voiceId.slice(0, 8)}…` : " · Standard-Stimme"}</p>
            {p.description && <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{p.description}</p>}
            <p className="text-xs text-foreground/80 leading-snug line-clamp-2 italic">„{p.first_message}"</p>
            <div className="flex items-center gap-1.5 pt-1">
              <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => { setEditor(fromProfile(p)); setTemplateKey(undefined); setShowAdvanced(false); setShowCatalog(false); }}>
                <Pencil className="w-3 h-3" /> Bearbeiten
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => { setTestFor(testFor === p.id ? null : p.id); }}>
                <PhoneCall className="w-3 h-3" /> Test-Call
              </Button>
              <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" title="Löschen" onClick={() => doDelete(p)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {testFor === p.id && (
              <div className="flex items-center gap-1.5 pt-1">
                <input className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="Ihre Nummer: +49 151 …" />
                <Button size="sm" className="h-7 px-2 text-xs" disabled={testCall.isPending} onClick={() => doTestCall(p.id)}>
                  {testCall.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Anrufen"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
