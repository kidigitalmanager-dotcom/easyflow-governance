import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemoryEntities } from "@/hooks/use-memory";
import { num, type MemoryEntity } from "@/lib/memory-api";
import { SectionCard, Chip, Dot } from "@/components/ue/primitives";
import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Fristen & Zusagen: erkannte Fristen (case_state via memory-engine
// entity_profiles.next_deadline_at) pro Gegenstelle. Ueberfaellig rot,
// naechste 7 Tage amber. Nightly-Datenstand — ehrlich ausgewiesen.
// Rendert NICHTS bei leer/Fehler (Heute bleibt ruhig).
//
// Redesign 27.07.2026: neuer Look + Filter 7/14 Tage aus Leons Entwurf.
// Der Filter arbeitet rein client-seitig auf denselben Daten — es wird kein
// neuer Endpoint erfunden.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function deadlineTone(iso: string, now = Date.now()): "overdue" | "soon" | "later" {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "later";
  if (t < now - DAY_MS / 2) return "overdue";
  if (t <= now + 7 * DAY_MS) return "soon";
  return "later";
}

type Horizon = 7 | 14 | 0; // 0 = alle

export function FristenBoard() {
  const q = useMemoryEntities(200);
  const [horizon, setHorizon] = useState<Horizon>(7);

  if (q.isLoading || q.isError) return null;

  const all = (q.data ?? [])
    .filter((e): e is MemoryEntity & { next_deadline_at: string } => !!e.next_deadline_at)
    .sort((a, b) => Date.parse(a.next_deadline_at) - Date.parse(b.next_deadline_at));
  if (all.length === 0) return null;

  const now = Date.now();
  const within = (days: number) =>
    all.filter((r) => {
      const t = Date.parse(r.next_deadline_at);
      return Number.isFinite(t) && t <= now + days * DAY_MS;
    });

  const count7 = within(7).length;
  const count14 = within(14).length;
  const rows = (horizon === 0 ? all : within(horizon)).slice(0, 8);
  const overdue = all.filter((r) => deadlineTone(r.next_deadline_at, now) === "overdue").length;

  return (
    <SectionCard
      title="Fristen & Zusagen"
      subtitle={`${overdue > 0 ? `${overdue} überfällig · ` : ""}erkannt aus deiner Kommunikation · nächtlich`}
      bodyClassName="p-0"
      action={
        <div className="flex items-center gap-1.5">
          <Chip active={horizon === 7} count={count7} onClick={() => setHorizon(7)}>
            7 Tage
          </Chip>
          <Chip active={horizon === 14} count={count14} onClick={() => setHorizon(14)}>
            14 Tage
          </Chip>
          <Chip active={horizon === 0} count={all.length} onClick={() => setHorizon(0)}>
            Alle
          </Chip>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          Keine Frist in diesem Zeitraum.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => {
            const tone = deadlineTone(r.next_deadline_at, now);
            const who = r.display_name || r.entity_email || "Unbekannt";
            const commitments = num(r.open_commitments) ?? 0;
            return (
              <li key={r.entity_hash} className="flex items-center gap-3 px-4 py-2.5">
                <Dot tone={tone === "overdue" ? "danger" : tone === "soon" ? "amber" : "muted"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{who}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Frist {new Date(r.next_deadline_at).toLocaleDateString("de-DE")}
                    {commitments > 0 ? ` · ${commitments} offene Zusage${commitments > 1 ? "n" : ""}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                    (tone === "overdue"
                      ? "bg-danger/15 text-danger"
                      : tone === "soon"
                        ? "bg-amber/15 text-amber"
                        : "bg-secondary text-muted-foreground")
                  }
                >
                  {tone === "overdue" ? "überfällig" : tone === "soon" ? "bald" : "geplant"}
                </span>
                {r.entity_email && (
                  <Link
                    to={`/audit?q=${encodeURIComponent(r.entity_email)}`}
                    className="flex items-center gap-0.5 whitespace-nowrap text-[11.5px] text-primary hover:underline"
                  >
                    Verlauf <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
