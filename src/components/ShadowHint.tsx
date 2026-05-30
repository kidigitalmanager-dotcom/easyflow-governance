/**
 * ShadowHint — Shadow/Assisted "Would-Do"-Anzeige.
 * REIN DEKLARATIV: zeigt nur, was der Autopilot täte — löst nichts aus.
 * Datenquelle: autopilot_log.decision (+ maturity.mode) via RecentEmail/AuditLog.
 * v4.43.0
 */
import { Bot } from "lucide-react";
import { modePillLabel, modeSentence, modeTone, humanizeShadow } from "@/data/humanize";

const PILL_CLASS: Record<string, string> = {
  shadow:     "text-sky-500 border-sky-500/30 bg-sky-500/10",
  assisted:   "text-amber-500 border-amber-500/30 bg-amber-500/10",
  autonomous: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  off:        "text-muted-foreground border-border bg-muted/30",
};

/** Modus-Pille (🟦 Vorschau / 🟨 Vorbereitet / 🟩 Automatisch). Null wenn kein Modus. */
export function ShadowModePill({ mode }: { mode?: string | null }) {
  const tone = modeTone(mode);
  const label = modePillLabel(mode);
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${PILL_CLASS[tone]}`}
      title={modeSentence(mode)}
    >
      <Bot className="w-3 h-3" /> {label}
    </span>
  );
}

/** "So würde UseEasy das erledigen: <Verdict>" — eine Zeile, kollabiert. */
export function ShadowWouldDoLine({ mode, decision }: { mode?: string | null; decision?: string | null }) {
  const sentence = modeSentence(mode);
  const verdict = humanizeShadow(decision);
  if (!sentence && !verdict) return null;
  return (
    <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
      <Bot className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-sky-500/80" />
      <span>{sentence || "Autopilot"}{verdict ? `: ${verdict}` : ""}</span>
    </p>
  );
}
