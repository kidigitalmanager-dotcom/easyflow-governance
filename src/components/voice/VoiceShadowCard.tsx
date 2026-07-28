/**
 * VoiceShadowCard, v4.157.0 (28.07.2026)
 *
 * Zeigt, wie weit der Sprachassistent davon entfernt ist, einfache Anrufe selbst
 * abzuschliessen. Solange die Messung laeuft, aendert sich nichts am Verhalten:
 * nach jedem Anruf kommt weiterhin eine Rueckfrage.
 *
 * Warum es diese Karte gibt: der Assistent lernt gerade, welche Anrufe er ohne
 * Rueckfrage abschliessen koennte. Nach jedem Anruf rechnet der Server aus, wie
 * er entschieden haette, und vergleicht das mit dem, was danach tatsaechlich
 * passiert ist. Diese Karte ist der Ort, an dem man den Fortschritt sieht, ohne
 * jemanden fragen zu muessen.
 *
 * Ziel sind 50 bestaetigte Faelle je Anliegen-Typ. Bewusst nicht die 400 des
 * E-Mail-Autopiloten: bei einem Anruf hoert ein Mensch das Ergebnis, sieht die
 * Notiz und bestaetigt bewusst. Ein Anruf wiegt schwerer als eine Mail.
 *
 * Zwei Zahlen, zwei Bedeutungen:
 *   "haette selbst abgeschlossen"  = wie viel Arbeit spaeter wegfaellt (Nutzen)
 *   "davon danebengelegen"         = wie oft der Assistent falsch gelegen haette
 * Die zweite Zahl ist die wichtige. Sie entscheidet, ob freigeschaltet wird.
 */
import { Check, Circle, Info } from "lucide-react";
import { useVoiceShadow } from "@/hooks/use-api";
import type { VoiceShadowCoreKey } from "@/lib/api-client";
import { SectionCard, Dot } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Technische Core-Keys in die Sprache der Konsole uebersetzen. */
const ANLIEGEN_LABELS: Record<string, string> = {
  status_fulfillment: "Status & Abwicklung",
  request_order: "Anfrage & Auftrag",
  returns_refund: "Rückgabe & Erstattung",
  billing_payment: "Rechnung & Zahlung",
  contract_legal: "Vertrag & Rechtliches",
  manual_review: "Manuelle Prüfung",
};

/** Warum der Assistent zurückgefragt hätte, in Klartext. */
const GRUND_LABELS: Record<string, string> = {
  hard_blocked_intent: "Thema geht nie ohne Menschen (Vertrag, Zahlung, Prüfung)",
  hard_risk_flag: "Risiko-Kennzeichen am Vorgang",
  critical_keyword: "Kritisches Stichwort im Gespräch (Betrag, Kündigung, Beschwerde)",
  human_requested: "Der Anrufer wollte ausdrücklich einen Menschen",
  low_confidence: "Der Assistent war sich nicht sicher genug",
  unknown_outcome: "Das Gesprächsergebnis war nicht eindeutig",
  outcome_needs_human: "Ergebnis braucht eine Entscheidung (Rückruf, niemand erreicht, Eskalation)",
  outcome_not_closable: "Ergebnis ließ sich nicht abschließen",
};

function anliegen(key: string) {
  return ANLIEGEN_LABELS[key] ?? key;
}

function prozent(v: number | null) {
  // Bewusst kein Gedankenstrich als Platzhalter: "noch offen" sagt, was los ist.
  if (v == null) return "noch offen";
  return `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)} %`;
}

/** Eine Zeile je Anliegen-Typ: Fortschritt zur Schwelle + die beiden Zahlen. */
function AnliegenZeile({ k }: { k: VoiceShadowCoreKey }) {
  const offen = Math.max(0, k.samples_needed - k.samples);
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground">
          {k.threshold_reached
            ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Schwelle erreicht" />
            : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="läuft noch" />}
          <span className="truncate">{anliegen(k.core_key)}</span>
        </span>
        <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
          {k.samples} von {k.samples_needed}
        </span>
      </div>

      <Progress value={k.progress_pct} className="h-1.5" />

      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {k.calls_measured > 0 ? (
          <>
            Der Assistent hätte {k.would_close} von {k.calls_measured}{" "}
            {k.calls_measured === 1 ? "Anruf" : "Anrufen"} selbst abgeschlossen
            {k.samples > 0 ? (
              <>
                {" "}und lag dabei {k.mismatches === 0 ? "kein einziges Mal" : `${k.mismatches}-mal`} daneben
                {k.false_closes > 0 ? `, davon ${k.false_closes}-mal zu forsch` : ""}.
              </>
            ) : (
              <>. Bestätigte Fälle fehlen noch.</>
            )}
            {!k.threshold_reached && offen > 0 ? ` Noch ${offen} bis zur Schwelle.` : ""}
          </>
        ) : (
          <>Noch kein Anruf dieses Typs gemessen.</>
        )}
      </p>
    </li>
  );
}

