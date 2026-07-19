import { bandColor, bandOf } from "../format";

/**
 * Kompakter Verlauf als reines SVG. Bewusst ohne Chart-Bibliothek: in der
 * Bestandstabelle stehen davon spaeter hunderte gleichzeitig im DOM.
 * Luecken in der Reihe (null) werden nicht interpoliert, sondern ausgelassen -
 * eine erfundene Linie ueber fehlende Monate waere die falsche Aussage.
 */
export function TrendSparkline({
  values, width = 120, height = 28, strokeWidth = 1.5, showGapHint = true, className = "",
}: {
  values: (number | null | undefined)[];
  width?: number; height?: number; strokeWidth?: number;
  showGapHint?: boolean; className?: string;
}) {
  const pts = values ?? [];
  const known = pts.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v));
  const gaps = pts.length - known.length;

  if (known.length < 2) {
    return (
      <span className={`inline-flex items-center text-[11px] text-muted-foreground/60 ${className}`} style={{ width, height }}>
        Zu wenig Historie
      </span>
    );
  }

  const min = Math.min(...known.map((p) => p.v));
  const max = Math.max(...known.map((p) => p.v));
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const x = (i: number) => (pts.length <= 1 ? 0 : (i / (pts.length - 1)) * (width - 2 * pad) + pad);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - 2 * pad);

  const d = known.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = known[known.length - 1];
  const color = bandColor(bandOf(last.v));

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg width={width} height={height} role="img"
        aria-label={`Verlauf ueber ${pts.length} Monate, zuletzt ${Math.round(last.v)}`}>
        <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(last.i)} cy={y(last.v)} r={strokeWidth + 0.8} fill={color} />
      </svg>
      {showGapHint && gaps > 0 && (
        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap" title={`${gaps} von ${pts.length} Monaten ohne Daten`}>
          {gaps} Mon. ohne Daten
        </span>
      )}
    </span>
  );
}
