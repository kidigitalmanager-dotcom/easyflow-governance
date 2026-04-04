/**
 * SpreadsheetAuditTab — Änderungsverlauf für Excel Live-Sync
 * Zeigt alle Spreadsheet-Aktionen mit Gruppierung nach bulk_id,
 * Vorher/Nachher-Werte, Revert-Funktion und Paginierung.
 */

import { useState } from "react";
import {
  useSpreadsheetAudit,
  useSpreadsheets,
  useSpreadsheetRevert,
} from "@/hooks/use-api";
import type { SpreadsheetAuditEntry } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Mail,
  ArrowRight,
  FileSpreadsheet,
  Filter,
  CheckCircle2,
} from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  update_cell: { label: "Zelle aktualisiert", color: "text-blue-400" },
  add_row: { label: "Zeile hinzugefügt", color: "text-emerald-400" },
  search: { label: "Suche", color: "text-muted-foreground" },
  preview: { label: "Vorschau", color: "text-muted-foreground" },
  auto_provision: { label: "Auto-Erkennung", color: "text-purple-400" },
  draft_from_template: { label: "Entwurf erstellt", color: "text-amber-400" },
  revert: { label: "Rückgängig", color: "text-red-400" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Groups consecutive entries with same bulk_id */
function groupByBulk(entries: SpreadsheetAuditEntry[]): SpreadsheetAuditEntry[][] {
  const groups: SpreadsheetAuditEntry[][] = [];
  let currentBulk: string | null = null;
  let currentGroup: SpreadsheetAuditEntry[] = [];

  for (const entry of entries) {
    if (entry.bulk_id && entry.bulk_id === currentBulk) {
      currentGroup.push(entry);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [entry];
      currentBulk = entry.bulk_id;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}

function AuditGroup({
  entries,
  onRevert,
  isReverting,
  revertedBulkIds,
}: {
  entries: SpreadsheetAuditEntry[];
  onRevert: (bulkId: string) => void;
  isReverting: boolean;
  revertedBulkIds: Set<string>;
}) {
  const first = entries[0];
  const isBulk = entries.length > 1;
  const bulkId = first.bulk_id;
  const isReverted = bulkId ? revertedBulkIds.has(bulkId) : false;
  const canRevert =
    bulkId &&
    !isReverted &&
    entries.some((e) => e.action === "update_cell" || e.action === "add_row");

  const actionInfo = ACTION_LABELS[first.action] ?? {
    label: first.action,
    color: "text-muted-foreground",
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${actionInfo.color}`}>
            {actionInfo.label}
            {isBulk && ` (${entries.length} Zellen)`}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(first.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {first.performed_by === "user_confirmed" && (
            <span className="text-xs text-muted-foreground/60">Bestätigt</span>
          )}
          {canRevert && (
            <button
              disabled={isReverting}
              onClick={() => onRevert(bulkId!)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Rückgängig
            </button>
          )}
          {isReverted && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Rückgängig gemacht
            </span>
          )}
        </div>
      </div>

      {/* Email source */}
      {first.source_email_subject && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {first.source_email_from && <strong>{first.source_email_from}:</strong>}{" "}
            {first.source_email_subject}
          </span>
        </div>
      )}

      {/* Sheet info */}
      {first.sheet_name && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileSpreadsheet className="w-3 h-3 shrink-0" />
          <span>
            {first.sheet_name}
            {first.row_index != null && ` — Zeile ${first.row_index}`}
          </span>
        </div>
      )}

      {/* Cell changes */}
      {entries
        .filter((e) => e.action === "update_cell" || e.action === "add_row")
        .map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1"
          >
            <span className="font-mono text-muted-foreground w-16 shrink-0">
              {e.column_ref ?? "?"}
            </span>
            {e.old_value != null && (
              <>
                <span className="text-red-400/70 line-through truncate max-w-[120px]">
                  {e.old_value || "(leer)"}
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              </>
            )}
            <span className="text-emerald-400 truncate max-w-[160px] font-medium">
              {e.new_value || "(leer)"}
            </span>
          </div>
        ))}
    </div>
  );
}

export default function SpreadsheetAuditTab() {
  const [page, setPage] = useState(1);
  const [filterSheet, setFilterSheet] = useState<number | undefined>(undefined);
  const perPage = 20;

  const { data: auditData, isLoading } = useSpreadsheetAudit({
    spreadsheet_id: filterSheet,
    page,
    per_page: perPage,
  });
  const { data: sheetsData } = useSpreadsheets();
  const revertMut = useSpreadsheetRevert();

  const [revertedBulkIds, setRevertedBulkIds] = useState<Set<string>>(new Set());

  const entries = auditData?.entries ?? [];
  const total = auditData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const sheets = sheetsData?.spreadsheets ?? [];

  const groups = groupByBulk(entries);

  const handleRevert = (bulkId: string) => {
    if (!confirm("Möchtest du diese Änderung wirklich rückgängig machen?")) return;
    revertMut.mutate(bulkId, {
      onSuccess: () => {
        setRevertedBulkIds((prev) => new Set(prev).add(bulkId));
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header + Filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="w-4 h-4" />
          Änderungsverlauf
        </h3>

        {sheets.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              className="bg-muted/50 border border-border rounded-md px-2 py-1 text-xs text-foreground"
              value={filterSheet ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setFilterSheet(val ? Number(val) : undefined);
                setPage(1);
              }}
            >
              <option value="">Alle Dateien</option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sheet_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Audit List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <History className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Noch keine Änderungen</p>
          <p className="text-xs text-muted-foreground/70">
            Sobald E-Mails in Excel-Dateien übertragen werden, erscheint hier der Verlauf.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, i) => (
            <AuditGroup
              key={group[0].id}
              entries={group}
              onRevert={handleRevert}
              isReverting={revertMut.isPending}
              revertedBulkIds={revertedBulkIds}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Zurück
          </button>
          <span className="text-xs text-muted-foreground">
            Seite {page} von {totalPages} ({total} Einträge)
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors disabled:opacity-40"
          >
            Weiter <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}