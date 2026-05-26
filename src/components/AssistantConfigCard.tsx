import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAssistantConfig, useSaveAssistantConfig } from "@/hooks/use-api";

type Preset = "patient" | "brisk";

const PRESETS: { id: Preset; title: string; desc: string }[] = [
  { id: "patient", title: "Geduldig", desc: "Erinnert nach 3 Tagen, schließt einen Vorgang nach 2 Wochen." },
  { id: "brisk", title: "Zügig", desc: "Erinnert schon nach 2 Tagen, schließt nach 1 Woche." },
];

/**
 * v4.29.0 (1c): Timeout-Einstellung der persönlichen Operations-Assistenz.
 * Liest/schreibt /v1/dashboard/assistant-config (Preset patient|brisk).
 */
export default function AssistantConfigCard() {
  const { data, isLoading } = useAssistantConfig();
  const save = useSaveAssistantConfig();
  const [preset, setPreset] = useState<Preset>("patient");

  useEffect(() => {
    if (data?.timeout_preset) setPreset(data.timeout_preset);
  }, [data?.timeout_preset]);

  const dirty = data ? preset !== data.timeout_preset : false;

  const onSave = async () => {
    try {
      await save.mutateAsync({ timeout_preset: preset });
      toast.success("Einstellung gespeichert.");
    } catch {
      toast.error("Konnte die Einstellung nicht speichern.");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <h3 className="text-base font-semibold">Wie schnell soll Ihre Assistenz nachfassen?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Wenn ein Kontakt auf eine Mail Ihrer Assistenz nicht antwortet, erinnert sie Sie und schließt
            den Vorgang nach einer Weile automatisch. Wählen Sie das Tempo.
          </p>

          {isLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lädt …
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {PRESETS.map((p) => {
                  const active = preset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      className={`text-left rounded-lg border p-4 transition ${
                        active
                          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                          : "hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        {p.title}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{p.desc}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={onSave} disabled={!dirty || save.isPending}>
                  {save.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Speichern …
                    </>
                  ) : (
                    "Speichern"
                  )}
                </Button>
                {!dirty && data && (
                  <span className="text-xs text-muted-foreground">
                    Aktuell: {preset === "patient" ? "Geduldig" : "Zügig"}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
