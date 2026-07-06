import { Link } from "react-router-dom";
import { Plug, ShieldCheck, Activity, ArrowRight, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingState } from "@/hooks/use-onboarding";
import { COPY } from "@/data/onboarding-content";

type Nudge = {
  key: string;
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
  tone: "primary" | "muted";
};

// In-console-Onboarding-Nudges (opt-in, NICHT ueber customer-bot). Dezente Hinweise in der
// Console. Bewusst in-console, damit die customer-bot-Lane frei bleibt. Jeder Hinweis einzeln
// ausblendbar (persistiert in nudges_dismissed). Zeigt hoechstens die 2 wichtigsten.
export function OnboardingNudges({ max = 2 }: { max?: number }) {
  const st = useOnboardingState();
  if (st.loading) return null;
  const dismissed = new Set(st.progress.nudges_dismissed ?? []);

  const all: Nudge[] = [];
  if (!st.facts.mailboxConnected) {
    all.push({
      key: "mailbox", icon: Plug, tone: "primary",
      title: COPY.nudgeMailboxTitle, body: COPY.nudgeMailboxBody,
      href: "/einstellungen?tab=integrations", cta: "Postfach verbinden",
    });
  }
  if (!st.counts.complete) {
    all.push({
      key: "explore", icon: Activity, tone: "muted",
      title: `Erste Schritte: ${st.counts.done}/${st.counts.total} erledigt`,
      body: "Lass dir auf der Signale-Seite jede Zahl von Jana erklären und hak deine ersten Schritte ab.",
      href: "/signale", cta: "Zu den Signalen",
    });
  }
  if (st.hasOwnAccount && !st.facts.consentSet) {
    all.push({
      key: "consent", icon: ShieldCheck, tone: "muted",
      title: COPY.nudgeConsentTitle, body: COPY.nudgeConsentBody,
      href: "/signale", cta: "Freigabe einrichten",
    });
  }

  const visible = all.filter((n) => !dismissed.has(n.key)).slice(0, max);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((n) => {
        const Icon = n.icon;
        return (
          <div
            key={n.key}
            className={cn(
              "rounded-lg border p-4 flex items-start justify-between gap-4 flex-wrap",
              n.tone === "primary" ? "border-primary/30 bg-primary/5" : "border-border bg-card/40",
            )}
          >
            <div className="min-w-0 flex items-start gap-3">
              <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", n.tone === "primary" ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={n.href}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {n.cta} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => st.setFlag({ nudges_dismissed: [...(st.progress.nudges_dismissed ?? []), n.key] })}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Hinweis ausblenden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
