/**
 * VoiceReadinessCard, v4.156.0 (28.07.2026)
 *
 * Zeigt in Klartext, was dem Sprachassistenten noch zum ersten Anruf fehlt,
 * und holt fehlende Einrichtungsschritte auf Knopfdruck nach.
 *
 * Warum es diese Karte gibt: Bis v4.155.0 endete ein Voice-Kauf bei einem
 * Datenbankfeld, das kein Anruf-Pfad liest. Zwischen "bezahlt" und
 * "telefoniert" lagen zehn Schritte im Super-Admin, und der Kunde erfuhr davon
 * nur durch eine Mail mit "wir melden uns". Der Kauf-Webhook erledigt die
 * Schritte jetzt selbst; diese Karte ist fuer alle, die vorher gekauft haben,
 * und fuer den Fall, dass jemand etwas ausgeschaltet hat.
 *
 * Die Rufnummer bleibt bewusst ein eigener Klick: sie kostet Geld und der Kunde
 * soll die Vorwahl waehlen. Deshalb verlinkt der offene Schritt dorthin, statt
 * still im Hintergrund eine Nummer zu kaufen.
 */
import { useState } from "react";
import { Check, Circle, Loader2, PhoneCall } from "lucide-react";
import { useVoiceReadiness, useRunVoiceSetup } from "@/hooks/use-api";
import type { VoiceReadinessStep } from "@/lib/api-client";
import { SectionCard, Dot } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function VoiceReadinessCard({ onGoToNumbers }: { onGoToNumbers?: () => void }) {
  const [justRan, setJustRan] = useState(false);
  const { data, isLoading, isError, error } = useVoiceReadiness();
  const setup = useRunVoiceSetup();

  if (isLoading) {
    return (
      <SectionCard title="Bereitschaft" subtitle="was Ihr Sprachassistent noch braucht">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 rounded-md" />)}
        </div>
      </SectionCard>
    );
  }

  // Kein Voice gebucht: die Karte gehoert diesem Kunden nicht.
  if (isError && (error as { status?: number })?.status === 403) return null;

  if (isError) {
    return (
      <SectionCard title="Bereitschaft" subtitle="was Ihr Sprachassistent noch braucht">
        <QueryErrorNotice label="Der Einrichtungsstand konnte nicht geladen werden." />
      </SectionCard>
    );
  }

  const steps: VoiceReadinessStep[] = data?.steps ?? [];
  const offen = steps.filter((s) => !s.ok);
  const nurNummerOffen = offen.length > 0 && offen.every((s) => s.key.startsWith("rufnummer"));

  return (
    <SectionCard
      title="Bereitschaft"
      subtitle={
        data?.ready
          ? "Ihr Sprachassistent ist einsatzbereit"
          : nurNummerOffen
            ? "Es fehlt nur noch die Rufnummer"
            : `${offen.length} ${offen.length === 1 ? "Schritt fehlt" : "Schritte fehlen"} bis zum ersten Anruf`
      }
      action={
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Dot tone={data?.ready ? "emerald" : nurNummerOffen ? "amber" : "muted"} pulse={!data?.ready} className="!h-1.5 !w-1.5" />
          {data?.ready ? "bereit" : "in Einrichtung"}
        </span>
      }
    >
      <ol className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            {s.ok
              ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="erledigt" />
              : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="offen" />}
            <div className="min-w-0">
              <p className={"text-[13px] leading-snug " + (s.ok ? "text-muted-foreground" : "text-foreground")}>
                {s.label}
              </p>
              {s.hint ? <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{s.hint}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      {!data?.ready ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Alles ausser der Rufnummer kann die Console selbst herstellen. */}
          {!nurNummerOffen ? (
            <Button size="sm" onClick={() => setup.mutate(undefined, { onSuccess: () => setJustRan(true) })} disabled={setup.isPending}>
              {setup.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Jetzt einrichten
            </Button>
          ) : null}
          {offen.some((s) => s.key.startsWith("rufnummer")) && onGoToNumbers ? (
            <Button size="sm" variant={nurNummerOffen ? "default" : "outline"} onClick={onGoToNumbers}>
              <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
              Rufnummer aussuchen
            </Button>
          ) : null}
          {setup.isError ? (
            <span className="text-[11.5px] text-amber">
              Die Einrichtung ist nicht durchgelaufen. Versuchen Sie es erneut, oder melden Sie sich bei uns.
            </span>
          ) : null}
        </div>
      ) : null}

      {justRan && data?.ready ? (
        <p className="mt-3 text-[11.5px] text-primary">Fertig eingerichtet. Ihr Assistent kann Anrufe annehmen.</p>
      ) : null}
    </SectionCard>
  );
}

export default VoiceReadinessCard;
