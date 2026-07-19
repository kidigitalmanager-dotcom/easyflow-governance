import { Link } from "react-router-dom";
import { ArrowRight, Construction } from "lucide-react";
import { ScoreBadge } from "../components";
import { CHANGE_KIND_LABEL, fmtDateDe, fmtDelta, fmtExposure, SEVERITY_META } from "../format";
import { useRiskChanges } from "../queries";
import { DEMO_ACCOUNTS } from "../api";
import { getRiskSession } from "../session";
import { segmentDefaults } from "../segment-defaults";

/**
 * Vorlaeufiger Einstieg. Der vollstaendige Veraenderungs-Feed (Zeitraum-Umschalter,
 * Gruppierung nach Schweregrad, Bulk-Aktionen, Zustaende) kommt an Tag 5.
 * Die Reihenfolge stammt schon jetzt aus priority_rank der API - nicht aus dem Client.
 */
export default function RiskIndex() {
  const session = getRiskSession();
  const seg = segmentDefaults(session.segment);
  const { data, isLoading } = useRiskChanges();
  const rows = [...(data?.changes ?? [])].sort((a, b) => a.priority_rank - b.priority_rank).slice(0, 12);

  return (
    <div className="space-y-5 max-w-5xl">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Veraenderungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Was sich in Ihrem Bestand bewegt hat. Reihenfolge nach Dringlichkeit
          (Exposure mal Ausschlag mal Konfidenz), serverseitig berechnet.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Namen mit vollstaendigem Datensatz</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Zwei Namen zeigen die Spannweite: einer mit angeschlossener Bank und Buchhaltung,
          einer mit Postfach allein und kurzer Historie.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((a) => (
            <Link key={a.id} to={`/risk/name/${a.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 hover:border-primary/40 transition-colors group">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">{a.name}</span>
                <span className="block text-[11px] text-muted-foreground">{a.hint}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Dringendste Bewegungen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Voreinstellung fuer {seg.label}. Vollstaendiger Feed folgt.
            </p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border flex items-center gap-1.5">
            <Construction className="w-3 h-3" /> Ausbaustufe Tag 5
          </span>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted/30" />)}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => {
              const sev = SEVERITY_META[c.severity];
              return (
                <li key={c.account_id + c.changed_at}>
                  <Link to={`/risk/name/${c.account_id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                    <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: sev.color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground truncate">{c.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {CHANGE_KIND_LABEL[c.kind]}
                        {c.crossed_threshold && <span style={{ color: sev.color }}> · Schwelle durchbrochen</span>}
                        {c.top_driver && <> · groesster Treiber {c.top_driver.name}</>}
                      </span>
                    </span>
                    <span className="hidden md:block text-right shrink-0">
                      <span className="block text-[11px] text-muted-foreground">Exposure</span>
                      <span className="block text-xs text-foreground/80 tabular-nums">{fmtExposure(c.exposure)}</span>
                    </span>
                    <span className="text-right shrink-0 w-16">
                      <span className="block text-sm font-semibold tabular-nums"
                        style={{ color: c.delta < 0 ? "#C0392B" : "#10b981" }}>{fmtDelta(c.delta)}</span>
                      <span className="block text-[10px] text-muted-foreground">{fmtDateDe(c.changed_at)}</span>
                    </span>
                    <ScoreBadge score={c.score_after} band={c.band_after} size="sm" showLabel={false} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
