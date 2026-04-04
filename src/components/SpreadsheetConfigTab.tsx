/**
 * SpreadsheetConfigTab — Excel Live-Sync Konfiguration
 * Zeigt verbundene Spreadsheets, Spalten-Mappings, Upload-Funktion.
 */

import { useState, useRef } from "react";
import {
  useSpreadsheets,
  useSpreadsheetMappings,
  useSpreadsheetUpload,
  useSpreadsheetDelete,
  useSpreadsheetToggle,
} from "@/hooks/use-api";
import type {
  SpreadsheetConnection,
  SpreadsheetColumnMapping,
} from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
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

function SpreadsheetRow({
  sheet,
  onDelete,
  onToggle,
}: {
  sheet: SpreadsheetConnection;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: mappingsData, isLoading: mappingsLoading } = useSpreadsheetMappings(
    expanded ? sheet.id : null
  );
  const mappings = mappingsData?.mappings ?? [];

  const ProviderIcon = PROVIDER_LABELS[sheet.provider]?.icon ?? Globe;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
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

      {/* Expanded: Mappings + Actions */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/10">
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

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const spreadsheets = data?.spreadsheets ?? [];

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert("Nur .xlsx, .xls oder .csv Dateien werden unterstützt.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Datei zu groß (max. 10 MB).");
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
            gefunden und Änderungen per Klick übertragen.
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
        <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls, .csv — max. 10 MB</p>

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