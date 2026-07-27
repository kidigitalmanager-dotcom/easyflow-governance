import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAutopilotPolicy } from "@/hooks/use-api";
import {
  computeGates,
  maturityStatus,
  MODE_ORDER,
  MODE_SHORT_LABELS,
  MIN_SAMPLES,
  type MaturityMode,
} from "@/lib/autopilot-maturity";
import { humanizeCategory } from "@/data/humanize";
import { SectionCard, ProgressRing } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";

// ─────────────────────────────────────────────────────────────────────────────
// Autopilot-Reife auf "Heute".
//
// Redesign 27.07.2026: der Entwurf zeigt hier einen Reife-Ring. Der Ring bildet
// den ECHTEN Stand ab — Sample-Fortschritt (x/400) des staerksten Intents —,
// die Stufenangabe kommt aus MODE_ORDER (Schatten -> Assistiert -> Autonom).
// promotion_ready wird NAECHTLICH vom autopilot-sender berechnet; diese Anzeige
// erfindet keine eigene Freigabe-Logik, sie visualisiert nur den DB-Stand.
//
// 2026-07-27 (Leons Durchlauf): die Karte verschwand lautlos, weil sie bei
// leerem maturity-Array `null` lieferte. Auf einer frisch aufgesetzten Console
// sah es aus, als gaebe es das Widget gar nicht. Jetzt gilt:
//   - Query-Fehler  -> QueryErrorNotice (Fehler ist nicht leer)
//   - keine Daten   -> Ring auf 0 mit ehrlichem Satz, ab wann Zahlen kommen
//   - Daten         -> unveraendert wie bisher
// ─────────────────────────────────────────────────────────────────────────────
export function AutopilotReifeWidget() {
  const { data, isLoading, isError, isFetching, refetch } = useAutopilotPolicy();
  const rows = (data?.maturity ?? [])
    .slice()
    .sort((a, b) => Number(b.promotion_ready) - Number(a.promotion_ready) || b.sample_count - a.sample_count)
    .slice(0, 3);

  const header = (
    <Link
      to="/einstellungen?tab=email-autopilot"
      className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
    >
      Stufen <ChevronRight className="w-3 h-3" />
    </Link>
  );

  if (isError) {
    return (
      <SectionCard title="Autopilot-Reife" subtitle="Weg zur nächsten Stufe" action={header}>
        <QueryErrorNotice
          label="Der Autopilot-Stand konnte nicht geladen werden."
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      </SectionCard>
    );
  }

  if (rows.length === 0) {
    return (
      <SectionCard title="Autopilot-Reife" subtitle="Weg zur nächsten Stufe" action={header}>
        <div className="flex items-center gap-4">
          <ProgressRing value={0} label={`1/${MODE_ORDER.length}`} sublabel="Stufe" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              {isLoading ? "Wird geladen" : "Noch keine Auswertung"}
            </p>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              {isLoading
                ? "Einen Moment."
                : `Die Reife entsteht aus deinen Freigaben. Sie wird nächtlich gezählt und erscheint hier, sobald für eine Kategorie genug Entscheidungen vorliegen (${MIN_SAMPLES} Mails).`}
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const lead = rows[0];
  const leadPct = Math.min(1, (lead.sample_count ?? 0) / MIN_SAMPLES);
  const leadStage = Math.max(1, MODE_ORDER.indexOf(String(lead.mode) as MaturityMode) + 1);
  const leadGates = computeGates(lead);
  const leadPassed = leadGates.filter((g) => g.status === "pass").length;

  return (
    <SectionCard
      title="Autopilot-Reife"
      subtitle="Weg zur nächsten Stufe"
      action={header}
    >
      <div className="flex items-center gap-4">
        <ProgressRing value={leadPct} label={`${leadStage}/${MODE_ORDER.length}`} sublabel="Stufe" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{humanizeCategory(lead.core_key)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {MODE_SHORT_LABELS[lead.mode as MaturityMode] ?? lead.mode} ·{" "}
            <span className="tabular">
              {lead.sample_count}/{MIN_SAMPLES}
            </span>{" "}
            Mails · {leadPassed}/{leadGates.length} Gates
          </p>
          <p className="mt-1.5 text-[11.5px] text-tx-weak">{maturityStatus(lead).label}</p>
        </div>
      </div>

      {rows.length > 1 && (
        <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
          {rows.slice(1).map((r) => {
            const gates = computeGates(r);
            const passed = gates.filter((g) => g.status === "pass").length;
            const pct = Math.min(100, Math.round(((r.sample_count ?? 0) / MIN_SAMPLES) * 100));
            return (
              <div key={r.core_key}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">{humanizeCategory(r.core_key)}</span>
                  <span className="whitespace-nowrap text-[10.5px] text-tx-weak">
                    {MODE_SHORT_LABELS[r.mode as MaturityMode] ?? r.mode} · {passed}/{gates.length} Gates
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={
                      "h-full rounded-full transition-[width] duration-[1200ms] ease-out " +
                      (r.promotion_ready ? "bg-primary" : "bg-primary/50")
                    }
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