export function VoiceShadowCard() {
  const { data, isLoading, isError, error } = useVoiceShadow();

  if (isLoading) {
    return (
      <SectionCard title="Reifegrad" subtitle="wie weit der Assistent ist, Anrufe selbst abzuschließen">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 rounded-md" />)}
        </div>
      </SectionCard>
    );
  }

  // Kein Voice gebucht: die Karte gehoert diesem Kunden nicht.
  if (isError && (error as { status?: number })?.status === 403) return null;

  if (isError) {
    return (
      <SectionCard title="Reifegrad" subtitle="wie weit der Assistent ist, Anrufe selbst abzuschließen">
        <QueryErrorNotice label="Der Messstand konnte nicht geladen werden." />
      </SectionCard>
    );
  }

  const keys = data?.core_keys ?? [];
  const t = data?.totals;
  const ziel = data?.min_samples ?? 50;
  const gemessen = t?.calls_measured ?? 0;

  // Der haeufigste Grund, warum zurueckgefragt worden waere. Eine Zahl, die
  // sagt, woran es haengt - nicht acht Zahlen, die niemand liest.
  const topGrund = (data?.hold_reasons ?? [])[0];

  return (
    <SectionCard
      title="Reifegrad"
      subtitle={
        gemessen === 0
          ? "Die Messung läuft. Sie beginnt mit dem nächsten Anruf."
          : `${gemessen} ${gemessen === 1 ? "Anruf" : "Anrufe"} beobachtet, ${t?.samples ?? 0} davon bestätigt`
      }
      action={
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Dot tone="amber" pulse className="!h-1.5 !w-1.5" />
          Beobachtung
        </span>
      }
    >
      {/* Die wichtigste Aussage zuerst: es aendert sich nichts. */}
      <div className="mb-3 flex items-start gap-2 rounded-md border border-line-soft bg-muted/20 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Am Verhalten ändert sich nichts: nach jedem Anruf kommt weiterhin eine Rückfrage.
          Der Assistent rechnet nur mit, wie er entschieden hätte. Erst wenn{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted underline-offset-2">
                {ziel} bestätigte Fälle
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Bestätigt heißt: Sie haben das Anrufergebnis quittiert oder verworfen. Erst dann
              weiß der Assistent, ob er richtig lag. Bei einem aktiven Postfach sind {ziel} Fälle
              typischerweise zwei bis vier Wochen.
            </TooltipContent>
          </Tooltip>{" "}
          je Anliegen-Typ zusammengekommen sind, wird über das Freischalten überhaupt gesprochen.
        </p>
      </div>

      {data?.pending_migration ? (
        <p className="text-[12px] text-muted-foreground">
          Die Messung ist eingebaut, aber noch nicht scharf. Sie startet, sobald die Datenbank
          nachgezogen ist.
        </p>
      ) : keys.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Sobald der Assistent den ersten Anruf geführt hat, steht hier der Fortschritt je
          Anliegen-Typ.
        </p>
      ) : (
        <>
          <ul className="space-y-3.5">
            {keys.map((k) => <AnliegenZeile key={k.core_key} k={k} />)}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line-soft pt-3">
            <div>
              <p className="text-[11px] text-muted-foreground">hätte selbst abgeschlossen</p>
              <p className="text-[15px] font-semibold tabular-nums text-foreground">
                {prozent(t?.would_close_rate ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">so viel Arbeit fiele später weg</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">davon danebengelegen</p>
              <p className="text-[15px] font-semibold tabular-nums text-foreground">
                {prozent(t?.mismatch_rate ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t?.samples ? "muss unter 5 % bleiben" : "noch keine bestätigten Fälle"}
              </p>
            </div>
          </div>

          {topGrund ? (
            <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
              Häufigster Grund für eine Rückfrage:{" "}
              <span className="text-foreground">
                {GRUND_LABELS[topGrund.reason] ?? topGrund.reason}
              </span>{" "}
              ({topGrund.count}×).
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

export default VoiceShadowCard;
