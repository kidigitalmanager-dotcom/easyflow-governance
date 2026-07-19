import { fmtCount, fmtDelta, verticalLabel } from "../format";
import type { RiskBenchmark } from "../types";

/** "-5 vs. Sektor" - uebernommen aus dem Investorenprodukt. */
export function BenchmarkChip({ benchmark }: { benchmark: RiskBenchmark | null | undefined }) {
  if (!benchmark || benchmark.delta_vs_median == null) return null;
  const d = benchmark.delta_vs_median;
  const color = d > 0 ? "#10b981" : d < 0 ? "#C0392B" : "#5A6473";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border"
      style={{ backgroundColor: `${color}12`, borderColor: `${color}30`, color }}
      title={
        `Median im Sektor ${verticalLabel(benchmark.vertical)}: ${benchmark.median_health ?? "unbekannt"} ` +
        `(p25 ${benchmark.p25_health ?? "-"} bis p75 ${benchmark.p75_health ?? "-"}), ` +
        `Vergleichsgruppe ${fmtCount(benchmark.n_accounts)} Namen.`
      }
    >
      <span className="font-semibold tabular-nums">{fmtDelta(d)}</span>
      <span className="opacity-80">vs. Sektor {verticalLabel(benchmark.vertical)}</span>
    </span>
  );
}
