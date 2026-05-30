/**
 * SpreadsheetConfigTab — Excel Live-Sync Konfiguration
 *
 * v4.36.0 (2026-05-28):
 *  - Verbundene-Datei-Card ist klappbar. Beim Aufklappen erscheinen:
 *    Keywords, Spalten-Mapping, **eingebetteter Datei-Audit** (pro Datei),
 *    Aktionen inkl. **Download-Button** (lädt S3-Version als .xlsx).
 *  - Globaler "Änderungsverlauf"-Tab ist entfernt (war über alle Dateien
 *    gemischt). Verlauf lebt jetzt pro Datei in der Expanded-Section.
 *  - `?sheet=<id>` Query-Param klappt die passende Datei automatisch auf
 *    + scrollt sie ins Sichtfeld (MiniUI Deep-Link aus content-script.js).
 *  - "Zur Quell-Mail"-Link pro Audit-Eintrag wenn source_email_subject +
 *    source_email_from vorhanden (Gmail-Suchlink, robust ohne messageId).
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useSpreadsheets,
  useSpreadsheetMappings,
  useSpreadsheetUpload,
  useSpreadsheetDelete,
  useSpreadsheetToggle,
  useSpreadsheetAudit,
  useSpreadsheetRevert,
  useSpreadsheetDownload,
} from "@/hooks/use-api";
import type {
  SpreadsheetConnection,
  SpreadsheetAuditEntry,
  SpreadsheetStyleRisk,
} from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import OneDriveConnectButton from "@/components/OneDriveConnectButton";
import SharePointConnectButton from "@/components/SharePointConnectButton";
import {
  FileSpreadsheet,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Globe,
  HardDrive,
  Table2,
  AlertTriangle,
  Info,
  Download,
  History,
  RotateCcw,
  Mail,
  ArrowRight,
} from "lucide-react";

const PURPOSE_LABELS: Record<string, string> = {
  general: "Allgemein",
  appointments: "Termine",
  tenants: "Mieter",
  maintenance: "Wartung / Reparaturen",
};

const PROVIDER_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  google_sheets: { label: "Google Sheets", icon: Globe },
  microsoft_graph: { label: "Microsoft Excel (OneDrive)", icon: Globe },
  local: { label: "Lokale Datei", icon: HardDrive },
};

const SEMANTIC_FIELD_LABELS: Record<string, string> = {
  tenant_name: "Mieter-Name",
  apartment: "Wohnung",
  date: "Datum",
  time: "Uhrzeit",
  status: "Status",
  notes: "Notizen",
  contractor: "Handwerker",
  contractor_email: "Handwerker-E-Mail",
  reason: "Grund",
  next_date: "Nächster Termin",
  address: "Adresse",
  phone: "Telefon",
  object_name: "Objekt",
  task_type: "Aufgabentyp",
};

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

/** Baut einen Gmail-Suchlink fuer eine Quell-Mail (robust ohne messageId). */
function buildGmailSearchLink(from: string | null, subject: string | null): string | null {
  if (!from && !subject) return null;
  const parts: string[] = [];
  if (from) parts.push(`from:${from.trim()}`);
  if (subject) parts.push(`subject:${subject.trim()}`);
  // Gmail erwartet URL-encoded Query (Leerzeichen werden zu +).
  const q = parts.join(" ");
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
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

/**
 * InlineFileAudit — eingebetteter Pro-Datei-Audit (ersetzt globalen SpreadsheetAuditTab).
 * Zeigt die letzten 10 Aktionen dieser einen Datei + Pagination.
 */
function InlineFileAudit({ spreadsheetId }: { spreadsheetId: number }) {
  const [page, setPage] = useState(1);
  const perPage = 10;
  const { data, isLoading } = useSpreadsheetAudit({
    spreadsheet_id: spreadsheetId,
    page,
    per_page: perPage,
  });
  const revertMut = useSpreadsheetRevert();
  const [revertedBulkIds, setRevertedBulkIds] = useState<Set<string>>(new Set());

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const groups = groupByBulk(entries);

  const handleRevert = (bulkId: string) => {
    if (!confirm("Möchtest du diese Änderung wirklich rückgängig machen?")) return;
    revertMut.mutate(bulkId, {
      onSuccess: () => setRevertedBulkIds((prev) => new Set(prev).add(bulkId)),
    });
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" />
        Änderungsverlauf dieser Datei
        {total > 0 && (
          <span className="text-muted-foreground/70">({total})</span>
        )}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 italic">
          Noch keine Änderungen.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const first = group[0];
            const isBulk = group.length > 1;
            const isReverted = first.bulk_id ? revertedBulkIds.has(first.bulk_id) : false;
            const canRevert =
              first.bulk_id &&
              !isReverted &&
              group.some((e) => e.action === "update_cell" || e.action === "add_row");
            const actionInfo = ACTION_LABELS[first.action] ?? {
              label: first.action,
              color: "text-muted-foreground",
            };
            const mailLink = buildGmailSearchLink(first.source_email_from, first.source_email_subject);

            return (
              <div key={first.id} className="border border-border/60 rounded p-2 space-y-1.5 bg-background/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                      {isBulk && ` (${group.length} Zellen)`}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {formatDate(first.created_at)}
                    </span>
                  </div>
                  {canRevert && (
                    <button
                      disabled={revertMut.isPending}
                      onClick={() => handleRevert(first.bulk_id!)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rückgängig
                    </button>
                  )}
                  {isReverted && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Rückgängig
                    </span>
                  )}
                </div>

                {first.source_email_subject && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate flex-1">
                      {first.source_email_from && <strong>{first.source_email_from}:</strong>}{" "}
                      {first.source_email_subject}
                    </span>
                    {mailLink && (
                      <a
                        href={mailLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-blue-400 hover:underline whitespace-nowrap"
                        title="In Gmail anzeigen"
                      >
                        Zur Quell-Mail →
                      </a>
                    )}
                  </div>
                )}

                {group
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
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40"
          >
            ← Zurück
          </button>
          <span className="text-xs text-muted-foreground">
            Seite {page} von {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Style-Risk-Badge (v4.38.0 XLSX-Diff-Tool) ───────────────────────────
type StyleRiskScore = "green" | "yellow" | "red" | "blocked" | "unknown";

const RISK_DISPLAY: Record<StyleRiskScore, { label: string; emoji: string; cls: string }> = {
  green:   { label: "Live-Sync ready",        emoji: "🟢", cls: "text-emerald-400 bg-emerald-400/10" },
  yellow:  { label: "Mit Hinweisen",          emoji: "🟡", cls: "text-amber-400 bg-amber-400/10" },
  red:     { label: "Datenverlust-Risiko",    emoji: "🔴", cls: "text-red-400 bg-red-400/10" },
  blocked: { label: "Live-Sync nicht möglich", emoji: "⛔", cls: "text-red-500 bg-red-500/20" },
  unknown: { label: "Risiko unbekannt",       emoji: "❓", cls: "text-muted-foreground bg-muted/30" },
};

function StyleRiskBadge({ risk }: { risk?: SpreadsheetStyleRisk | null }) {
  if (!risk) {
    return (
      <span
        title="Style-Risk noch nicht analysiert (Datei vor v4.38.0 hochgeladen)"
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-muted-foreground bg-muted/30"
      >
        ❓ Nicht analysiert
      </span>
    );
  }
  const d = RISK_DISPLAY[risk.risk_score] ?? RISK_DISPLAY.unknown;
  const allFeatures = [
    ...(risk.features.red || []).map(f => `🔴 ${f.label}`),
    ...(risk.features.yellow || []).map(f => `🟡 ${f.label}`),
    ...(risk.features.green || []).map(f => `🟢 ${f.label}`),
  ].join("\n");
  return (
    <span
      title={`${risk.summary_de}\n\n${allFeatures || "Keine Features erkannt."}`}
      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium ${d.cls}`}
    >
      <span>{d.emoji}</span>
      <span>{d.label}</span>
    </span>
  );
}

function StyleRiskBanner({ risk }: { risk?: SpreadsheetStyleRisk | null }) {
  if (!risk) return null;
  if (risk.risk_score !== "red" && risk.risk_score !== "blocked") return null;
  return (
    <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
      <div className="flex-1 space-y-1">
        <p className="font-medium text-red-200">{risk.summary_de}</p>
        {risk.warnings.length > 0 && (
          <ul className="list-disc list-inside space-y-0.5 text-red-300/80">
            {risk.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
        <p className="text-red-400/60 pt-1">
          ↳ Live-Sync funktioniert trotzdem, aber genannte Features gehen beim ersten Update verloren.
        </p>
      </div>
    </div>
  );
}

function SpreadsheetRow({
  sheet,
  onDelete,
  onToggle,
  defaultExpanded,
}: {
  sheet: SpreadsheetConnection;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data: mappingsData, isLoading: mappingsLoading } = useSpreadsheetMappings(
    expanded ? sheet.id : null
  );
  const downloadMut = useSpreadsheetDownload();
  const mappings = mappingsData?.mappings ?? [];
  const rowRef = useRef<HTMLDivElement>(null);

  const ProviderIcon = PROVIDER_LABELS[sheet.provider]?.icon ?? Globe;

  // Wenn defaultExpanded (Deep-Link `?sheet=<id>`) — automatisch ins Sichtfeld scrollen.
  useEffect(() => {
    if (defaultExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultExpanded]);

  const isLocal = sheet.provider === "local";

  return (
    <div ref={rowRef} id={`spreadsheet-${sheet.id}`} className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{sheet.sheet_name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ProviderIcon className="w-3 h-3" />
            <span>{PROVIDER_LABELS[sheet.provider]?.label ?? sheet.provider}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{PURPOSE_LABELS[sheet.purpose] ?? sheet.purpose}</span>
            {sheet.auto_provisioned && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span className="text-blue-400">Auto</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* v4.38.0 — XLSX-Diff-Tool Style-Risk-Badge */}
          <StyleRiskBadge risk={sheet.style_risk} />
          {sheet.is_active ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aktiv
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="w-3.5 h-3.5" /> Inaktiv
            </span>
          )}
        </div>
      </div>

      {/* Expanded: Mappings + Audit + Actions */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/10">
          {/* v4.38.0 — XLSX-Diff-Tool Warn-Banner bei red/blocked */}
          <StyleRiskBanner risk={sheet.style_risk} />
          {/* Keywords */}
          {sheet.purpose_keywords.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Erkennungs-Keywords</p>
              <div className="flex flex-wrap gap-1">
                {sheet.purpose_keywords.map((kw, i) => (
                  <span key={i} className="inline-block px-2 py-0.5 rounded bg-muted text-xs">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Column Mappings */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Spalten-Zuordnung</p>
            {mappingsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : mappings.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic">Keine Zuordnungen</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {mappings.map((m) => (
                  <div key={m.id} className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">
                      {SEMANTIC_FIELD_LABELS[m.semantic_field] ?? m.semantic_field}
                    </span>
                    <span className="font-mono text-foreground">
                      {m.column_ref}
                      {m.is_search_key && (
                        <span className="ml-1 text-blue-400" title="Suchschlüssel">
                          🔍
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-File Audit (eingebettet, v4.36.0) */}
          <div className="pt-2 border-t border-border/50">
            <InlineFileAudit spreadsheetId={sheet.id} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {isLocal && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadMut.mutate(sheet.id);
                }}
                disabled={downloadMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
                title="Aktuelle Version aus der Cloud herunterladen — enthält alle UseEasy-Updates"
              >
                <Download className="w-3 h-3" />
                {downloadMut.isPending ? "Lädt..." : "Herunterladen"}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(sheet.id, !sheet.is_active);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
            >
              {sheet.is_active ? "Deaktivieren" : "Aktivieren"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`"${sheet.sheet_name}" wirklich löschen? Die Excel-Datei selbst bleibt erhalten.`)) {
                  onDelete(sheet.id);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Entfernen
            </button>
            {downloadMut.isError && (
              <span className="text-xs text-red-400">
                Fehler: {(downloadMut.error as Error).message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SpreadsheetConfigTab() {
  const { data, isLoading } = useSpreadsheets();
  const uploadMut = useSpreadsheetUpload();
  const deleteMut = useSpreadsheetDelete();
  const toggleMut = useSpreadsheetToggle();
  const [searchParams] = useSearchParams();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const spreadsheets = data?.spreadsheets ?? [];

  // v4.36.0: Deep-Link aus MiniUI (?sheet=<id>) — bestimmen, welche Card initial expanded.
  const deepLinkId = useMemo(() => {
    const raw = searchParams.get("sheet");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert("Nur .xlsx, .xls oder .csv Dateien werden unterstützt.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert("Datei zu groß (max. 4 MB beim Direkt-Upload).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate({
        file_name: file.name,
        file_content_base64: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-6">
      {/* Info Box */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Excel Live-Sync</p>
          <p>
            Lade Excel-Dateien hoch — UseEasy erkennt automatisch Spalten und ordnet sie semantisch
            zu (z.B. Mieter-Name, Wohnung, Datum). Bei eingehenden E-Mails wird die passende Datei
            gefunden und Änderungen per Klick übertragen. Mit "Herunterladen" holst du dir
            jederzeit die aktuelle Version mit allen UseEasy-Updates auf deinen Mac.
          </p>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? "border-emerald-400 bg-emerald-400/5"
            : "border-border hover:border-muted-foreground/30"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Excel-Datei hierher ziehen oder{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => fileInputRef.current?.click()}
          >
            durchsuchen
          </button>
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls, .csv — max. 4 MB</p>

        {uploadMut.isPending && (
          <div className="mt-3 text-xs text-blue-400">Datei wird verarbeitet...</div>
        )}
        {uploadMut.isSuccess && (
          <div className="mt-3 text-xs text-emerald-400">
            Hochgeladen: {uploadMut.data.sheet_name} — {uploadMut.data.auto_mapped} Spalten erkannt
          </div>
        )}
        {uploadMut.isError && (
          <div className="mt-3 text-xs text-red-400">
            Fehler: {(uploadMut.error as Error).message}
          </div>
        )}
      </div>

      {/* v4.39.0 — OneDrive Live-Sync: Alternative zum lokalen Upload */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">oder</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <OneDriveConnectButton />
        <p className="text-xs text-muted-foreground/60 max-w-md">
          Verbinde eine Excel-Datei direkt aus OneDrive — UseEasy schreibt Updates dann
          automatisch dorthin (kein manueller Download nötig).
        </p>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <SharePointConnectButton />
        <p className="text-xs text-muted-foreground/60 max-w-md">
          Oder durchsuche eine SharePoint-Site, wähle eine Dokumentbibliothek und verbinde
          eine Excel-Datei direkt von dort.
        </p>
      </div>

      {/* Spreadsheet List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Table2 className="w-4 h-4" />
            Verbundene Dateien
          </h3>
          <span className="text-xs text-muted-foreground">
            {spreadsheets.length} {spreadsheets.length === 1 ? "Datei" : "Dateien"}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : spreadsheets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <FileSpreadsheet className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Noch keine Excel-Dateien verbunden</p>
            <p className="text-xs text-muted-foreground/70">
              Lade eine .xlsx-Datei hoch — Spalten werden automatisch erkannt.
            </p>
          </div>
        ) : (
          spreadsheets.map((sheet) => (
            <SpreadsheetRow
              key={sheet.id}
              sheet={sheet}
              onDelete={(id) => deleteMut.mutate(id)}
              onToggle={(id, active) => toggleMut.mutate({ spreadsheetId: id, isActive: active })}
              defaultExpanded={deepLinkId === sheet.id}
            />
          ))
        )}
      </div>

      {/* Warning if feature disabled */}
      {spreadsheets.length > 0 && spreadsheets.every((s) => !s.is_active) && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Alle Dateien deaktiviert. E-Mails werden nicht mit Excel abgeglichen.
        </div>
      )}
    </div>
  );
}
