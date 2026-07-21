/**
 * PriceListsCard — v4.130.0 Preislisten unter Unternehmenswissen (Leon 21.07.).
 *
 * Preislisten sind normale Excel-Live-Sync-Dateien mit purpose 'price_list'
 * (der Upload erkennt das automatisch am Dateinamen/Headern: "Preisliste",
 * "Einzelpreis", "Stundensatz", ...). Diese Karte macht sie dort sichtbar,
 * wo Leon sie erwartet: im Unternehmenswissen — Upload inklusive. Preise aus
 * der aktiven Preisliste werden EXAKT in Angebots-Entwürfe übernommen
 * (das LLM erfindet nie Preise).
 */
import { useRef, useState } from "react";
import { useSpreadsheets, useSpreadsheetUpload } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, Upload, CheckCircle2, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

const PRICE_NAME_RE = /preis|leistungsverzeichnis|leistungskatalog|stundensatz|tarif|kalkulation/i;

export default function PriceListsCard() {
  const { data, isLoading } = useSpreadsheets();
  const uploadMut = useSpreadsheetUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastUpload, setLastUpload] = useState<string | null>(null);

  const priceLists = (data?.spreadsheets ?? []).filter(
    (s) => s.is_active && (s.purpose === "price_list" || PRICE_NAME_RE.test(s.sheet_name ?? "")),
  );

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Nur .xlsx, .xls oder .csv Dateien werden unterstützt.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 4 MB beim Direkt-Upload).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate(
        { file_name: file.name, file_content_base64: base64 },
        {
          onSuccess: () => {
            setLastUpload(file.name);
            toast.success("Preisliste hochgeladen. Preise werden ab jetzt exakt in Angebote übernommen.");
          },
          onError: () => toast.error("Upload fehlgeschlagen. Bitte erneut versuchen."),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Preislisten
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ihre Preisliste als Excel (Spalten z.&nbsp;B. „Position", „Einheit", „Einzelpreis").
            Angebote übernehmen diese Preise EXAKT — für Positionen ohne Listenpreis bleibt der
            Preis offen und Sie tragen ihn im Angebots-Editor ein.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-3 py-2 text-sm font-medium disabled:opacity-50 shrink-0"
        >
          {uploadMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Preisliste hochladen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : priceLists.length > 0 ? (
        <div className="space-y-2">
          {priceLists.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.sheet_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.purpose === "price_list" ? "Als Preisliste erkannt" : "Über den Namen als Preisliste erkannt"}
                  {s.tab_name ? ` · Tab: ${s.tab_name}` : ""}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aktiv
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Noch keine Preisliste verbunden. Ohne Preisliste schlägt die KI Preise nur unverbindlich vor
            {lastUpload ? "" : " — laden Sie eine Excel hoch, dann sitzen die Angebotspreise exakt"}.
            Verwaltung und Details finden Sie unter Einstellungen → Excel Live-Sync.
          </span>
        </div>
      )}
    </div>
  );
}
