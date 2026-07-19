import { bandColor, BAND_LABEL, bandOf, fmtScore } from "../format";
import type { RiskBand } from "../types";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { box: string; num: string; label: string }> = {
  sm: { box: "px-2 py-0.5 gap-1.5", num: "text-sm font-semibold", label: "text-[10px]" },
  md: { box: "px-3 py-1.5 gap-2", num: "text-xl font-semibold", label: "text-[11px]" },
  lg: { box: "px-5 py-3 gap-3", num: "text-5xl font-semibold leading-none", label: "text-xs" },
};

/**
 * Zahl + Band + Farbe. Das Band wird immer mitgeschrieben, nie nur die Farbe -
 * Farbe allein ist fuer Rot-Gruen-Sehschwaeche keine Information.
 */
export function ScoreBadge({
  score, band, size = "md", showLabel = true, className = "",
}: {
  score: number | null | undefined;
  band?: RiskBand;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const b = band ?? bandOf(score);
  const color = bandColor(b);
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex items-center rounded-xl border ${s.box} ${className}`}
      style={{ backgroundColor: `${color}1a`, borderColor: `${color}40` }}
      title={`Score ${fmtScore(score)} von 100, Band ${BAND_LABEL[b]}`}
    >
      <span className={s.num} style={{ color }}>{fmtScore(score)}</span>
      {showLabel && (
        <span className={`${s.label} font-medium uppercase tracking-wide`} style={{ color }}>
          {BAND_LABEL[b]}
        </span>
      )}
    </span>
  );
}
