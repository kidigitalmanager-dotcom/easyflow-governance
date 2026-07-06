import { useEffect, useRef, useState } from "react";
import { Sparkles, Info, X, ArrowRight } from "lucide-react";
import { useOnboardingState } from "@/hooks/use-onboarding";
import { COPY, type TourSection } from "@/data/onboarding-content";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { FirstValueMoment } from "./FirstValueMoment";

// Orchestrator für die /signale-Seite: Willkommen + Fortschritts-Checkliste + First-Value-
// Moment + einmalige "Was bedeuten die Badges?"-Info. Der Coach ruft die Tour über
// onStartTour auf (die Tour lebt in Signale, damit auch der Header-Button sie öffnen kann).
export function OnboardingCoach({
  setSection, onStartTour,
}: {
  setSection: (s: TourSection) => void;
  onStartTour: () => void;
}) {
  const st = useOnboardingState();

  // First-Value latchen: einmal zeigen, sobald echter Nutzen sichtbar ist, dann persistieren.
  const [fvKind, setFvKind] = useState<null | "draft" | "signal">(null);
  useEffect(() => {
    if (!fvKind && st.firstValue.ready && !st.progress.first_value_seen) {
      setFvKind(st.firstValue.kind);
      st.setFlag({ first_value_seen: true, first_value_kind: st.firstValue.kind ?? "signal" });
    }
  }, [st.firstValue, st.progress.first_value_seen, fvKind]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Wochen-Prioritäten gesehen": feuert, sobald die Prioritäten-Karte sichtbar wird
  // (nur im signale-Bereich, da andere Bereiche display:none sind).
  const weeklyFired = useRef(false);
  useEffect(() => {
    if (st.progress.seen_weekly || weeklyFired.current) return;
    const el = document.querySelector('[data-tour="weekly"]');
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !weeklyFired.current) {
        weeklyFired.current = true;
        st.setFlag({ seen_weekly: true });
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [st.progress.seen_weekly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Meilenstein-Aktion "Prioritäten ansehen" (section=signale) zählt als bewusstes Ansehen.
  const coachOnSection = (s: TourSection) => {
    setSection(s);
    if (s === "signale") {
      st.setFlag({ seen_weekly: true });
      window.setTimeout(() => {
        document.querySelector('[data-tour="weekly"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    } else {
      window.setTimeout(() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* noop */ } }, 40);
    }
  };

  if (st.loading) return null;

  const showChecklist = !st.progress.checklist_dismissed; // schließt die Fertig-Feier mit ein
  const showWelcome =
    showChecklist && !st.counts.complete &&
    !st.progress.welcome_dismissed && !st.progress.tour_completed && !st.progress.tour_skipped;
  const showBadges =
    showChecklist && !st.counts.complete && !showWelcome &&
    st.hasOwnAccount && !st.progress.badges_intro_dismissed;

  if (!fvKind && !showChecklist && !showWelcome) return null;

  return (
    <div className="space-y-4">
      {fvKind && <FirstValueMoment kind={fvKind} onDismiss={() => setFvKind(null)} />}

      {showWelcome ? (
        <WelcomeCard
          onStart={() => { st.setFlag({ welcome_dismissed: true }); onStartTour(); }}
          onLater={() => st.setFlag({ welcome_dismissed: true })}
        />
      ) : (
        showChecklist && (
          <>
            {showBadges && <BadgesIntro onDismiss={() => st.setFlag({ badges_intro_dismissed: true })} />}
            <OnboardingChecklist state={st} onStartTour={onStartTour} onSection={coachOnSection} />
          </>
        )
      )}
    </div>
  );
}

function WelcomeCard({ onStart, onLater }: { onStart: () => void; onLater: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-primary/[0.03] p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{COPY.welcomeTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xl">{COPY.welcomeBody}</p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button onClick={onStart} className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg px-4 py-2.5 hover:bg-primary/90">
              <Sparkles className="w-4 h-4" /> {COPY.welcomeCta}
            </button>
            <button onClick={onLater} className="text-sm text-muted-foreground hover:text-foreground px-3 py-2.5">
              {COPY.welcomeSkip}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgesIntro({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">{COPY.badgesIntroTitle}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{COPY.badgesIntroBody}</p>
        </div>
      </div>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Verstanden">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
