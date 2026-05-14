import { useState } from "react";
import { useSalesCalls, useVoiceReps } from "@/hooks/use-api";
import type { SalesCall } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PlayCircle, ExternalLink,
  ChevronLeft, ChevronRight, History, Filter,
} from "lucide-react";

const PER_PAGE = 25;

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  completed:    { label: "Erfolgreich",   cls: "text-green-500 bg-green-500/10 border-green-500/20" },
  "no-answer":  { label: "Keine Antwort", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  busy:         { label: "Besetzt",       cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  failed:       { label: "Fehlgeschlagen",cls: "text-red-400 bg-red-400/10 border-red-400/20" },
  canceled:     { label: "Abgebrochen",   cls: "text-muted-foreground bg-muted border-border" },
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">—</span>;
  const meta = OUTCOME_META[outcome] ?? { label: outcome, cls: "text-muted-foreground bg-muted border-border" };
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s} s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SalesCallsAuditTab() {
  const [page, setPage] = useState(0);
  const [repFilter, setRepFilter] = useState<string>("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("");

  const { data: repsData } = useVoiceReps();
  const { data, isLoading, error } = useSalesCalls({
    rep_id: repFilter || undefined,
    outcome: outcomeFilter || undefined,
    limit: PER_PAGE,
    offset: page * PER_PAGE,
  });

  const calls = data?.calls ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.has_more ?? false;
  const reps = repsData?.reps ?? [];

  const resetPageAnd = (fn: () => void) => { setPage(0); fn(); };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold">Sales-Calls-Audit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alle Anrufe deiner Vertriebler — mit Recording und HubSpot-Verknüpfung.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={repFilter}
              onChange={(e) => resetPageAnd(() => setRepFilter(e.target.value))}
              className="bg-muted/50 border border-border rounded-md px-2 py-1 text-xs"
            >
              <option value="">Alle Vertriebler</option>
              {reps.map((r) => (
                <option key={r.rep_id} value={r.rep_id}>{r.name}</option>
              ))}
            </select>
            <select
              value={outcomeFilter}
              onChange={(e) => resetPageAnd(() => setOutcomeFilter(e.target.value))}
              className="bg-muted/50 border border-border rounded-md px-2 py-1 text-xs"
            >
              <option value="">Alle Ergebnisse</option>
              <option value="completed">Erfolgreich</option>
              <option value="no-answer">Keine Antwort</option>
              <option value="busy">Besetzt</option>
              <option value="failed">Fehlgeschlagen</option>
              <option value="canceled">Abgebrochen</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400">Anrufe konnten nicht geladen werden.</p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <History className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Keine Anrufe gefunden</p>
            <p className="text-xs text-muted-foreground/70">
              {data?.note === "sales_calls_table_not_migrated"
                ? "Die sales_calls-Tabelle ist noch nicht migriert (migration_v1.13)."
                : repFilter || outcomeFilter
                  ? "Keine Anrufe mit diesen Filtern."
                  : "Sobald deine Vertriebler telefonieren, erscheinen die Anrufe hier."}
            </p>
          </div>
        ) : (
          <>
            {/* Header row (desktop) */}
            <div className="hidden md:grid grid-cols-[1.4fr_1.3fr_0.8fr_1fr_0.9fr] gap-3 px-2 pb-2 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Datum / Vertriebler</span>
              <span>Lead</span>
              <span>Dauer</span>
              <span>Ergebnis</span>
              <span className="text-right">Recording / CRM</span>
            </div>
            <div className="divide-y divide-border">
              {calls.map((call: SalesCall) => {
                const inbound = (call.direction ?? "").startsWith("inbound");
                return (
                  <div
                    key={call.call_id}
                    className="grid grid-cols-1 md:grid-cols-[1.4fr_1.3fr_0.8fr_1fr_0.9fr] gap-1 md:gap-3 py-3 md:items-center"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {inbound
                        ? <PhoneIncoming className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        : <PhoneOutgoing className="w-3.5 h-3.5 text-primary shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{call.rep_name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDateTime(call.started_at)}</p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{call.lead_number ?? call.lead_id ?? "—"}</p>
                      {call.notes && (
                        <p className="text-[11px] text-muted-foreground truncate" title={call.notes}>
                          {call.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDuration(call.duration_seconds)}</div>
                    <div><OutcomeBadge outcome={call.outcome} /></div>
                    <div className="flex items-center gap-1.5 md:justify-end flex-wrap">
                      {call.recording_url ? (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          Recording
                        </a>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">kein Recording</span>
                      )}
                      {call.hubspot_url && (
                        <a
                          href={call.hubspot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                          style={{ color: "#FF7A59" }}
                          title={`HubSpot Activity ${call.hubspot_activity_id}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                          HubSpot
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {total} Anruf{total === 1 ? "" : "e"} gesamt · Seite {page + 1}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Zurück
                </Button>
                <Button
                  variant="ghost" size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
