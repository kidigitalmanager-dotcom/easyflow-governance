import { useState, useEffect, useMemo } from "react";
import {
  useAutonomyPolicy,
  useSaveAutonomyPolicy,
  useTestAutonomyPolicy,
} from "@/hooks/use-api";
import type {
  AutonomyPolicy,
  AutonomyPolicyPayload,
  AutonomyTestCallGate,
} from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Mail,
  PlayCircle,
  Clock,
  Calendar,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────── Konstanten ───────────────────────────

const INTENT_LABELS: Record<string, string> = {
  request_order: "Anfrage & Auftrag",
  support_issue: "Support & Stoerung",
  status_fulfillment: "Status & Abwicklung",
  returns_refund: "Rueckgabe & Erstattung",
  billing_payment: "Rechnung & Zahlung",
  contract_legal: "Vertrag & Recht",
  manual_review: "Manuelle Pruefung",
};

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 7, label: "So" },
];

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/London",
  "UTC",
];

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

const CTA_PREVIEW =
  "Falls Sie es lieber telefonisch besprechen moechten, koennen wir Sie binnen 24 Stunden zurueckrufen — eine kurze Antwort auf diese E-Mail genuegt.";

// ─────────────────────────── Default-Policy fuer leere Tenants ────────────

function emptyPolicyDraft(tenantId = ""): AutonomyPolicy {
  return {
    tenant_id: tenantId,
    channel: "voice",
    enabled: false,
    allowed_intents: [],
    confidence_threshold: 0.8,
    trigger_on_inbound: true,
    trigger_on_stalled: false,
    stalled_days_threshold: 5,
    active_hours_start: "09:00",
    active_hours_end: "18:00",
    active_days: [1, 2, 3, 4, 5],
    timezone: "Europe/Berlin",
    daily_cap: 10,
    per_contact_cooldown_days: 14,
    test_mode_enabled: true,
    test_phone_whitelist: [],
    email_cta_enabled: false,
    hard_blocked_intents: ["billing_payment", "contract_legal", "manual_review"],
    known_intents: Object.keys(INTENT_LABELS),
    updated_at: null,
  };
}

// ─────────────────────────── Komponente ────────────────────────────

