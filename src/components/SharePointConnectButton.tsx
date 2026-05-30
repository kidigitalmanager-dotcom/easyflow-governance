// v4.42.0 — SharePoint Site-Browser: 3-stufiger Console-Picker.
// Button "Aus SharePoint verbinden" → Dialog: (1) SharePoint-Site suchen,
// (2) Dokumentbibliothek wählen, (3) Excel-Datei wählen → verbinden.
// Backend: /v1/spreadsheet/sharepoint/{sites,drives,files} (serverseitiger
// Graph-Token, kein MSAL/SPA-Redirect). Verbinden läuft über den bestehenden
// /v1/spreadsheet/connect/onedrive (provider-agnostisch, sheet_ref = driveId:itemId).
// Style-Risk-Badge erscheint danach automatisch in der Datei-Liste.
import { useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  FolderOpen,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
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
import {
  useSharePointSites,
  useSharePointDrives,
  useSharePointFiles,
  useConnectOneDrive,
} from "@/hooks/use-api";
import type {
  SpreadsheetSharePointSite,
  SpreadsheetSharePointDrive,
  SpreadsheetSharePointFile,
} from "@/lib/api-client";

function isReconnect(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /reconnect_required|no_outlook_credentials|no_refresh_token/i.test(msg);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (isReconnect(err)) {
    return "UseEasy braucht einmalig die SharePoint-/Datei-Berechtigung. Bitte verbinde dein Microsoft-Konto neu (Einstellungen → Integrationen) und bestätige die Freigabe.";
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

type Step = "site" | "drive" | "file";

export default function SharePointConnectButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("site");

  // Schritt 1: Site-Suche
  const [draftSiteQuery, setDraftSiteQuery] = useState("");
  const [siteQuery, setSiteQuery] = useState("");
  const [selectedSite, setSelectedSite] = useState<SpreadsheetSharePointSite | null>(null);

  // Schritt 2: Bibliothek
  const [selectedDrive, setSelectedDrive] = useState<SpreadsheetSharePointDrive | null>(null);

  // Schritt 3: Datei
  const [draftFileQuery, setDraftFileQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const sitesQ = useSharePointSites(open, siteQuery || undefined);
  const drivesQ = useSharePointDrives(selectedSite?.site_id ?? null);
  const filesQ = useSharePointFiles(selectedDrive?.drive_id ?? null, fileQuery || undefined);

  const connectMut = useConnectOneDrive();

  const sites: SpreadsheetSharePointSite[] = sitesQ.data?.sites ?? [];
  const drives: SpreadsheetSharePointDrive[] = drivesQ.data?.drives ?? [];
  const files: SpreadsheetSharePointFile[] = filesQ.data?.files ?? [];

  const activeQ = step === "site" ? sitesQ : step === "drive" ? drivesQ : filesQ;
  const reconnectNeeded = activeQ.isError && isReconnect(activeQ.error);

  function resetAll() {
    setStep("site");
    setDraftSiteQuery("");
    setSiteQuery("");
    setSelectedSite(null);
    setSelectedDrive(null);
    setDraftFileQuery("");
    setFileQuery("");
    setConnectingId(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetAll();
  }

  function pickSite(s: SpreadsheetSharePointSite) {
    setSelectedSite(s);
    setSelectedDrive(null);
    setDraftFileQuery("");
    setFileQuery("");
    setStep("drive");
  }

  function pickDrive(d: SpreadsheetSharePointDrive) {
    setSelectedDrive(d);
    setDraftFileQuery("");
    setFileQuery("");
    setStep("file");
  }

  function back() {
    if (step === "file") {
      setStep("drive");
      setSelectedDrive(null);
    } else if (step === "drive") {
      setStep("site");
      setSelectedSite(null);
    }
  }

  const handleConnect = async (f: SpreadsheetSharePointFile) => {
    setConnectingId(f.item_id);
    try {
      const res = await connectMut.mutateAsync({ drive_id: f.drive_id, item_id: f.item_id, name: f.name });
      toast.success(
        `„${res.sheet_name}" verbunden${typeof res.mappings_count === "number" ? ` — ${res.mappings_count} Spalten erkannt` : ""}.`
      );
      handleOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Building2 className="w-4 h-4" />
        Aus SharePoint verbinden
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            SharePoint-Datei verbinden
          </DialogTitle>
          <DialogDescription>
            Durchsuche eine SharePoint-Site, wähle eine Dokumentbibliothek und dann eine
            Excel-Datei. UseEasy schreibt Änderungen künftig direkt dorthin.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb / Zurück */}
        {(selectedSite || step !== "site") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {step !== "site" && (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={back}>
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück
              </Button>
            )}
            <div className="flex items-center gap-1 truncate">
              {selectedSite && (
                <>
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[140px]">{selectedSite.name}</span>
                </>
              )}
              {selectedDrive && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[140px]">{selectedDrive.name}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Suche (Site- und Datei-Schritt) */}
        {step === "site" && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSiteQuery(draftSiteQuery.trim());
            }}
          >
            <Input
              value={draftSiteQuery}
              onChange={(e) => setDraftSiteQuery(e.target.value)}
              placeholder="SharePoint-Site suchen (leer = gefolgte Sites)…"
              className="h-9"
            />
            <Button type="submit" variant="secondary" size="sm" className="gap-1 shrink-0">
              <Search className="w-4 h-4" />
              Suchen
            </Button>
          </form>
        )}
        {step === "file" && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setFileQuery(draftFileQuery.trim());
            }}
          >
            <Input
              value={draftFileQuery}
              onChange={(e) => setDraftFileQuery(e.target.value)}
              placeholder="Dateiname suchen (optional)…"
              className="h-9"
            />
            <Button type="submit" variant="secondary" size="sm" className="gap-1 shrink-0">
              <Search className="w-4 h-4" />
              Suchen
            </Button>
          </form>
        )}

        {/* Inhalt */}
        <div className="min-h-[180px]">
          {activeQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {step === "site"
                ? "SharePoint-Sites werden geladen…"
                : step === "drive"
                ? "Dokumentbibliotheken werden geladen…"
                : "Dateien werden geladen…"}
            </div>
          )}

          {reconnectNeeded && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Microsoft neu verbinden</p>
                <p>
                  Dein Microsoft-Login hat noch keine SharePoint-/Datei-Berechtigung. Verbinde
                  dein Konto einmal neu (Einstellungen → Integrationen) und bestätige im
                  Microsoft-Fenster die Freigabe. Danach erscheinen deine Sites hier.
                </p>
              </div>
            </div>
          )}

          {activeQ.isError && !reconnectNeeded && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-red-400">
              <span>{friendlyError(activeQ.error)}</span>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => activeQ.refetch()}>
                <RefreshCw className="w-4 h-4" />
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Schritt 1: Sites */}
          {step === "site" && !sitesQ.isLoading && !sitesQ.isError && (
            sites.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Keine SharePoint-Sites gefunden. Versuche einen Suchbegriff (z. B. Team- oder Projektname).
              </div>
            ) : (
              <ScrollArea className="h-[260px] pr-2">
                <ul className="space-y-1">
                  {sites.map((s) => (
                    <li key={s.site_id}>
                      <button
                        type="button"
                        onClick={() => pickSite(s)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                      >
                        <Building2 className="w-4 h-4 text-sky-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{s.name}</p>
                          {s.web_url && <p className="text-xs text-muted-foreground truncate">{s.web_url}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )
          )}

          {/* Schritt 2: Bibliotheken */}
          {step === "drive" && !drivesQ.isLoading && !drivesQ.isError && (
            drives.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                In dieser Site wurden keine Dokumentbibliotheken gefunden.
              </div>
            ) : (
              <ScrollArea className="h-[260px] pr-2">
                <ul className="space-y-1">
                  {drives.map((d) => (
                    <li key={d.drive_id}>
                      <button
                        type="button"
                        onClick={() => pickDrive(d)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                      >
                        <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{d.name}</p>
                          {d.drive_type && <p className="text-xs text-muted-foreground truncate">{d.drive_type}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )
          )}

          {/* Schritt 3: Dateien */}
          {step === "file" && !filesQ.isLoading && !filesQ.isError && (
            files.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Keine Excel-Dateien (.xlsx/.xlsm) in dieser Bibliothek gefunden.
              </div>
            ) : (
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
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
