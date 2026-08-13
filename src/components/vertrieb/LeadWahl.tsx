// -----------------------------------------------------------------------------
// LeadWahl.tsx — den Lead anklicken statt die Nummer abtippen.
//
// Leon, 13.08.: "man muss manuell die nummer eintragen, waehrend man im co
// pilot einfach auf das lead klick konnte um den anruf zu starten" und "Lead
// listen sind nicht aufklappbar mit website, notizen, die waehrend des anrufs
// sichtbar bleiben".
//
// Daraus folgen zwei Zustaende, und der zweite ist der wichtige:
//
//   * KEIN Lead gewaehlt -> die Liste, durchsuchbar, ein Klick waehlt aus.
//   * Ein Lead gewaehlt   -> seine Karte, aufgeklappt, mit allem was man im
//     Gespraech braucht. 🔴 Sie bleibt stehen, waehrend telefoniert wird.
//     Genau das fehlte: wer im Co-Piloten den Lead anklickte, hatte die
//     Website und die Notizen die ganze Zeit vor sich.
//
// Die Entscheidungen (welche Nummer, ob eine Adresse anklickbar ist, was die
// Suche findet) stehen in lead-wahl.ts und sind dort geprueft.
// -----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, EmptyState } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { useOffeneLeads } from "@/hooks/use-api";
import {
  nummerFuer, anrufbar, websiteLink, websiteText, suchen, leadZeile, leadUnterzeile,
  type Lead,
} from "@/lib/lead-wahl";
import { nummerLesbar } from "@/lib/anruf-zustand";
import {
  Phone, Search, ExternalLink, Users, ChevronLeft, StickyNote, Mail, Building2, RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function LeadWahl({
  repId, gewaehlt, aufWaehlen, aufAnrufen, laeuft,
}: {
  repId: string | null;
  gewaehlt: Lead | null;
  aufWaehlen: (lead: Lead | null) => void;
  /** Nummer waehlen. Bekommt den Lead mit, damit der Anruf zugeordnet wird. */
  aufAnrufen: (lead: Lead, e164: string) => void;
  /** Laeuft gerade ein Gespraech? Dann wird nicht umgewaehlt. */
  laeuft: boolean;
}) {
  const q = useOffeneLeads(repId);
  const [frage, setFrage] = useState("");

  const alle: Lead[] = useMemo(() => (q.data?.leads ?? []) as Lead[], [q.data]);
  const gefiltert = useMemo(() => suchen(alle, frage), [alle, frage]);

  // ── Ein Lead ist gewaehlt: seine Karte, und die bleibt ──────────────────
  if (gewaehlt) {
    const n = nummerFuer(gewaehlt);
    const link = websiteLink(gewaehlt.website);
    return (
      <SectionCard
        title={leadZeile(gewaehlt)}
        subtitle={leadUnterzeile(gewaehlt) || "Kein Entscheider hinterlegt."}
        action={
          <Button
            variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
            onClick={() => aufWaehlen(null)}
            disabled={laeuft}
            title={laeuft ? "Erst auflegen, dann den Lead wechseln" : "Anderen Lead wählen"}
          >
            <ChevronLeft className="mr-1 h-3 w-3" /> anderer Lead
          </Button>
        }
        bodyClassName="p-0"
      >
        <div className="grid gap-x-6 gap-y-2.5 p-4 sm:grid-cols-2">
          {/* Nummer und Anruf */}
          <div className="space-y-2">
            <Feld icon={<Phone className="h-3.5 w-3.5" />} label="Telefon">
              {n.e164 ? (
                <span className="tabular">
                  {nummerLesbar(n.e164)}
                  {/* 🔴 Woher die Nummer kommt, wird gesagt: die Zentrale
                      landet beim Gatekeeper, die Durchwahl nicht. */}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {n.herkunft === "zentrale" ? "Zentrale" : "Durchwahl"}
                  </span>
                </span>
              ) : (
                <span className="text-amber">Keine brauchbare Nummer hinterlegt.</span>
              )}
            </Feld>
            {n.e164 && !laeuft && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" className="h-8 gap-1.5" onClick={() => aufAnrufen(gewaehlt, n.e164!)}>
                  <Phone className="h-3.5 w-3.5" /> anrufen
                </Button>
                {n.zweite && (
                  <Button
                    size="sm" variant="outline" className="h-8 gap-1.5"
                    onClick={() => aufAnrufen(gewaehlt, n.zweite!.e164)}
                    title={nummerLesbar(n.zweite.e164)}
                  >
                    über die {n.zweite.herkunft === "zentrale" ? "Zentrale" : "Durchwahl"}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {link && (
              <Feld icon={<ExternalLink className="h-3.5 w-3.5" />} label="Website">
                {/* rel: die Adresse stammt aus einer hochgeladenen Tabelle. */}
                <a
                  href={link} target="_blank" rel="noreferrer noopener"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {websiteText(gewaehlt.website)}
                </a>
              </Feld>
            )}
            {gewaehlt.email && (
              <Feld icon={<Mail className="h-3.5 w-3.5" />} label="E-Mail">{gewaehlt.email}</Feld>
            )}
            {(gewaehlt.branche || gewaehlt.stadt) && (
              <Feld icon={<Building2 className="h-3.5 w-3.5" />} label="Ort und Branche">
                {[gewaehlt.stadt, gewaehlt.branche].filter(Boolean).join(" · ")}
              </Feld>
            )}
          </div>

          {/* 🔴 Notizen ueber die volle Breite: das ist der Text, den man im
              Gespraech liest, nicht eine Fussnote. */}
          {String(gewaehlt.notizen ?? "").trim() && (
            <div className="sm:col-span-2">
              <Feld icon={<StickyNote className="h-3.5 w-3.5" />} label="Notizen">
                <span className="whitespace-pre-wrap">{gewaehlt.notizen}</span>
              </Feld>
            </div>
          )}
        </div>
      </SectionCard>
    );
  }

  // ── Kein Lead gewaehlt: die Liste ───────────────────────────────────────
  return (
    <SectionCard
      title="Leads"
      subtitle={
        q.data?.gesamt !== undefined
          ? `${q.data.gesamt} noch nicht angerufen${gefiltert.length !== alle.length ? ` · ${gefiltert.length} gefunden` : ""}`
          : "Die noch nicht angerufenen Leads deiner Listen."
      }
      action={
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]"
          onClick={() => { void q.refetch(); }} disabled={q.isFetching}>
          <RotateCw className={cn("mr-1 h-3 w-3", q.isFetching && "animate-spin")} /> neu laden
        </Button>
      }
      bodyClassName="p-0"
    >
      {q.isError && (
        <div className="p-4">
          <QueryErrorNotice
            label="Die Leads konnten nicht geladen werden."
            onRetry={() => { void q.refetch(); }}
            retrying={q.isFetching}
          />
        </div>
      )}

      {!repId ? (
        <div className="p-4">
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="Erst wählen, als wer du arbeitest"
            description="Die Leads hängen an den Listen, die diesem Vertriebler zugewiesen sind."
          />
        </div>
      ) : q.isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : (
        <>
          <div className="border-b border-line-soft p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={frage}
                onChange={(e) => setFrage(e.target.value)}
                placeholder="Name, Ort, Entscheider, Notiz …"
                className="h-8 pl-8 text-[12.5px]"
                aria-label="Leads durchsuchen"
              />
            </div>
          </div>

          {gefiltert.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={alle.length === 0 ? "Nichts mehr offen" : "Kein Treffer"}
                description={
                  alle.length === 0
                    ? "In deinen Listen ist jeder Lead schon einmal angefasst worden."
                    : "Kein Lead passt zu dieser Suche."
                }
              />
            </div>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-line-soft overflow-y-auto">
              {gefiltert.map((l) => {
                const kann = anrufbar(l);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => aufWaehlen(l)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <Phone className={cn("h-3.5 w-3.5 shrink-0", kann ? "text-primary" : "text-tx-weak")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">{leadZeile(l)}</span>
                        {leadUnterzeile(l) && (
                          <span className="block truncate text-[11.5px] text-muted-foreground">{leadUnterzeile(l)}</span>
                        )}
                      </span>
                      {/* 🔴 Ohne Nummer wird der Lead nicht versteckt — er wird
                          als das gezeigt, was er ist. Verstecken hiesse, dass
                          niemand die Luecke je bemerkt. */}
                      {!kann && <span className="shrink-0 text-[11px] text-amber">keine Nummer</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}

function Feld({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-tx-weak">{label}</span>
        <span className="block text-foreground">{children}</span>
      </span>
    </div>
  );
}

export default LeadWahl;
