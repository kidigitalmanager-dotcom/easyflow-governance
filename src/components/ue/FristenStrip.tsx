import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useMemoryEntities } from "@/hooks/use-memory";
import { buildFristenStrip, type DayTone, type FristDay } from "@/lib/fristen-strip";
import { SectionCard } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { cn } from "@/lib/utils";

/**
 * Fristen-Band "nächste 14 Tage" aus Leons Entwurf (Briefing 27.07.2026, 3.1).
 *
 * 14 Tageskacheln nebeneinander: Wochentag oben, Tageszahl groß, darunter ein
 * Punkt. Tage mit Frist bekommen zusätzlich eine getönte Fläche und eine farbige
 * Kante. Heute ist die erste Kachel.
 *
 * Datenquelle: dieselbe wie das FristenBoard darunter (memory-engine
 * entity_profiles, Feld next_deadline_at). Die Einstufung steckt in
 * `src/lib/fristen-strip.ts` und ist dort getestet.
 *
 * Ehrlichkeit: liefert die memory-engine nichts, steht hier ein ruhiger Satz,
 * keine Kachelreihe mit erfundenen Punkten. Bei Query-Fehler QueryErrorNotice.
 */

const TILE: Record<DayTone, string> = {
  critical: "border-danger/45 bg-danger/10",
  due: "border-amber/45 bg-amber-surface/45",
  done: "border-emerald-surface bg-emerald-deep",
  none: "border-line-soft bg-muted",
};

const NUM: Record<DayTone, string> = {
  critical: "text-danger",
  due: "text-amber",
  done: "text-emerald-light",
  none: "text-muted-foreground",
};

const DOT: Record<DayTone, string> = {
  critical: "bg-danger",
  due: "bg-amber",
  done: "bg-primary",
  none: "bg-secondary",
};

function Tile({ d }: { d: FristDay }) {
  return (
    <div
      title={d.title}
      aria-label={`${d.weekday} ${d.day}. ${d.title}`}
      className={cn(
        "flex h-14 flex-col items-center justify-between rounded-lg border py-1.5 transition-colors",
        TILE[d.tone],
        d.isToday && d.tone === "none" && "border-border",
      )}
    >
      <span className="text-[10px] leading-none text-tx-weak">{d.weekday}</span>
      <span className={cn("tabular text-[13px] font-semibold leading-none", NUM[d.tone])}>{d.day}</span>
      <span className={cn("h-[5px] w-[5px] rounded-full", DOT[d.tone])} aria-hidden />
    </div>
  );
}

export function FristenStrip({ className }: { className?: string }) {
  const q = useMemoryEntities(200);
  const strip = buildFristenStrip(q.data);

  const summary =
    q.isLoading
      ? "wird geladen"
      : strip.active === 0
        ? "nichts offen"
        : `${strip.active} aktiv${strip.critical > 0 ? ` · ${strip.critical} kritisch` : ""}`;

  return (
    <SectionCard
      title="Fristen · nächste 14 Tage"
      subtitle="erkannt aus deiner Kommunikation · nächtlich aktualisiert"
      className={className}
      action={
        <span className="flex items-center gap-3">
          <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{summary}</span>
          <Link
            to="/audit"
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-primary hover:underline"
          >
            Verlauf <ChevronRight className="h-3 w-3" />
          </Link>
        </span>
      }
    >
      {q.isError ? (
        <QueryErrorNotice
          label="Die Fristen konnten nicht geladen werden."
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
      ) : (
        <>
          {/* 14 Spalten gibt es in Tailwind nicht ab Werk, deshalb der explizite
              Raster-Wert. Auf schmalen Fenstern zwei Reihen a 7 Tage. */}
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(14,minmax(0,1fr))]">
            {strip.days.map((d) => (
              <Tile key={d.iso} d={d} />
            ))}
          </div>
          {!q.isLoading && strip.active === 0 && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              Keine Fristen in den nächsten 14 Tagen erkannt.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tx-weak">
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-danger" aria-hidden /> heute oder überfällig
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-amber" aria-hidden /> Frist an diesem Tag
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-primary" aria-hidden /> nichts mehr offen
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
