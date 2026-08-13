// -----------------------------------------------------------------------------
// TelefonReiter.tsx — die Arbeitsflaeche waehrend eines Anrufs.
//
//   Baustein 2 (12.08.)  Skript-Pane und Einwand-Buttons.
//   Baustein 3 (13.08.)  Waehlleiste: anrufen, hoeren, auflegen.
//   Baustein 4 (13.08.)  Transkript mit Sprechertrennung.
//
// Der Abnahmesatz des Briefings steht damit auf einem Bildschirm: waehlen,
// hoeren, Transkript laufen sehen, Einwand-Buttons sehen.
//
// Was hier NICHT steht, ist Absicht:
//   * Keine Praezedenz. Die steht in `uebernehmeBackend` und wird ueber
//     `standAusRepConfig` genau einmal aufgerufen.
//   * Kein Zustandsautomat fuer Chips und Pin. Der steht in `einwand-panel.ts`
//     und ist dort mit eingefrorener Zeit geprueft.
//   * 🔴 KEIN Timer auf Inhalt. Das war E3, der teuerste Fehler der v1.21:
//     "die Antwort verschwindet, wenn ich sie brauche". Wer hier ein
//     setTimeout auf eine Karte setzt, baut ihn neu.
// -----------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { useRepConfig } from "@/hooks/use-api";
import { standAusRepConfig, bereit, skripteZurAuswahl, skriptFuerGespraech } from "@/lib/telefon-stand";
import {
  LEERES_PANEL, geklickt, bestaetigt, satzGewechselt,
  karte, tastenBelegung, tasteAus, type PanelZustand,
} from "@/lib/einwand-panel";
import { einwandSatzZumSkript } from "@/lib/copilot-config";
import { useTelefon } from "@/hooks/use-telefon";
import { useTranskript } from "@/hooks/use-transkript";
import { Waehlleiste } from "@/components/vertrieb/Waehlleiste";
import { TranskriptPanel } from "@/components/vertrieb/TranskriptPanel";
import { imGespraech as istImGespraech, nummerLesbar } from "@/lib/anruf-zustand";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TerminBlock from "@/components/TerminBlock";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { SectionCard, EmptyState } from "@/components/ue/primitives";
import { AlertTriangle, Check, Pin, Headphones, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** 🔴 Bewusst NICHT am Vertriebler haengend: es ist eine Arbeitsvorliebe
    dieses Browsers, keine Zuweisung. */
const SKRIPT_WAHL = "ue_vertrieb_skript";

export function TelefonReiter({ clientId, repName }: { clientId: string | null; repName?: string | null }) {
  const q = useRepConfig(clientId);

  // 🔴 `null` heisst fuer `uebernehmeBackend` ausdruecklich "der Abruf ist
  // gescheitert" und fuehrt zu einer sichtbaren Meldung. Ein leeres Objekt
  // hiesse "es gibt nichts" — das ist etwas anderes und war E5.
  const stand = useMemo(
    () => standAusRepConfig(q.isError ? null : (q.data ?? null)),
    [q.data, q.isError],
  );

  const [phase, setPhase] = useState(0);
  const [panel, setPanel] = useState<PanelZustand>(LEERES_PANEL);

  // Baustein 3: das Telefon. Baustein 4: das Transkript, das am Gespraech
  // haengt — nicht am Reiter. Wer auflegt, beendet auch den Mitschnitt.
  const tel = useTelefon(clientId);
  const imGespraech = istImGespraech(tel.zustand);
  const transkript = useTranskript(clientId, imGespraech, tel.gegenstelle);

  // Leon 13.08. Punkt 3: welches Skript gilt fuer DIESES Gespraech.
  // 🔴 Nur lokal. Die Zuweisung bleibt, wo sie ist — siehe telefon-stand.ts.
  const [skriptWahl, setSkriptWahl] = useState<string | null>(() => {
    try { return window.localStorage.getItem(SKRIPT_WAHL) ; } catch { return null; }
  });
  const waehleSkript = (id: string | null) => {
    setSkriptWahl(id);
    try {
      if (id) window.localStorage.setItem(SKRIPT_WAHL, id);
      else window.localStorage.removeItem(SKRIPT_WAHL);
    } catch { /* privater Modus */ }
  };

  // Leon 13.08. Punkt 4: Termin aus dem Gespraech.
  const [terminOffen, setTerminOffen] = useState(false);

  const wahl = useMemo(() => skriptFuerGespraech(stand, skriptWahl), [stand, skriptWahl]);
  const skript = wahl.skript;
  const satz = stand.satz;
  const belegung = useMemo(() => tastenBelegung(satz), [satz]);

  // Der Einwand-Satz folgt dem Skript, nie umgekehrt. Wechselt der Satz, gilt
  // die Regel aus dem v1.22-Umbau: der Pin ueberlebt, Chips ohne passenden
  // Schluessel nicht.
  const bindung = useMemo(
    () => einwandSatzZumSkript(stand.zustand.einwaende, skript),
    [stand.zustand.einwaende, skript],
  );
  useEffect(() => { setPanel((p) => satzGewechselt(p, satz)); }, [satz]);
  useEffect(() => { setPhase(0); }, [skript?.id]);

  useEffect(() => {
    const auf = (ev: KeyboardEvent) => {
      const t = tasteAus({
        key: ev.key, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey,
        target: ev.target as unknown as { tagName?: string; isContentEditable?: boolean } | null,
      });
      if (!t) return;
      if (t.art === "bestaetigen") { ev.preventDefault(); setPanel(bestaetigt); return; }
      const key = belegung.get(t.taste);
      if (!key) return;
      ev.preventDefault();
      setPanel((p) => geklickt(p, key, Date.now()));
    };
    window.addEventListener("keydown", auf);
    return () => window.removeEventListener("keydown", auf);
  }, [belegung]);

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        {/* 🔴 Die Waehlleiste wartet NICHT auf das Skript. Telefonieren muss
            gehen, auch wenn die Skript-Route hakt. */}
        <Waehlleiste
          zustand={tel.zustand} waehle={tel.waehle} auflegen={tel.auflegen}
          quittieren={tel.quittieren} stumm={tel.stumm} stummSchalten={tel.stummSchalten}
          repName={repName}
        />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.05fr_1fr_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="hidden h-72 w-full xl:block" />
        </div>
      </div>
    );
  }

  if (!clientId) {
    return (
      <SectionCard title="Telefon">
        <EmptyState
          icon={<Headphones className="h-7 w-7" />}
          title="Erst wählen, als wer du arbeitest"
          description="Skript und Einwände hängen am Vertriebler. Oben steht die Auswahl; sie wird gemerkt."
        />
      </SectionCard>
    );
  }

  const gepinnt = karte(satz, panel.gepinnt);
  const angezeigt = gepinnt ?? karte(satz, panel.erkannt);
  const phasen = skript?.phases ?? [];
  const aktuellePhase = phasen[Math.min(phase, Math.max(phasen.length - 1, 0))] ?? null;

  return (
    <div className="space-y-4">
      <Waehlleiste
        zustand={tel.zustand} waehle={tel.waehle} auflegen={tel.auflegen}
        quittieren={tel.quittieren} stumm={tel.stumm} stummSchalten={tel.stummSchalten}
        repName={repName}
        aufTermin={() => setTerminOffen(true)}
      />

      {/* Leon 13.08. Punkt 4: der Termin entsteht im Gespraech, nicht danach
          in einem anderen Reiter. Vorbelegt mit dem, was gerade laeuft. */}
      <Dialog open={terminOffen} onOpenChange={setTerminOffen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Termin aus diesem Gespräch</DialogTitle>
          </DialogHeader>
          <TerminBlock
            repId={clientId}
            betreffVorschlag={
              tel.zustand.nummer ? `Termin nach Telefonat ${nummerLesbar(tel.zustand.nummer)}` : undefined
            }
          />
        </DialogContent>
      </Dialog>

      {q.isError && (
        <QueryErrorNotice
          label="Skript und Einwände konnten nicht geladen werden."
          onRetry={() => { void q.refetch(); }}
          retrying={q.isFetching}
        />
      )}

      {stand.meldung && !q.isError && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-500">
          {stand.meldung}
        </p>
      )}

      {/* 🔴 Der Fall Kerim: das Cockpit zeigte eine leere Phase klaglos an, er
          telefonierte ab dem 23.07. faktisch ohne Skript. Ein leerer Stand
          muss sich melden, bevor jemand zum Hoerer greift. */}
      {stand.befunde.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12.5px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            {stand.befunde.map((b) => <p key={b}>{b}</p>)}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.05fr_1fr_1fr]">
        {/* ── Skript ──────────────────────────────────────────────────────── */}
        <SectionCard
          title={skript ? skript.name : "Skript"}
          subtitle={
            skript
              ? `Phase ${Math.min(phase + 1, phasen.length)} von ${phasen.length}${repName ? ` · ${repName}` : ""}`
              : "Für diesen Vertriebler ist kein Skript hinterlegt."
          }
          action={
            phasen.length > 1 || skripteZurAuswahl(stand).length > 1 ? (
              <div className="flex items-center gap-1">
                {/* Leon 13.08. Punkt 3. Nur fuer dieses Gespraech — die
                    Zuweisung aendert sich dadurch nicht. */}
                {skripteZurAuswahl(stand).length > 1 && (
                  <select
                    value={wahl.skript?.id ?? ""}
                    onChange={(e) => waehleSkript(e.target.value || null)}
                    aria-label="Skript für dieses Gespräch"
                    className="mr-1 max-w-[11rem] rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px]"
                  >
                    {skripteZurAuswahl(stand).map((sk) => (
                      <option key={sk.id} value={sk.id}>
                        {sk.name}{wahl.zugewiesen?.id === sk.id ? " (zugewiesen)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {phasen.length > 1 && (
                  <>
                    <Button variant="outline" size="sm" className="h-7" disabled={phase === 0}
                      onClick={() => setPhase((p) => Math.max(0, p - 1))}>zurück</Button>
                    <Button variant="outline" size="sm" className="h-7" disabled={phase >= phasen.length - 1}
                      onClick={() => setPhase((p) => Math.min(phasen.length - 1, p + 1))}>
                      weiter <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ) : null
          }
        >
          {wahl.abweichend && (
            <p className="mx-4 mt-4 rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-[11.5px] text-amber">
              Nur für dieses Gespräch. Zugewiesen ist „{wahl.zugewiesen?.name}".
            </p>
          )}
          {phasen.length === 0 ? (
            <EmptyState
              title="Kein Skript geladen"
              description="Skripte werden unter System, Voice & Co-Pilot, Skripte & Einwände zugewiesen."
            />
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {phasen.map((p, i) => (
                  <button
                    key={p.id || i}
                    type="button"
                    onClick={() => setPhase(i)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      i === phase
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.label || `Phase ${i + 1}`}
                  </button>
                ))}
              </div>
              <div className="rounded-md border border-line-soft bg-muted/30 p-3">
                {String(aktuellePhase?.text ?? "").trim() ? (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
                    {aktuellePhase?.text}
                  </p>
                ) : (
                  // Fehler ist nicht leer, und leer ist nicht "gleich weiter".
                  <p className="text-[12.5px] text-amber-500">
                    Diese Phase hat keinen Text. Sie steht so im hinterlegten Skript.
                  </p>
                )}
                {aktuellePhase?.goal ? (
                  <p className="mt-2 border-t border-line-soft pt-2 text-[11.5px] text-muted-foreground">
                    Ziel: {aktuellePhase.goal}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Transkript ──────────────────────────────────────────────────── */}
        <TranskriptPanel t={transkript} repName={repName} imGespraech={imGespraech} />

        {/* ── Einwände ────────────────────────────────────────────────────── */}
        <SectionCard
          title="Einwände"
          subtitle={
            satz
              ? `${satz.name}${bindung.gewechselt ? " (folgt dem Skript)" : ""} · Taste drücken, Enter erledigt`
              : "Kein Einwand-Satz hinterlegt."
          }
        >
          <div className="space-y-3 p-4">
            {/* Die gepinnte oder erkannte Antwort. Ohne Auto-Hide. */}
            {angezeigt ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-foreground">{angezeigt.label}</p>
                  {gepinnt ? (
                    <Button variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-[11px]"
                      onClick={() => setPanel(bestaetigt)}>
                      <Check className="mr-1 h-3 w-3" /> erledigt
                    </Button>
                  ) : (
                    <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {angezeigt.response}
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                {bereit(stand)
                  ? "Taste drücken oder Knopf wählen — die Antwort bleibt stehen, bis du sie mit Enter erledigst."
                  : "Ohne Einwand-Satz bleibt die Erkennung aus."}
              </p>
            )}

            {/* Chip-Historie: hoechstens drei, neueste zuerst. */}
            {panel.chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {panel.chips.map((k) => {
                  const c = karte(satz, k);
                  if (!c) return null;
                  return (
                    <button key={k} type="button"
                      onClick={() => setPanel((p) => geklickt(p, k, Date.now()))}
                      className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Die Knoepfe selbst. */}
            <div className="grid grid-cols-2 gap-1.5">
              {(satz?.objections ?? []).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setPanel((p) => geklickt(p, o.key, Date.now()))}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors",
                    panel.gepinnt === o.key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-primary/35 hover:text-foreground",
                  )}
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold tabular">
                    {o.hotkey || "–"}
                  </span>
                  <span className="min-w-0 truncate">{o.label}</span>
                </button>
              ))}
            </div>

            {panel.verlauf.length > panel.chips.length && (
              <details className="text-[11.5px] text-muted-foreground">
                <summary className="cursor-pointer">Verlauf ({panel.verlauf.length})</summary>
                <ul className="mt-1.5 space-y-0.5">
                  {panel.verlauf.map((k) => {
                    const c = karte(satz, k);
                    return c ? <li key={k}>{c.label}</li> : null;
                  })}
                </ul>
              </details>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default TelefonReiter;
