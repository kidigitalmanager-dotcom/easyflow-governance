/**
 * DecisionStory — macht eine UseEasy-Entscheidung fuer Nicht-Techniker
 * nachvollziehbar: Konfidenz-Ampel + Schritt-fuer-Schritt-Verlauf + Evidenz +
 * Klartext-Takeaway. Speist sich rein aus den vorhandenen Audit-Feldern.
 */
import {
  Mail, Tag, Check, X, Send, Clock, User, AlertTriangle, Ban, GitBranch,
} from "lucide-react";
import {
  buildDecisionSteps, decisionTakeaway, confidenceTone, confidenceWord,
  humanizeConfidence, type DecisionStep,
} from "@/data/humanize";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail, tag: Tag, check: Check, x: X, send: Send, clock: Clock,
  user: User, alert: AlertTriangle, stop: Ban, route: GitBranch,
};

const TONE_TEXT: Record<string, string> = {
  good: "text-emerald-500", warn: "text-amber-500", stop: "text-red-500", default: "text-primary",
};

const BAR: Record<string, string> = {
  high: "bg-emerald-500", mid: "bg-amber-500", low: "bg-red-500", none: "bg-muted-foreground/40",
};
const PILL: Record<string, string> = {
  high: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  mid: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  low: "text-red-500 border-red-500/30 bg-red-500/10",
  none: "text-muted-foreground border-border bg-muted/30",
};

interface Props {
  entry: Record<string, unknown>;
}

export default function DecisionStory({ entry }: Props) {
  const confidence = entry?.confidence as number | null | undefined;
  const tone = confidenceTone(confidence);
  const pct = tone === "none" ? 0 : Math.round((confidence as number) * 100);
  const steps: DecisionStep[] = buildDecisionSteps(entry);
  const evidence = Array.isArray(entry?.evidence) ? (entry.evidence as string[]) : [];

  return (
    <div className="space-y-5">
      {/* Konfidenz-Ampel */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Konfidenz</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PILL[tone]}`}>
            {confidenceWord(confidence)}{tone !== "none" ? ` · ${humanizeConfidence(confidence)}` : ""}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${BAR[tone]}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Story-Timeline */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Was ist passiert?</h4>
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-border">
          {steps.map((s, i) => {
            const Icon = ICONS[s.icon] || GitBranch;
            return (
              <li key={i} className="relative flex gap-3">
                <span className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center ${TONE_TEXT[s.tone || "default"]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium leading-snug">{s.title}</p>
                  {s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Evidenz-Chips */}
      {evidence.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground">Worauf das beruht</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {evidence.slice(0, 8).map((ev, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted/50 border border-border text-foreground/80">
                {String(ev)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Takeaway */}
      <div className="rounded-md bg-primary/5 border border-primary/15 p-3">
        <p className="text-xs text-muted-foreground">Was heißt das für dich?</p>
        <p className="text-sm font-medium mt-0.5">{decisionTakeaway(entry)}</p>
      </div>
    </div>
  );
}
