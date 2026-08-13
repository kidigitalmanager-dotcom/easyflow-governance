// -----------------------------------------------------------------------------
// SkriptEditor.tsx — einzelne Phasen und Einwaende bearbeiten.
//
// Leon, 13.08.: "es gibt keinen skript editor, dass du einzelne phasen oder
// einwaende bearbeiten kannst. Unter einstellung kannst du nur skripte
// zuweisen und hochladen aber auch nicht einzelnd bearbeiten wie im co
// piloten". Stimmt, und es ist ein Verlust gegenueber dem Co-Pilot.
//
// 🔴 Alle Regeln stehen in skript-editor.ts und sind dort mit zehn Mutationen
// geprueft. Hier steht nur die Bedienung. Was diese Datei NICHT tut:
//   * Sie speichert nicht, wenn `darfSpeichern` nein sagt.
//   * Sie zeigt vor dem Speichern, WAS geschrieben wird. Ein Haken ohne
//     Aufzaehlung ist die Sorte Rueckmeldung, nach der niemand merkt, dass
//     etwas fehlt.
//   * Sie laesst den Einwand-Schluessel nicht anfassen (E14).
// -----------------------------------------------------------------------------
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/ue/primitives";
import { saveRepConfig } from "@/lib/api-client";
import type { EinwandSatz, Skript } from "@/lib/copilot-config";
import type { TelefonStand } from "@/lib/telefon-stand";
import {
  darfSpeichern, phaseGesetzt, einwandGesetzt, ersetzeSkript, ersetzeSatz,
  aenderungen, aenderungenSatz, befundeSatz, befundeSkript,
} from "@/lib/skript-editor";
import { AlertTriangle, Check, Loader2, Lock, Save, X } from "lucide-react";
import { toast } from "sonner";

