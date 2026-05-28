// v4.39.0 — OneDrive/SharePoint Live-Sync: einfacher Console-Picker.
// Button "Aus OneDrive verbinden" → Dialog listet die .xlsx/.xlsm-Dateien des
// Tenants (Backend /v1/spreadsheet/onedrive/list, nutzt den serverseitig
// gehaltenen Graph-Token — kein MSAL/SPA-Redirect im Frontend). Auswahl →
// /v1/spreadsheet/connect/onedrive. Style-Risk-Badge erscheint danach automatisch
// in der Datei-Liste (provider-agnostisch).
import { useState } from "react";
import { toast } from "sonner";
import { Cloud, FileSpreadsheet, Loader2, RefreshCw, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useOneDriveFiles, useConnectOneDrive } from "@/hooks/use-api";
import type { SpreadsheetOneDriveFile } from "@/lib/api-client";

function isReconnect(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /reconnect_required|no_outlook_credentials|no_refresh_token/i.test(msg);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (isReconnect(err)) {
    return "UseEasy braucht einmalig die OneDrive-Datei-Berechtigung. Bitte verbinde dein Microsoft-Konto neu (Einstellungen → Integrationen) und bestätige die Datei-Freigabe.";
  }
  if (/spreadsheet_already_exists/i.test(msg)) return "Diese Datei ist bereits verbunden.";
  if (/no_headers_detected/i.test(msg)) return "In der Datei wurden keine Spalten-Header erkannt.";
  if (/file_locked_in_excel/i.test(msg)) return "Die Datei ist gerade in Excel geöffnet — bitte schließen und erneut versuchen.";
  return msg || "Verbinden fehlgeschlagen.";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

export default function OneDriveConnectButton() {
  const [open, setOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState(""); // committed query (leer ⇒ Backend-Default ".xlsx")
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const filesQ = useOneDriveFiles(open, query || undefined);
  const connectMut = useConnectOneDrive();

  const files: SpreadsheetOneDriveFile[] = filesQ.data?.files ?? [];
  const reconnectNeeded = filesQ.isError && isReconnect(filesQ.error);

  const handleConnect = async (f: SpreadsheetOneDriveFile) => {
    setConnectingId(f.item_id);
    try {
      const res = await connectMut.mutateAsync({ drive_id: f.drive_id, item_id: f.item_id, name: f.name });
      toast.success(
        `„${res.sheet_name}" verbunden${typeof res.mappings_count === "number" ? ` — ${res.mappings_count} Spalten erkannt` : ""}.`
      );
      setOpen(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Cloud className="w-4 h-4" />
        Aus OneDrive verbinden
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            OneDrive-Datei verbinden
          </DialogTitle>
          <DialogDescription>
            Wähle eine Excel-Datei aus deinem OneDrive. UseEasy schreibt Änderungen
            künftig direkt dorthin — kein manueller Upload mehr.
          </DialogDescription>
        </DialogHeader>

        {/* Suche */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draftQuery.trim());
          }}
        >
          <Input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Dateiname suchen (optional)…"
            className="h-9"
          />
          <Button type="submit" variant="secondary" size="sm" className="gap-1 shrink-0">
            <Search className="w-4 h-4" />
            Suchen
          </Button>
        </form>

        {/* Inhalt */}
        <div className="min-h-[180px]">
          {filesQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              OneDrive-Dateien werden geladen…
            </div>
          )}

          {reconnectNeeded && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Microsoft neu verbinden</p>
                <p>
                  Dein Microsoft-Login hat noch keine Datei-Berechtigung. Verbinde dein
                  Konto einmal neu (Einstellungen → Integrationen) und bestätige im
                  Microsoft-Fenster die OneDrive-Freigabe. Danach erscheinen deine Dateien hier.
                </p>
              </div>
            </div>
          )}

          {filesQ.isError && !reconnectNeeded && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-red-400">
              <span>{friendlyError(filesQ.error)}</span>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => filesQ.refetch()}>
                <RefreshCw className="w-4 h-4" />
                Erneut versuchen
              </Button>
            </div>
          )}

          {!filesQ.isLoading && !filesQ.isError && files.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Keine Excel-Dateien (.xlsx/.xlsm) in deinem OneDrive gefunden.
            </div>
          )}

          {!filesQ.isLoading && !filesQ.isError && files.length > 0 && (
            <ScrollArea className="h-[260px] pr-2">
              <ul className="space-y-1">
                {files.map((f) => (
                  <li
                    key={`${f.drive_id}:${f.item_id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {f.last_modified ? `Geändert ${fmtDate(f.last_modified)}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      disabled={connectingId !== null}
                      onClick={() => handleConnect(f)}
                    >
                      {connectingId === f.item_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Verbinden"
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
