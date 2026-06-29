import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUploadCapitalStatement } from "@/hooks/use-capital";
import type { CapitalStatementUploadResponse } from "@/lib/api-client";
import { Upload, ShieldCheck, Loader2, CheckCircle2, FileText } from "lucide-react";

const FIN_LABEL: Record<string, string> = {
  fin_mrr: "Umsatz-Momentum",
  fin_burn: "Ausgaben-Last",
  fin_liquidity: "Liquidität",
  fin_runway: "Runway",
  fin_ar_aging: "Forderungs-Alter",
  fin_dso: "DSO (Forderungslaufzeit)",
};

const ACCEPT = ".csv,.xml,.sta,.txt,.940,.mt940,.xls";

function scoreColor(v: number): string {
  if (v >= 67) return "text-emerald-400";
  if (v >= 34) return "text-amber-400";
  return "text-red-400";
}

export function CapitalStatementUpload() {
  const { toast } = useToast();
  const upload = useUploadCapitalStatement();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<CapitalStatementUploadResponse | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = (file: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximal ~8 MB.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      upload.mutate(
        { file_name: file.name, file_content_base64: base64 },
        {
          onSuccess: (data) => {
            setResult(data);
            toast({
              title: "Finanzdaten verarbeitet",
              description: `${data.months_stored} Monat(e) · ${data.metrics.length} Kennzahl(en) berechnet. Rohdatei nicht gespeichert.`,
            });
          },
          onError: (e: any) => {
            const msg = e?.message || "Unbekannter Fehler";
            toast({ title: "Konnte Datei nicht verarbeiten", description: msg, variant: "destructive" });
          },
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Finanzdaten hinzufügen (Bank- oder DATEV-Export)</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              1× pro Monat eine Datei ziehen — kein Reporting, kein Abtippen. Unterstützt:
              <span className="text-foreground"> camt.053, MT940, Bank-CSV, DATEV-OPOS</span>. Schaltet Finanz-Indizes frei
              (Liquidität, Umsatz-Momentum, Runway, Forderungen).
            </p>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 cursor-pointer transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          {upload.isPending ? (
            <><Loader2 className="w-6 h-6 text-primary animate-spin" /><span className="text-sm text-muted-foreground">Wird verarbeitet…</span></>
          ) : (
            <>
              <FileText className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm text-foreground">{fileName || "Datei hierher ziehen oder klicken"}</span>
              <span className="text-xs text-muted-foreground">camt.053 · MT940 · CSV · DATEV-OPOS</span>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Read-only &amp; DSGVO: Die <span className="text-foreground">Rohdatei wird nicht gespeichert</span> und nicht weitergegeben —
            es entstehen ausschließlich aggregierte Monats-Kennzahlen (0–100-Indizes). Keine Buchungstexte, Gegenkonten oder IBANs.
          </p>
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-foreground">
                {result.format.toUpperCase()} verarbeitet · {result.months_stored} Monat(e)
                {result.period ? ` · Stand ${result.period}` : ""}
              </span>
            </div>
            {result.metrics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {result.metrics.map((m) => (
                  <div key={m.key} className="rounded-md bg-background/40 border border-border px-3 py-2">
                    <div className="text-[11px] text-muted-foreground truncate">{FIN_LABEL[m.key] || m.key}</div>
                    <div className={`text-lg font-semibold ${scoreColor(m.value)}`}>{m.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Noch keine Kennzahl berechenbar — Cashflow-Indizes brauchen ≥3 Monate Historie. Lade beim nächsten Mal einen
                längeren Zeitraum (z.B. 12-Monats-Export), dann werden Trends sichtbar.
              </p>
            )}
            {result.skipped_keys.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Noch ohne Daten: {result.skipped_keys.map((k) => FIN_LABEL[k] || k).join(", ")}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
