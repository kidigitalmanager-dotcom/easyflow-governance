/**
 * LabelReasonLine — „Warum dieses Label?" (v4.57.0 / J4).
 * Klartext-Satz + Quelle-Badge + Konfidenz-%. REIN DEKLARATIV: der Text kommt
 * 1:1 aus dem Backend (buildLabelReason) — damit MiniUI und Console denselben
 * Wortlaut zeigen. Kein Klassifikator-Touch, reine Anzeige.
 */
import { BadgeCheck, Sparkles, ShieldAlert, ShieldOff, type LucideIcon } from "lucide-react";

const KIND_STYLE: Record<string, { cls: string; Icon: LucideIcon }> = {
  rule:   { cls: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10", Icon: BadgeCheck },
  ki:     { cls: "text-violet-500 border-violet-500/30 bg-violet-500/10",    Icon: Sparkles },
  risk:   { cls: "text-amber-600 border-amber-500/30 bg-amber-500/10",       Icon: ShieldAlert },
  optout: { cls: "text-slate-500 border-slate-400/30 bg-slate-400/10",       Icon: ShieldOff },
  noise:  { cls: "text-slate-500 border-slate-400/30 bg-slate-400/10",       Icon: ShieldOff },
};

export interface LabelReasonProps {
  text?: string | null;
  kind?: string | null;
  source?: string | null;
  confidencePct?: number | null;
}

/** Quelle-Badge: „Feste Regel ✓ · 95 %" / „KI-Einschätzung · 82 %". */
export function LabelReasonBadge({ kind, source, confidencePct }: LabelReasonProps) {
  if (!source) return null;
  const s = KIND_STYLE[kind ?? ""] ?? KIND_STYLE.ki;
  const Icon = s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}
      title="Warum dieses Label? Quelle der Einordnung"
    >
      <Icon className="w-3 h-3" /> {source}
      {typeof confidencePct === "number" ? ` · ${confidencePct} %` : ""}
    </span>
  );
}

/** Eine Zeile: Badge + deutscher Begründungssatz. Null, wenn keine Begründung vorliegt. */
export function LabelReasonLine({ text, kind, source, confidencePct }: LabelReasonProps) {
  if (!text) return null;
  return (
    <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5 flex-wrap">
      <LabelReasonBadge kind={kind} source={source} confidencePct={confidencePct} />
      <span className="leading-snug">{text}</span>
    </p>
  );
}
