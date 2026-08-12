// -----------------------------------------------------------------------------
// MeineLeadListen.tsx — die Arbeits-Linse auf Lead-Listen.
//
// 🔴 Dieselbe Quelle, zwei Linsen. `LeadUploadTab` unter System bleibt die
// Verwaltung (hochladen, zuweisen, loeschen, ALLE Listen). Hier steht nur, was
// ein Vertriebler zum Arbeiten braucht: welche Listen gehoeren mir, wie viele
// Leads liegen darin, wann kamen sie. Kein Upload, kein Zuweisen, kein
// Loeschen — dafuer gibt es die Verwaltung, und ein zweiter Weg dorthin waere
// ein zweiter Weg, etwas kaputtzumachen.
//
// Die Filterregel selbst steht als reine Funktion in src/lib/vertrieb.ts.
// -----------------------------------------------------------------------------
import { useLeadLists } from "@/hooks/use-api";
import { meineListen, istZentral } from "@/lib/vertrieb";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { SectionCard, EmptyState } from "@/components/ue/primitives";
import { ListChecks, Users, User } from "lucide-react";

function datum(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function MeineLeadListen({ repId, repName }: { repId: string | null; repName?: string | null }) {
  const q = useLeadLists();
  const alle = q.data?.lists ?? [];
  const meine = meineListen(alle, repId);
  const fremde = alle.length - meine.length;

  return (
    <SectionCard
      title="Meine Listen"
      subtitle={
        repId
          ? `Listen, die ${repName || "dir"} zugewiesen sind, dazu die zentralen Listen für alle.`
          : "Ohne zugeordneten Vertriebler stehen hier nur die zentralen Listen."
      }
      action={
        meine.length > 0 ? (
          <span className="text-[11.5px] text-muted-foreground">
            {meine.length === 1 ? "1 Liste" : `${meine.length} Listen`}
            {fremde > 0 ? ` · ${fremde} nicht für dich` : ""}
          </span>
        ) : null
      }
    >
      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : q.isError ? (
        <div className="p-4">
          <QueryErrorNotice
            label="Deine Lead-Listen konnten nicht geladen werden."
            onRetry={() => { void q.refetch(); }}
            retrying={q.isFetching}
          />
        </div>
      ) : meine.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-7 w-7" />}
          title="Noch keine Liste für dich"
          description={
            alle.length > 0
              ? "Es gibt Lead-Listen, aber keine ist dir zugewiesen. Die Zuweisung passiert unter System, Voice & Co-Pilot, Leads."
              : "Sobald jemand eine Liste hochlädt und dir zuweist, steht sie hier."
          }
        />
      ) : (
        <ul className="divide-y divide-line-soft">
          {meine.map((l) => (
            <li key={l.list_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">{l.list_name || l.list_id}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {l.lead_count} Leads · hochgeladen {datum(l.uploaded_at)}
                  {l.source ? ` · ${l.source}` : ""}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {istZentral(l)
                  ? <><Users className="h-3 w-3" />zentral</>
                  : <><User className="h-3 w-3" />dir zugewiesen</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default MeineLeadListen;
