// -----------------------------------------------------------------------------
// MeineSkripte.tsx — die Arbeits-Linse auf Skripte und Einwaende.
//
// 🔴 Dieselbe Quelle, zwei Linsen. `CoPilotScriptsTab` unter System bleibt die
// PFLEGE-Seite: Bibliothek, Zuweisen, "selbst angelegt"-Badge, Sicht ueber
// alle Vertriebler. Hier steht nur die eine Frage, die im Betrieb zaehlt:
// **womit telefoniere ICH gerade?**
//
// Nur Lesen, mit Absicht. Ein zweiter Editor waere ein zweiter Weg, auf dem
// Einwaende verschwinden koennen — und genau das darf nie wieder passieren.
// -----------------------------------------------------------------------------
import { useMemo } from "react";
import { useRepConfig } from "@/hooks/use-api";
import { standAusRepConfig } from "@/lib/telefon-stand";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { SectionCard, EmptyState } from "@/components/ue/primitives";
import { BookOpenCheck, AlertTriangle, Check } from "lucide-react";

export function MeineSkripte({ clientId, repName }: { clientId: string | null; repName?: string | null }) {
  const q = useRepConfig(clientId);
  const stand = useMemo(
    () => standAusRepConfig(q.isError ? null : (q.data ?? null)),
    [q.data, q.isError],
  );

  if (!clientId) {
    return (
      <SectionCard title="Skripte & Einwände">
        <EmptyState
          icon={<BookOpenCheck className="h-7 w-7" />}
          title="Erst wählen, als wer du arbeitest"
          description="Skripte hängen am Vertriebler. Oben steht die Auswahl."
        />
      </SectionCard>
    );
  }

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;

  if (q.isError) {
    return (
      <QueryErrorNotice
        label="Skripte und Einwände konnten nicht geladen werden."
        onRetry={() => { void q.refetch(); }}
        retrying={q.isFetching}
      />
    );
  }

  const skripte = stand.zustand.skripte?.library ?? [];
  const saetze = stand.zustand.einwaende?.library ?? [];

  return (
    <div className="space-y-4">
      {stand.befunde.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[12.5px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">{stand.befunde.map((b) => <p key={b}>{b}</p>)}</div>
        </div>
      )}

      <SectionCard
        title="Skripte"
        subtitle={
          stand.skript
            ? `Aktiv: ${stand.skript.name}${repName ? ` · ${repName}` : ""}`
            : "Kein Skript aktiv."
        }
      >
        {skripte.length === 0 ? (
          <EmptyState
            title="Kein Skript hinterlegt"
            description="Zugewiesen wird unter System, Voice & Co-Pilot, Skripte & Einwände."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {skripte.map((s) => {
              const leer = s.phases.filter((p) => !String(p?.text ?? "").trim()).length;
              const aktiv = s.id === stand.skript?.id;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {aktiv && <Check className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {s.phases.length} {s.phases.length === 1 ? "Phase" : "Phasen"}
                      {leer > 0 && <span className="text-amber-500"> · {leer} ohne Text</span>}
                    </p>
                  </div>
                  {aktiv && (
                    <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      aktiv
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Einwände"
        subtitle={
          stand.satz
            ? `Aktiv: ${stand.satz.name} · ${stand.satz.objections.length} Einwände`
            : "Kein Einwand-Satz aktiv. Die Erkennung bleibt damit aus."
        }
      >
        {saetze.length === 0 ? (
          <EmptyState
            title="Kein Einwand-Satz hinterlegt"
            description="Ohne Einwände bleibt die Erkennung im Gespräch aus."
          />
        ) : (
          <div className="space-y-3 p-4">
            {stand.satz && (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {stand.satz.objections.map((o) => (
                  <div key={o.key} className="flex items-start gap-2 rounded-md border border-line-soft bg-muted/30 px-2.5 py-2">
                    <span className="tabular mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] font-semibold">
                      {o.hotkey || "–"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-foreground">{o.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                        {o.response}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {saetze.length > 1 && (
              <p className="text-[11.5px] text-muted-foreground">
                {saetze.length} Sätze hinterlegt. Der Satz folgt dem Skript, nie umgekehrt.
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default MeineSkripte;