export default function JanaAutopilotTab() {
  const { data, isLoading, error, refetch } = useAutonomyPolicy("voice");
  const saveMut = useSaveAutonomyPolicy();
  const testMut = useTestAutonomyPolicy();

  const [draft, setDraft] = useState<AutonomyPolicy | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Test-Form State
  const [testIntent, setTestIntent] = useState("request_order");
  const [testConfidence, setTestConfidence] = useState(0.85);
  const [testPhone, setTestPhone] = useState("");
  const [testSubject, setTestSubject] = useState("Wo bleibt meine Bestellung?");
  const [testResult, setTestResult] = useState<AutonomyTestCallGate[] | null>(null);
  const [testOverallPass, setTestOverallPass] = useState<boolean | null>(null);

  // Initial laden -> draft befuellen
  useEffect(() => {
    if (data && (data as { ok: boolean }).ok && (data as { policy: AutonomyPolicy }).policy) {
      setDraft((data as { policy: AutonomyPolicy }).policy);
    } else if (
      data &&
      !(data as { ok: boolean }).ok &&
      (data as { error?: string }).error === "policy_not_found"
    ) {
      // Kein Eintrag fuer Tenant — wir zeigen Default-Draft
      const d = data as { tenant_id?: string };
      setDraft(emptyPolicyDraft(d.tenant_id || ""));
    }
  }, [data]);

  // Hard-blocked intent set fuer schnelle Lookups
  const hardBlocked = useMemo(
    () => new Set(draft?.hard_blocked_intents || []),
    [draft],
  );
  const knownIntents = draft?.known_intents || Object.keys(INTENT_LABELS);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error && !(error instanceof ApiError && (error as ApiError).status === 404)) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4" />
          <strong>Konnte Jana-Autopilot-Konfiguration nicht laden.</strong>
        </div>
        <p className="text-muted-foreground mt-2">
          {error instanceof Error ? error.message : "Unbekannter Fehler"}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!draft) {
    // Fallback wenn data noch nicht reingekommen — sollte selten passieren
    return <div className="text-sm text-muted-foreground">Lade Konfiguration ...</div>;
  }

  // ── Field-Updaters ──────────────────────────────────────────────────

  function patch<K extends keyof AutonomyPolicy>(key: K, value: AutonomyPolicy[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function toggleIntent(intent: string) {
    if (!draft) return;
    if (hardBlocked.has(intent)) return; // Belt-and-Braces im UI
    const isOn = draft.allowed_intents.includes(intent);
    patch(
      "allowed_intents",
      isOn ? draft.allowed_intents.filter((i) => i !== intent) : [...draft.allowed_intents, intent],
    );
  }

  function toggleDay(day: number) {
    if (!draft) return;
    const isOn = draft.active_days.includes(day);
    patch(
      "active_days",
      (isOn ? draft.active_days.filter((d) => d !== day) : [...draft.active_days, day]).sort(),
    );
  }

  function addPhone() {
    setPhoneError(null);
    const v = phoneInput.trim();
    if (!v) return;
    if (!E164_REGEX.test(v)) {
      setPhoneError("Nummer muss im E.164-Format sein (z.B. +4915117687856)");
      return;
    }
    if (draft.test_phone_whitelist.includes(v)) {
      setPhoneError("Nummer bereits in der Whitelist");
      return;
    }
    patch("test_phone_whitelist", [...draft.test_phone_whitelist, v]);
    setPhoneInput("");
  }

  function removePhone(p: string) {
    patch("test_phone_whitelist", draft.test_phone_whitelist.filter((x) => x !== p));
  }

  // ── Save ────────────────────────────────────────────────────────────

  function buildPayload(): AutonomyPolicyPayload {
    return {
      channel: "voice",
      enabled: draft.enabled,
      allowed_intents: draft.allowed_intents,
      confidence_threshold: draft.confidence_threshold,
      trigger_on_inbound: draft.trigger_on_inbound,
      trigger_on_stalled: draft.trigger_on_stalled,
      stalled_days_threshold: draft.stalled_days_threshold,
      active_hours_start: draft.active_hours_start,
      active_hours_end: draft.active_hours_end,
      active_days: draft.active_days,
      timezone: draft.timezone,
      daily_cap: draft.daily_cap,
      per_contact_cooldown_days: draft.per_contact_cooldown_days,
      test_mode_enabled: draft.test_mode_enabled,
      test_phone_whitelist: draft.test_phone_whitelist,
      email_cta_enabled: draft.email_cta_enabled,
    };
  }

  async function onSave() {
    try {
      const res = await saveMut.mutateAsync(buildPayload());
      toast.success("Jana-Autopilot-Konfiguration gespeichert");
      if (res.warnings && res.warnings.length > 0) {
        for (const w of res.warnings) {
          toast.warning(prettyWarning(w));
        }
      }
      if (res.filtered_hard_blocked && res.filtered_hard_blocked.length > 0) {
        toast.info(
          `Hart-blockierte Intents wurden serverseitig entfernt: ${res.filtered_hard_blocked
            .map((i) => INTENT_LABELS[i] || i)
            .join(", ")}`,
        );
      }
      // Draft mit Server-Antwort syncen
      if (res.policy) setDraft(res.policy);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  // ── Test-Call ───────────────────────────────────────────────────────

  async function onTest() {
    setTestResult(null);
    setTestOverallPass(null);
    try {
      const res = await testMut.mutateAsync({
        intent: testIntent,
        confidence: testConfidence,
        phone: testPhone || undefined,
        subject: testSubject || undefined,
        channel: "voice",
      });
      setTestResult(res.gates);
      setTestOverallPass(res.overall_pass);
      if (res.overall_pass) toast.success("Alle Gates wuerden passieren — Jana wuerde rufen");
      else toast.message("Mindestens 1 Gate blockt — siehe Liste unten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test fehlgeschlagen");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-purple-400" />
              Jana-Autopilot
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Lege fest, wann und wie Jana selbststaendig zurueckrufen darf. Solange der
              Master-Schalter aus ist, baut UseEasy stattdessen eine Rueckruf-CTA in deine
              E-Mail-Drafts ein (sofern aktiviert).
            </p>
          </div>
        </div>

        {/* Master-Schalter */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Jana darf selbststaendig anrufen
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Ohne diesen Schalter feuert Jana keinen einzigen autonomen Anruf. Test-Modus
                bleibt zusaetzlich aktiv, solange unten Test-Nummern eingetragen sind.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => patch("enabled", !!v)}
            />
          </div>
          {draft.enabled && draft.test_mode_enabled && draft.test_phone_whitelist.length === 0 && (
            <div className="text-xs text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Test-Modus aktiv, aber Whitelist ist leer — es wird kein Call gehen.
            </div>
          )}
          {draft.enabled && draft.allowed_intents.length === 0 && (
            <div className="text-xs text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Kein Intent erlaubt — Jana koennte nicht entscheiden, fuer welche E-Mails sie
              rufen soll.
            </div>
          )}
        </div>

        {/* Intents */}
        <div className="glass-card p-5 space-y-3">
          <div>
            <div className="font-medium">Erlaubte Anlaesse (Intents)</div>
            <p className="text-sm text-muted-foreground mt-1">
              Nur fuer diese Klassifikationen darf Jana autonom werden. Hart-blockierte
              Intents lassen sich nicht aktivieren — DSGVO-/Risiko-Schutz.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {knownIntents.map((intent) => {
              const blocked = hardBlocked.has(intent);
              const checked = draft.allowed_intents.includes(intent);
              return (
                <Tooltip key={intent}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => toggleIntent(intent)}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        blocked
                          ? "border-border bg-muted/30 text-muted-foreground cursor-not-allowed"
                          : checked
                          ? "border-purple-500/60 bg-purple-500/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span>{INTENT_LABELS[intent] || intent}</span>
                      {blocked ? (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> blockiert
                        </span>
                      ) : checked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <span className="text-xs text-muted-foreground">aus</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  {blocked && (
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Aus rechtlichen/Compliance-Gruenden niemals autonom — z.B.
                        Rechnungs- oder Vertragsfragen brauchen eine menschliche Pruefung.
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Confidence + Stalled */}
        <div className="glass-card p-5 space-y-5">
          <div>
            <Label className="flex items-center justify-between">
              <span>Klassifikations-Konfidenz</span>
              <span className="text-sm text-muted-foreground">
                Mind. {Math.round(draft.confidence_threshold * 100)}%
              </span>
            </Label>
            <Slider
              min={0.8}
              max={0.95}
              step={0.01}
              value={[draft.confidence_threshold]}
              onValueChange={(v) => patch("confidence_threshold", Number(v[0].toFixed(2)))}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Bei niedrigeren Werten ruft Jana auch bei unsicheren Klassifikationen an —
              empfohlen: 0,85 fuer den Start.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Auf eingehende Mails reagieren</Label>
                <Switch
                  checked={draft.trigger_on_inbound}
                  onCheckedChange={(v) => patch("trigger_on_inbound", !!v)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sobald eine passende Mail klassifiziert wurde.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stale-Threads nachfassen</Label>
                <Switch
                  checked={draft.trigger_on_stalled}
                  onCheckedChange={(v) => patch("trigger_on_stalled", !!v)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.stalled_days_threshold}
                  onChange={(e) =>
                    patch("stalled_days_threshold", clamp(Number(e.target.value), 1, 60))
                  }
                  disabled={!draft.trigger_on_stalled}
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">Tage ohne Reaktion</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Hours / Days / Timezone */}
        <div className="glass-card p-5 space-y-4">
          <div className="font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Anrufzeit-Fenster
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={draft.active_hours_start.slice(0, 5)}
                onChange={(e) => patch("active_hours_start", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Ende</Label>
              <Input
                type="time"
                value={draft.active_hours_end.slice(0, 5)}
                onChange={(e) => patch("active_hours_end", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Zeitzone</Label>
              <Select value={draft.timezone} onValueChange={(v) => patch("timezone", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4" /> Wochentage
            </Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = draft.active_days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`h-9 w-12 rounded-md border text-sm transition-colors ${
                      on
                        ? "border-purple-500/60 bg-purple-500/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Caps + Cooldown */}
        <div className="glass-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Maximale Calls pro Tag</Label>
            <Input
              type="number"
              min={0}
              max={500}
              value={draft.daily_cap}
              onChange={(e) => patch("daily_cap", clamp(Number(e.target.value), 0, 500))}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              0 = pausiert. Empfehlung am Anfang: 5–20.
            </p>
          </div>
          <div>
            <Label>Cooldown pro Kontakt (Tage)</Label>
            <Input
              type="number"
              min={0}
              max={90}
              value={draft.per_contact_cooldown_days}
              onChange={(e) =>
                patch("per_contact_cooldown_days", clamp(Number(e.target.value), 0, 90))
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Selber Kunde wird N Tage nicht erneut angerufen.
            </p>
          </div>
        </div>

        {/* Test Mode + Whitelist */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Test-Modus
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Solange aktiv, ruft Jana ausschliesslich die unten eingetragenen Nummern an —
                selbst wenn der Master-Schalter ON ist.
              </p>
            </div>
            <Switch
              checked={draft.test_mode_enabled}
              onCheckedChange={(v) => patch("test_mode_enabled", !!v)}
            />
          </div>
          <div className="space-y-2">
            <Label>Test-Telefonnummern (E.164)</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="+4915117687856"
                value={phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPhone();
                  }
                }}
                disabled={!draft.test_mode_enabled}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addPhone}
                disabled={!draft.test_mode_enabled || !phoneInput.trim()}
              >
                <Plus className="w-4 h-4 mr-1" /> Hinzufuegen
              </Button>
            </div>
            {phoneError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {phoneError}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {draft.test_phone_whitelist.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Noch keine Nummern hinterlegt.
                </p>
              ) : (
                draft.test_phone_whitelist.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs"
                  >
                    {p}
                    <button
                      type="button"
                      onClick={() => removePhone(p)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`${p} entfernen`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Email-CTA */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                Rueckruf-CTA in E-Mail-Drafts
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Solange der Master-Schalter aus ist, haengt UseEasy diesen Zusatz an deine
                Antwort-Drafts an. So bleibt die Voice-Option fuer Kunden sichtbar.
              </p>
            </div>
            <Switch
              checked={draft.email_cta_enabled}
              onCheckedChange={(v) => patch("email_cta_enabled", !!v)}
            />
          </div>
          {draft.email_cta_enabled && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm italic text-muted-foreground">
              ... {CTA_PREVIEW}
            </div>
          )}
        </div>

        {/* Save-Bar */}
        <div className="flex items-center justify-between gap-3 sticky bottom-4">
          <div className="text-xs text-muted-foreground">
            {draft.updated_at
              ? `Zuletzt gespeichert: ${new Date(draft.updated_at).toLocaleString("de-DE")}`
              : "Noch nicht gespeichert"}
          </div>
          <Button onClick={onSave} disabled={saveMut.isPending} className="min-w-[180px]">
            {saveMut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Speichern ...
              </>
            ) : (
              "Konfiguration speichern"
            )}
          </Button>
        </div>

        {/* Test-Konfig */}
        <div className="glass-card p-5 space-y-4">
          <div>
            <div className="font-medium flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-purple-400" />
              Konfig testen (Trockenlauf)
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Simuliert eine eingehende E-Mail und zeigt, welche Gates passieren und welche
              blocken. Es wird KEIN echter Anruf ausgeloest.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Intent</Label>
              <Select value={testIntent} onValueChange={setTestIntent}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {knownIntents.map((i) => (
                    <SelectItem key={i} value={i}>
                      {INTENT_LABELS[i] || i}
                      {hardBlocked.has(i) ? " (hart blockiert)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center justify-between">
                <span>Confidence</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(testConfidence * 100)}%
                </span>
              </Label>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[testConfidence]}
                onValueChange={(v) => setTestConfidence(Number(v[0].toFixed(2)))}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Test-Telefon (optional)</Label>
              <Input
                placeholder="+4915117687856"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Betreff (optional)</Label>
              <Input
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={onTest}
              disabled={testMut.isPending}
              variant="secondary"
              className="min-w-[160px]"
            >
              {testMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pruefe ...
                </>
              ) : (
                "Gates testen"
              )}
            </Button>
            {testOverallPass !== null && (
              <span
                className={`text-sm font-medium ${
                  testOverallPass ? "text-emerald-400" : "text-amber-300"
                }`}
              >
                {testOverallPass ? "Alle Gates wuerden passieren" : "Mindestens 1 Gate blockt"}
              </span>
            )}
          </div>
          {testResult && (
            <div className="space-y-1.5 pt-2">
              {testResult.map((g) => (
                <div
                  key={g.name}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    g.pass
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  {g.pass ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-400 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-mono text-xs text-foreground">{g.name}</div>
                    {g.reason && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Grund: <code>{g.reason}</code>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─────────────────────────── Helpers ───────────────────────────

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function prettyWarning(code: string): string {
  switch (code) {
    case "test_mode_active_but_whitelist_empty":
      return "Test-Modus ist aktiv, aber keine Test-Nummer hinterlegt — Jana wird nicht rufen.";
    case "enabled_but_no_intents_allowed":
      return "Autopilot ist ON, aber kein Intent erlaubt — Jana hat nichts zu tun.";
    default:
      return code;
  }
}
