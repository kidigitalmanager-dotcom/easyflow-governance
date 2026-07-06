import { Sparkles, PartyPopper, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { COPY } from "@/data/onboarding-content";

// First-Value-Moment: der Punkt, an dem der Kunde den ersten echten Nutzen sieht, wird
// explizit hervorgehoben und gefeiert. Der Aktivierungs-Hebel. Wird einmal gezeigt.
export function FirstValueMoment({ kind, onDismiss }: { kind: "draft" | "signal"; onDismiss: () => void }) {
  const isDraft = kind === "draft";
  const title = isDraft ? COPY.firstValueDraftTitle : COPY.firstValueSignalTitle;
  const body = isDraft ? COPY.firstValueDraftBody : COPY.firstValueSignalBody;
  const to = isDraft ? "/review" : undefined;
  const cta = isDraft ? "Entwürfe ansehen" : undefined;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
          <PartyPopper className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-[11px] uppercase tracking-wide text-primary font-semibold">Erster Nutzen-Moment</p>
          </div>
          <p className="text-sm font-semibold text-foreground mt-1">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
          {to && cta && (
            <Link to={to} onClick={onDismiss} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {cta} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Schließen">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
