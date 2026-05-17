import { useState } from "react";
import { PriorityBadge } from "@/components/PriorityBadge";
import { useRecentEmails } from "@/hooks/use-api";
import ReviewVerdictButtons from "@/components/ReviewVerdictButtons";
import type { RecentEmail } from "@/lib/api-client";
import { REVIEW } from "@/data/strings.de";
import { Check, X, Eye, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewQueue() {
  const { data: emails, isLoading, error } = useRecentEmails();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Show items that have a draft or are pending review
  const items = (emails ?? []).filter((e) => e.has_draft || e.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{REVIEW.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "Lade…" : `${items.length} Vorschläge warten auf Freigabe.`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-sm text-destructive">
          Fehler beim Laden der Review Queue.
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Inbox className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="text-lg font-medium">{REVIEW.empty}</p>
          <p className="text-sm text-muted-foreground mt-1">{REVIEW.emptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card-hover">
              <div className="flex items-center gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <PriorityBadge priority={item.priority} showLabel />
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50 border border-border">
                      {item.action_type}
                    </span>
                    {item.has_draft && (
                      <span className="text-xs text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                        Entwurf
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-2">{item.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.sender} · {new Date(item.created_at).toLocaleString("de-DE")}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.has_draft && item.status !== "resolved" && (
                    <ReviewVerdictButtons
                      draftId={`${item.id}:draft:1`}
                    />
                  )}
                  <span className={`text-xs px-2 py-1 rounded-md border ${
                    item.status === "resolved"
                      ? "border-primary/30 text-primary bg-primary/10"
                      : "border-border text-muted-foreground bg-muted/30"
                  }`}>
                    {item.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
