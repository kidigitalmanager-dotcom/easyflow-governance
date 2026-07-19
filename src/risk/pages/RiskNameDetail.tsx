import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ShieldOff } from "lucide-react";
import {
  BenchmarkChip, CounterfactualCard, DecisionNoteBlock, HonestyPanel,
  KpiGrid, QualityTierChip, ReasonCodeList, ScoreBadge, TrendSparkline,
} from "../components";
import { fmtDateTimeDe, fmtPeriod, verticalLabel } from "../format";
import { useRiskScore } from "../queries";
import { getRiskSession } from "../session";
import { segmentDefaults } from "../segment-defaults";

function Block({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-muted text-[10px] flex items-center justify-center text-muted-foreground font-mono">{n}</span>
          {title}
        </h2>
        {sub && <p className="mt-1 text-xs text-muted-foreground/80 pl-7">{sub}</p>}
      </header>
      <div className="pl-0 sm:pl-7">{children}</div>
    </section>
  );
}

export default function RiskNameDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const { data: score, isLoading, error } = useRiskScore(accountId);
  const session = getRiskSession();
  const seg = segmentDefaults(session.segment);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-2xl bg-muted/40" />
        <div className="h-40 rounded-2xl bg-muted/30" />
        <div className="h-56 rounded-2xl bg-muted/20" />
      </div>
    );
  }

  if (error || !score) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" /> Name nicht abrufbar
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error)?.message ?? "Zu dieser Kennung liegt kein Datensatz vor."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70">
          Moegliche Ursache: der Name gehoert nicht zu Ihrem Bestand, oder er hat der
          Weitergabe seiner Signale nicht zugestimmt. Namen ohne Zustimmung erscheinen
          in diesem Portal grundsaetzlich nicht.
        </p>
        <Link to="/risk" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Zurueck zur Uebersicht
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/risk" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurueck
      </Link>

      {/* ── Block 1 · Kopf ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{score.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {score.legal_form && <span>{score.legal_form}</span>}
              <span className="text-muted-foreground/40">·</span>
              <span>{verticalLabel(score.vertical)}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-mono text-[11px]">{score.account_id}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <QualityTierChip tier={score.quality_tier} connectedSources={score.connected_sources} />
              <BenchmarkChip benchmark={score.benchmark} />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <TrendSparkline values={score.trend_12m} width={150} height={38} />
              <p className="mt-1 text-[10px] text-muted-foreground/70">Verlauf 12 Monate</p>
            </div>
            <ScoreBadge score={score.health_score} band={score.band} size="lg" />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground/70">
          <span>Modellversion <span className="text-foreground/80 font-mono">{score.model_version}</span></span>
          <span>Bewertungsstand <span className="text-foreground/80">{fmtPeriod(score.period)}</span></span>
          <span>Berechnet <span className="text-foreground/80">{fmtDateTimeDe(score.computed_at)}</span></span>
        </div>
      </section>

      {/* ── Block 2 · Ehrlichkeit, direkt unter dem Score ──────────────────── */}
      <HonestyPanel score={score} />

      {/* ── Block 3 · Reason Codes ────────────────────────────────────────── */}
      <Block n={3} title="Was diesen Score treibt"
        sub="Die Kennzahlen mit dem groessten Punktbeitrag, sortiert nach Gewicht.">
        <ReasonCodeList reasonCodes={score.reason_codes} />
      </Block>

      {/* ── Block 4 · Gegenprobe ──────────────────────────────────────────── */}
      <Block n={4} title="Gegenprobe"
        sub="Was sich aendern muesste, damit dieser Name das naechste Band erreicht.">
        <CounterfactualCard cf={score.counterfactual} />
      </Block>

      {/* ── Block 5 · KPI-Vektor, eingeklappt ─────────────────────────────── */}
      <Block n={5} title="Kennzahlen im Einzelnen"
        sub="Standardmaessig eingeklappt. Wer die Treiber gelesen hat, braucht das meistens nicht.">
        <KpiGrid metrics={score.metrics} categories={score.categories} highlightCategories={seg.highlight_categories} />
      </Block>

      {/* ── Block 6 · Entscheidungsvermerk ────────────────────────────────── */}
      <Block n={6} title="Entscheidungsvermerk"
        sub="Ihre Entscheidung zu diesem Namen. Bleibt in Ihrem Haus.">
        <DecisionNoteBlock accountId={score.account_id} />
      </Block>

      {/* Produktgrenze sichtbar machen - das ist ein Verkaufsargument, keine Fussnote. */}
      <p className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground/60 px-1">
        <ShieldOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Dieses Portal liefert bewusst keine Quellbelege, keinen generierten Fliesstext
          und keine Handlungsempfehlung. Die Belegkette enthaelt Kommunikationsdaten
          Dritter und wird an Underwriting-Mandanten technisch nicht ausgeliefert.
          Eine Handlungsempfehlung waere Ihre Entscheidung, nicht unsere.
        </span>
      </p>
    </div>
  );
}
