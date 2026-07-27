import { useMemo } from "react";
import { SectionCard } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { monthlyRevenue, type AgingDoc } from "@/lib/ar-metrics";
import { cn } from "@/lib/utils";

/**
 * Umsatz je Monat auf der Buchhaltung-Uebersicht (Leon-Entscheid 27.07.2026:
 * Balken, 12 Monate, bezahlt + offen gestapelt).
 *
 * Gerechnet wird client-seitig aus den ohnehin geladenen Rechnungen
 * (tenant_documents: issue_date + amount_gross + paid_at), genau wie schon
 * Altersstruktur und Ø Zahlungsdauer. Kein neuer Endpunkt, keine geschaetzte
 * Kurve: Monate ohne Umsatz bleiben leer stehen, statt interpoliert zu werden.
 *
 * Die Rechnung selbst steht in `monthlyRevenue` (ar-metrics.ts) und ist dort
 * getestet. Die Balken sind bewusst handgebaut wie im Rest der Console, damit
 * die Farben aus den Tokens kommen.
 */
export function UmsatzChart({
  docs,
  isLoading,
  isError,
  isFetching,
  onRetry,
  className,
}: {
  docs: AgingDoc[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  const series = useMemo(() => monthlyRevenue(docs), [docs]);

  const eur = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <SectionCard
      title="Umsatz je Monat"
      subtitle="nach Rechnungsdatum · letzte 12 Monate · farbig getrennt nach bezahlt und offen"
      className={className}
      action={
        series.hasData ? (
          <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
            Summe <span className="tabular text-foreground">{eur(series.total)}</span>
          </span>
        ) : null
      }
    >
      {isError ? (
        <QueryErrorNotice
          label="Der Umsatzverlauf konnte nicht geladen werden."
          onRetry={onRetry}
          retrying={isFetching}
        />
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !series.hasData ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
          Noch keine Rechnungen mit Betrag und Datum erfasst. Sobald Rechnungen vorliegen,
          steht hier der Verlauf der letzten zwölf Monate.
        </p>
      ) : (
        <>
          <div className="flex h-36 items-end gap-1.5">
            {series.months.map((m) => {
              const hTotal = Math.round((m.total / series.max) * 100);
              const paidShare = m.total > 0 ? m.paid / m.total : 0;
              return (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-28 w-full items-end justify-center">
                    <div
                      className="flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-t"
                      style={{ height: `${m.total > 0 ? Math.max(3, hTotal) : 0}%` }}
                      title={`${m.label}: ${eur(m.total)} gesamt, davon ${eur(m.paid)} bezahlt (${m.count} Rechnung${m.count === 1 ? "" : "en"})`}
                    >
                      {/* offen oben, bezahlt unten: der bezahlte Sockel waechst nach oben */}
                      <div className="w-full bg-amber/55" style={{ height: `${Math.round((1 - paidShare) * 100)}%` }} />
                      <div className="w-full bg-primary/80" style={{ height: `${Math.round(paidShare * 100)}%` }} />
                    </div>
                  </div>
                  <span
                    className={cn(
                      "w-full truncate text-center text-[10px] tabular",
                      m.total > 0 ? "text-muted-foreground" : "text-tx-faint",
                    )}
                  >
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-tx-weak">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary/80" aria-hidden /> bezahlt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-amber/55" aria-hidden /> noch offen
            </span>
            <span>Stornierte Rechnungen zählen nicht mit.</span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
