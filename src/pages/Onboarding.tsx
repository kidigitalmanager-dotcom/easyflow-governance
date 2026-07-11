import { Activity, ListChecks, Tag, FileSpreadsheet, Brain, Bot, Sparkles, Play, RotateCcw, Check, Clock, GraduationCap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMOS, DEMO_ORDER, COPY, type Demo } from "@/data/onboarding-content";
import { useOnboardingProgress } from "@/hooks/use-onboarding";
import { useOnboardingRunner } from "@/components/onboarding/OnboardingRunner";
import { demoDone, demosDoneCount } from "@/lib/onboarding";

// Icon-Namen aus dem Demo-Katalog -> lucide-Komponenten (statische Zuordnung, kein dynamic import).
const ICONS: Record<string, LucideIcon> = {
  Activity, ListChecks, Tag, FileSpreadsheet, Brain, Bot,
};

function DemoCard({ demo, done, onStart }: { demo: Demo; done: boolean; onStart: () => void }) {
  const Icon = ICONS[demo.icon] ?? Sparkles;
  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Icon className="w-[22px] h-[22px] text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{demo.title}</h3>
            {done && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-500 border-emerald-500/25">
                <Check className="w-3 h-3" /> {COPY.demoDoneChip}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{demo.summary}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-auto">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" /> ca. {demo.durationMin} Min
        </span>
        <button
          onClick={onStart}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 transition-colors",
            done
              ? "border border-border text-foreground hover:bg-muted/60"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {done ? <><RotateCcw className="w-4 h-4" /> {COPY.demoRestart}</> : <><Play className="w-4 h-4" /> {COPY.demoStart}</>}
        </button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { data: progress } = useOnboardingProgress();
  const { startDemo } = useOnboardingRunner();

  const prog = progress ?? {};
  const doneCount = demosDoneCount(prog, DEMO_ORDER);
  const total = DEMOS.length;
  const allDone = total > 0 && doneCount === total;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <GraduationCap className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{COPY.onboardingTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">{COPY.onboardingSubtitle}</p>
        </div>
      </div>

      {/* Fortschritt über alle Durchläufe */}
      <div className="glass-card p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            {allDone ? COPY.onboardingCatalogDone : `${doneCount} von ${total} Durchläufen abgeschlossen`}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${total ? Math.round((doneCount / total) * 100) : 0}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{total ? Math.round((doneCount / total) * 100) : 0}%</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{COPY.onboardingRestartHint}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEMOS.map((demo) => (
          <DemoCard
            key={demo.slug}
            demo={demo}
            done={demoDone(prog, demo.slug)}
            onStart={() => startDemo(demo.slug)}
          />
        ))}
      </div>
    </div>
  );
}
