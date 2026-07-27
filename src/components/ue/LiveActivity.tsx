import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuditLog } from "@/hooks/use-api";
import { humanizeActor, humanizeDecision, prettyRedaction } from "@/data/humanize";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, EmptyState, Dot } from "@/components/ue/primitives";

/**
 * Live-Aktivitaet auf "Heute" (Briefing §2).
 *
 * Quelle ist bewusst der bestehende Audit-Trail (/audit) — es wird KEIN neuer
 * Endpoint erfunden. Nur der juengste Eintrag traegt den pulsierenden Punkt,
 * damit die Karte lebt, ohne zu blinken.
 *
 * Fehler != leer: bei kaputter Query kommt QueryErrorNotice, nicht "keine
 * Aktivitaet" (Lehre aus der Fehlerzustands-Runde vom 27.07.).
 */
export function LiveActivity({ limit = 6 }: { limit?: number }) {
  const { data, isLoading, isError, refetch, isFetching } = useAuditLog();
  const rows = (data ?? []).slice(0, limit);

  return (
    <SectionCard
      title="Live-Aktivität"
      live={!isError && rows.length > 0}
      action={
        <Link
          to="/audit"
          className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
        >
          Verlauf <ChevronRight className="w-3 h-3" />
        </Link>
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-4">
          <QueryErrorNotice
            label="Die Aktivität konnte nicht geladen werden."
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch keine Aktivität"
          description="Sobald UseEasy Vorgänge liest und Entwürfe schreibt, läuft hier der Verlauf mit."
        />
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((e, i) => (
            <li key={e.id ?? i} className="flex items-start gap-3 px-4 py-2.5">
              <span className="pt-1.5">
                <Dot tone={i === 0 ? "emerald" : "muted"} pulse={i === 0} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-tx-secondary">
                  {prettyRedaction(e.subject) || "Vorgang"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {humanizeActor(e.actor)} · {humanizeDecision(e.decision)}
                </p>
              </div>
              <time
                className="shrink-0 pt-0.5 text-[11px] tabular text-tx-weak"
                dateTime={e.timestamp}
              >
                {formatTime(e.timestamp)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  return new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
