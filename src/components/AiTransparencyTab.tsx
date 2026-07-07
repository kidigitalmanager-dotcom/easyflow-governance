import { useState } from "react";
import {
  useAiTransparencySummary,
  useAiTransparencyCalls,
} from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, Hash, MapPin, Activity, Lock, Info, EyeOff, Server,
} from "lucide-react";

// Zero-Export AI Layer, Stufe A1 — KI-Transparenz.
// Belegt den Zero-Export-Anspruch: pro LLM-Aufruf ein Nachweis (Hash des bereits
// redigierten Inputs + Zahl entfernter PII-Entitaeten + Modell/Region/Zweck).
// KEIN Prompt-Text, KEIN Output-Text wird gespeichert.

const PURPOSE_LABEL: Record<string, string> = {
  classification_judge: "Klassifikation",
  draft: "Antwort-Entwurf",
  commitment_parse: "Termin-/Fristerkennung",
  resolution_judge: "Fall-Auflösung",
  voice_analysis: "Anruf-Analyse",
  capital_eligibility: "Kapital-Signal",
  chat: "Bedrock-Proxy",
  other: "Sonstiges",
};

function purposeLabel(p: string): string {
  return PURPOSE_LABEL[p] ?? p;
}

const PURPOSE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Alle Zwecke" },
  { value: "classification_judge", label: "Klassifikation" },
  { value: "draft", label: "Antwort-Entwurf" },
  { value: "commitment_parse", label: "Termin-/Fristerkennung" },
];

function StatCard({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export default function AiTransparencyTab() {
  const [purpose, setPurpose] = useState<string>("");
  const summaryQ = useAiTransparencySummary();
  const callsQ = useAiTransparencyCalls({ limit: 100, purpose: purpose || undefined });

  const s = summaryQ.data?.summary;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Zero-Export-Erklaerung (an A2-Trust-One-Pager gekoppelt) */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Zero-Export-Nachweis</h3>
            <p className="text-sm text-muted-foreground">
              Jeder KI-Aufruf wird vor der Verarbeitung pseudonymisiert (E-Mail, Telefon,
              IBAN werden entfernt) und in Frankfurt (eu-central-1) ausgeführt. Wir
              speichern hier <strong>keinen Prompt- und keinen Antworttext</strong> — nur
              einen Prüf-Hash des bereits redigierten Inputs, die Zahl der entfernten
              PII-Angaben sowie Modell, Region und Zweck. So ist der Datenschutz nicht nur
              behauptet, sondern belegbar.
            </p>
          </div>
        </div>
      </div>

      {/* Summen-Kacheln */}
      {summaryQ.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : summaryQ.error ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
          <Info className="w-4 h-4" />
          KI-Transparenz ist noch nicht verfügbar. Der Nachweis erscheint, sobald die
          Funktion aktiv ist und erste KI-Aufrufe erfasst wurden.
        </div>
      ) : s ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={<Activity className="w-3.5 h-3.5" />}
              label="KI-Aufrufe (7 Tage)"
              value={String(s.calls_7d)}
              hint={`${s.calls_total} gesamt · ${s.calls_30d} in 30 Tagen`}
            />
            <StatCard
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="Redigiert"
              value={`${s.redacted_pct}%`}
              hint="jeder Aufruf pseudonymisiert"
            />
            <StatCard
              icon={<EyeOff className="w-3.5 h-3.5" />}
              label="PII entfernt"
              value={String(s.pii_entities_removed_total)}
              hint="Angaben vor dem KI-Aufruf entfernt"
            />
            <StatCard
              icon={<Lock className="w-3.5 h-3.5" />}
              label="Datenexport"
              value={s.zero_export ? "Keiner" : "—"}
              hint="kein Prompt-/Antworttext gespeichert"
            />
          </div>

          {/* Aufschluesselung nach Zweck + Region */}
          {(s.by_purpose.length > 0 || s.by_region.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">Nach Zweck</div>
                <div className="space-y-1.5">
                  {s.by_purpose.map((row) => (
                    <div key={row.purpose} className="flex items-center justify-between text-sm">
                      <span>{purposeLabel(row.purpose)}</span>
                      <span className="tabular-nums text-muted-foreground">{row.n}</span>
                    </div>
                  ))}
                  {s.by_purpose.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">Nach Region</div>
                <div className="space-y-1.5">
                  {s.by_region.map((row) => (
                    <div key={row.region} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-muted-foreground" />{row.region}</span>
                      <span className="tabular-nums text-muted-foreground">{row.n}</span>
                    </div>
                  ))}
                  {s.by_region.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Aufruf-Liste */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            KI-Aufrufe im Detail
          </h3>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="text-sm rounded-md border border-border bg-background px-2 py-1"
          >
            {PURPOSE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {callsQ.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 rounded-md" />)}
          </div>
        ) : callsQ.error ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            Aufrufe konnten nicht geladen werden.
          </div>
        ) : (callsQ.data?.calls.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Noch keine KI-Aufrufe erfasst. Sobald eine E-Mail klassifiziert oder ein
            Entwurf erzeugt wird, erscheint hier der Nachweis.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Zeitpunkt</th>
                    <th className="text-left font-medium px-3 py-2">Zweck</th>
                    <th className="text-left font-medium px-3 py-2">Modell</th>
                    <th className="text-left font-medium px-3 py-2">Region</th>
                    <th className="text-left font-medium px-3 py-2">Input-Hash</th>
                    <th className="text-right font-medium px-3 py-2">PII entfernt</th>
                  </tr>
                </thead>
                <tbody>
                  {callsQ.data!.calls.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.ts}</td>
                      <td className="px-3 py-2">{purposeLabel(c.purpose)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{c.model_id ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Server className="w-3 h-3" />{c.region ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={c.input_hash_sha256 ?? undefined}>
                        {c.input_hash_short ?? "—"}…
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.pii_entities_removed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Der Input-Hash belegt, welcher (redigierte) Text an das Modell ging, ohne den Text
          selbst zu speichern. Aufbewahrung der Nachweise: 12 Monate.
        </p>
      </div>
    </div>
  );
}
