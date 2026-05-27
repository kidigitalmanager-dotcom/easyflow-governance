import { useState, useEffect } from "react";
import { useTenantSetupSelf, useSaveTenantSetupSelf } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PhoneCall, Check, X, Loader2, ShieldCheck, Clock, CircleCheck, CircleAlert } from "lucide-react";

// v4.32.0 — Self-Serve "Telefonie & Assistenz"-Karte (eigener Tenant).
// Der Kunde SIEHT den Voice-Bereitschafts-Status (Infrastruktur richtet
// Pinklightstudios ein) und kann selbst Aufzeichnungs-Einwilligung + Anrufzeiten
// setzen. Infra-Felder (Jana/Assistent/Nummer) sind hier read-only.

const WEEKDAYS = [
  { n: 1, label: "Mo" }, { n: 2, label: "Di" }, { n: 3, label: "Mi" },
  { n: 4, label: "Do" }, { n: 5, label: "Fr" }, { n: 6, label: "Sa" }, { n: 7, label: "So" },
];

export default function TenantSetupSelfCard() {
  const { data, isLoading } = useTenantSetupSelf();
  const save = useSaveTenantSetupSelf();
  const [consent, setConsent] = useState(false);
  const [banner, setBanner] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (data?.ok) {
      setConsent(data.consent.recording_consent_enabled);
      setBanner(data.consent.recording_consent_banner_text ?? "");
      setStart(data.voice_policy.active_hours_start ?? "09:00");
      setEnd(data.voice_policy.active_hours_end ?? "18:00");
      setDays(data.voice_policy.active_days ?? [1, 2, 3, 4, 5]);
    }
  }, [data]);

  if (isLoading) return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Lädt …</div>;
  if (!data?.ok) return null;

  const toggleDay = (n: number) => setDays((d) => d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort());
  const doSave = () => {
    save.mutate({
      consent: { recording_consent_enabled: consent, recording_consent_banner_text: banner || null },
      voice_policy: { active_hours_start: start, active_hours_end: end, active_days: days },
    }, {
      onSuccess: () => toast.success("Telefonie-Einstellungen gespeichert."),
      onError: (e) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e))),
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PhoneCall className="w-4 h-4 text-primary" />
        <h3 className="font-medium text-sm">Telefonie &amp; Assistenz</h3>
        {data.voice_ready
          ? <span className="ml-auto text-xs flex items-center gap-1 text-emerald-600"><CircleCheck className="w-3.5 h-3.5" /> bereit</span>
          : <span className="ml-auto text-xs flex items-center gap-1 text-amber-600"><CircleAlert className="w-3.5 h-3.5" /> Setup offen</span>}
      </div>

      <ul className="grid sm:grid-cols-2 gap-1.5">
        {data.voice_ready_checklist.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-xs">
            {c.ok ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {!data.voice_ready && (
        <p className="text-[11px] text-muted-foreground">Offene Punkte mit dem UseEasy-Team einrichten. Die Aufzeichnungs-Einwilligung und Anrufzeiten kannst du hier selbst setzen.</p>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            <span className="text-sm font-medium text-foreground flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Aufzeichnungs-Einwilligung aktiv</span>
            <span className="block text-xs text-muted-foreground">Pflicht, bevor Anrufe stattfinden dürfen. Nur aktivieren, wenn DSGVO-konform aufgezeichnet wird.</span>
          </span>
        </label>
        <textarea rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={banner} onChange={(e) => setBanner(e.target.value)} placeholder={data.known_values?.default_consent_banner ?? "Ansage-Text (optional)"} />
      </div>

      <div className="border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Anrufzeiten</span>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">Von
            <input type="time" className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">Bis
            <input type="time" className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button key={d.n} type="button" onClick={() => toggleDay(d.n)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${days.includes(d.n) ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button size="sm" onClick={doSave} disabled={save.isPending} className="gap-1.5">
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Speichern
      </Button>
    </div>
  );
}