export function SkriptEditor({
  clientId, stand, skript, satz, aufSchliessen, aktor,
}: {
  clientId: string;
  stand: TelefonStand;
  /** Genau eines von beiden. */
  skript?: Skript | null;
  satz?: EinwandSatz | null;
  aufSchliessen: () => void;
  aktor?: string | null;
}) {
  const qc = useQueryClient();
  const [entwurfSkript, setEntwurfSkript] = useState<Skript | null>(skript ?? null);
  const [entwurfSatz, setEntwurfSatz] = useState<EinwandSatz | null>(satz ?? null);
  const [pruefen, setPruefen] = useState(false);

  const freigabe = darfSpeichern(stand);

  const speichern = useMutation({
    mutationFn: async () => {
      if (entwurfSkript) {
        const bib = ersetzeSkript(stand.zustand, entwurfSkript);
        // 🔴 null heisst: die id steht nicht in der Bibliothek. Dann wird
        // NICHT angehaengt — ein Skript, das ploetzlich zweimal existiert,
        // ist schlimmer als eine Fehlermeldung.
        if (!bib) throw new Error("Dieses Skript steht nicht in der Bibliothek. Bitte neu laden.");
        return saveRepConfig(clientId, { scripts: bib, updated_by: `Konsole (${aktor || "Vertrieb"})` });
      }
      if (entwurfSatz) {
        const bib = ersetzeSatz(stand.zustand, entwurfSatz);
        if (!bib) throw new Error("Dieser Einwand-Satz steht nicht in der Bibliothek. Bitte neu laden.");
        return saveRepConfig(clientId, { objections: bib, updated_by: `Konsole (${aktor || "Vertrieb"})` });
      }
      throw new Error("Nichts zu speichern.");
    },
    onSuccess: () => {
      toast.success("Gespeichert.");
      void qc.invalidateQueries({ queryKey: ["rep-config"] });
      aufSchliessen();
    },
    onError: (e: unknown) => {
      // 🔴 Der Fehler wird benannt, nicht verschluckt (E5).
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    },
  });

  const liste = entwurfSkript
    ? aenderungen(skript ?? null, entwurfSkript)
    : aenderungenSatz(satz ?? null, entwurfSatz);
  const befunde = entwurfSkript
    ? befundeSkript(entwurfSkript)
    : entwurfSatz ? befundeSatz(entwurfSatz) : [];

  // ── Gesperrt: der Grund steht da, nicht ein ausgegrauter Knopf ──────────
  if (!freigabe.ja) {
    return (
      <SectionCard title={skript ? `${skript.name} bearbeiten` : `${satz?.name} bearbeiten`}
        action={<Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={aufSchliessen}>schließen</Button>}>
        <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber/5 px-3 py-2.5 text-[12.5px] text-amber">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{freigabe.grund}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={entwurfSkript ? `${entwurfSkript.name} bearbeiten` : `${entwurfSatz?.name} bearbeiten`}
      subtitle="Änderungen gelten für diesen Vertriebler. Die Zuweisung bleibt, wie sie ist."
      action={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={aufSchliessen}>
            <X className="mr-1 h-3 w-3" /> verwerfen
          </Button>
          <Button size="sm" className="h-7 px-2 text-[11px]"
            disabled={liste.length === 0 || speichern.isPending}
            onClick={() => setPruefen(true)}>
            <Save className="mr-1 h-3 w-3" /> speichern
          </Button>
        </div>
      }
      bodyClassName="p-0"
    >
      {/* ── Der Bestätigungsschritt ────────────────────────────────────── */}
      {pruefen && (
        <div className="border-b border-line-soft bg-muted/40 p-4">
          <p className="text-[12.5px] font-semibold text-foreground">Das wird geschrieben:</p>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
            {liste.map((z) => <li key={z}>· {z}</li>)}
          </ul>
          {befunde.length > 0 && (
            <div className="mt-2.5 flex items-start gap-2 rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] text-amber">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                {befunde.map((b) => <p key={b}>{b}</p>)}
                {/* Kein Riegel: es kann Absicht sein. Aber es steht da. */}
                <p className="mt-1 opacity-80">Speichern geht trotzdem — es steht hier, damit es niemanden überrascht.</p>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" className="h-8" disabled={speichern.isPending}
              onClick={() => speichern.mutate()}>
              {speichern.isPending
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> speichert</>
                : <><Check className="mr-1.5 h-3.5 w-3.5" /> ja, so schreiben</>}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setPruefen(false)}
              disabled={speichern.isPending}>zurück</Button>
          </div>
        </div>
      )}

      <div className="space-y-4 p-4">
        {/* ── Skript ────────────────────────────────────────────────────── */}
        {entwurfSkript && (
          <>
            <Feld label="Name des Skripts">
              <Input value={entwurfSkript.name} className="h-8"
                onChange={(e) => setEntwurfSkript({ ...entwurfSkript, name: e.target.value })} />
            </Feld>
            {entwurfSkript.phases.map((p, i) => (
              <div key={p.id} className="rounded-md border border-line-soft bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="tabular inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold">
                    {i + 1}
                  </span>
                  <Input value={p.label} className="h-8" placeholder="Beschriftung der Phase"
                    onChange={(e) => setEntwurfSkript(phaseGesetzt(entwurfSkript, p.id, { label: e.target.value }))} />
                </div>
                <Textarea
                  value={p.text} rows={4} placeholder="Sprechtext"
                  className="text-[13px] leading-relaxed"
                  onChange={(e) => setEntwurfSkript(phaseGesetzt(entwurfSkript, p.id, { text: e.target.value }))}
                />
                <Input value={p.goal ?? ""} className="mt-2 h-8 text-[12px]" placeholder="Ziel dieser Phase (optional)"
                  onChange={(e) => setEntwurfSkript(phaseGesetzt(entwurfSkript, p.id, { goal: e.target.value }))} />
              </div>
            ))}
          </>
        )}

        {/* ── Einwände ──────────────────────────────────────────────────── */}
        {entwurfSatz && (
          <>
            <Feld label="Name des Satzes">
              <Input value={entwurfSatz.name} className="h-8"
                onChange={(e) => setEntwurfSatz({ ...entwurfSatz, name: e.target.value })} />
            </Feld>
            {entwurfSatz.objections.map((o) => (
              <div key={o.key} className="rounded-md border border-line-soft bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input value={o.hotkey ?? ""} className="h-8 w-12 text-center tabular" maxLength={1} aria-label="Taste"
                    onChange={(e) => setEntwurfSatz(einwandGesetzt(entwurfSatz, o.key, { hotkey: e.target.value }))} />
                  <Input value={o.label} className="h-8" placeholder="Beschriftung"
                    onChange={(e) => setEntwurfSatz(einwandGesetzt(entwurfSatz, o.key, { label: e.target.value }))} />
                </div>
                <Textarea
                  value={o.response} rows={3} placeholder="Antwort, die im Gespräch erscheint"
                  className="text-[13px] leading-relaxed"
                  onChange={(e) => setEntwurfSatz(einwandGesetzt(entwurfSatz, o.key, { response: e.target.value }))}
                />
                {/* 🔴 Der Schluessel wird gezeigt, aber nicht bearbeitet: an ihm
                    haengen Pin, Chips und die Erkennung. Ein wandernder
                    Schluessel liess im Juli die gepinnte Antwort mitten im
                    Gespraech verschwinden. */}
                <p className="mt-1.5 text-[11px] text-tx-weak">Schlüssel {o.key} · fest, daran hängt die Erkennung</p>
              </div>
            ))}
          </>
        )}
      </div>
    </SectionCard>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-tx-weak">{label}</p>
      {children}
    </div>
  );
}

export default SkriptEditor;
