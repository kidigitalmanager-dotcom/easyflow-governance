import { Link } from "react-router-dom";
import {
  Mail, Inbox, Sparkles, FileCheck2, ShieldCheck, ListChecks, CheckCircle2, Circle, ArrowRight, X, PartyPopper, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingState } from "@/hooks/use-onboarding";
import type { MilestoneId } from "@/lib/onboarding";
import { MILESTONE_META, MILESTONE_ORDER, COPY, type TourSection } from "@/data/onboarding-content";

const ICON: Record<MilestoneId, LucideIcon> = {
  mailbox: Mail,
  first_classification: Inbox,
  signal_explained: Sparkles,
  draft_approved: FileCheck2,
  consent: ShieldCheck,
  weekly: ListChecks,
};

// Fortschritts-Checkliste (der Kern): sichtbare Meilensteine mit Status, feiert Fortschritt,
// verlinkt direkt zur jeweiligen Aktion. Server-Meilensteine sind live abgeleitet, nie gefaked.
export function OnboardingChecklist({
  state, onStartTour, onSection,
}: {
  state: OnboardingState;
  onStartTour: () => void;
  onSection: (s: TourSection) => void;
}) {
  const { milestones, counts, next, setFlag } = state;
  const doneById = new Map(milestones.map((m) => [m.id, m.done]));

  // Alles erledigt -> einmalige Feier, danach ausblendbar.
  if (counts.complete) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <PartyPopper className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{COPY.checklistDone}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{COPY.checklistDoneBody}</p>
              <button onClick={onStartTour} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <Sparkles className="w-3.5 h-3.5" /> {COPY.restartTour}
              </button>
            </div>
          </div>
          <button
            onClick={() => setFlag({ checklist_dismissed: true })}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Ausblenden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">{COPY.checklistTitle}</h3>
            <span className="text-[11px] font-semibold text-primary tabular-nums">{counts.done}/{counts.total}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {next ? "Dein nächster Schritt ist markiert." : "Fast geschafft."}
          </p>
        </div>
        <button
          onClick={() => setFlag({ checklist_dismissed: true })}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Checkliste ausblenden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fortschrittsbalken */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${counts.pct}%` }} />
      </div>

      <ol className="space-y-2">
        {MILESTONE_ORDER.map((id) => {
          const meta = MILESTONE_META[id];
          const done = !!doneById.get(id);
          const isNext = !done && next?.id === id;
          const Icon = ICON[id];
          return (
            <li
              key={id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                done ? "border-border bg-card/40" : isNext ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-card/20",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className={cn("w-5 h-5", isNext ? "text-primary" : "text-muted-foreground/40")} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", done ? "text-muted-foreground" : "text-foreground")} />
                  <span className={cn("text-sm font-medium", done ? "text-muted-foreground line-through decoration-muted-foreground/40" : "text-foreground")}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{done ? meta.descDone : meta.descTodo}</p>
                {!done && (
                  <ActionButton meta={meta} onStartTour={onStartTour} onSection={onSection} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActionButton({
  meta, onStartTour, onSection,
}: {
  meta: (typeof MILESTONE_META)[MilestoneId];
  onStartTour: () => void;
  onSection: (s: TourSection) => void;
}) {
  const cls = "mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline";
  const a = meta.action;
  if (a.kind === "link") {
    return (
      <Link to={a.href} className={cls}>
        {a.label} <ArrowRight className="w-3 h-3" />
      </Link>
    );
  }
  if (a.kind === "start_tour") {
    return (
      <button onClick={onStartTour} className={cls}>
        {a.label} <ArrowRight className="w-3 h-3" />
      </button>
    );
  }
  return (
    <button onClick={() => onSection(a.section)} className={cls}>
      {a.label} <ArrowRight className="w-3 h-3" />
    </button>
  );
}
