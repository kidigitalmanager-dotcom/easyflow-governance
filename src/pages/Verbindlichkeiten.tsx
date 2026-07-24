import { useState, useRef } from "react";
import {
  useApInvoices,
  useCreateAp,
  useConfirmAp,
  useMarkApPaid,
  useUploadApPdf,
} from "@/hooks/use-api";
import { getAp, exportApXlsx, exportApCsvDatev, type ApInvoice } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  CreditCard, Download, Plus, CheckCircle2, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, ChevronDown, Paperclip, Eye,
} from "lucide-react";

// Verbindlichkeiten (AP) — Spiegel des Forderungs-Ledgers. Eingehende Rechnungen aus dem
// Postfach werden automatisch je Lieferant angelegt (needs_confirmation bei unsicheren PDFs),
// die Original-PDF liegt sicher in S3 (Ansicht per kurzlebiger Link). Bezahlen bleibt Owner-Klick;
// NICHTS wird automatisch gezahlt oder versendet.

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("de-DE") : "";
}

export default function Verbindlichkeiten() {
  const open = useApInvoices("open");
  const paid = useApInvoices("paid");
  const create = useCreateAp();
  const confirm = useConfirmAp();
  const markPaid = useMarkApPaid();
  const upload = useUploadApPdf();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<number | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", issue_date: "", due_date: "" });
  const [showCsv, setShowCsv] = useState(false);
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);

  const rows = open.data?.items ?? [];
  const paidRows = paid.data?.items ?? [];

  async function handleConfirm(r: ApInvoice) {
    try {
      const res = await confirm.mutateAsync(r.id);
      if (!res.ok) { toast.error("Konnte die Verbindlichkeit nicht bestaetigen."); return; }
      toast.success("Verbindlichkeit bestaetigt.");
    } catch { toast.error("Konnte die Verbindlichkeit nicht bestaetigen."); }
  }

  async function handleViewPdf(r: ApInvoice) {
    setPdfBusy(r.id);
    try {
      const res = await getAp(r.id);
      if (res.item?.pdf_url) window.open(res.item.pdf_url, "_blank", "noopener,noreferrer");
      else toast.info("Zu dieser Verbindlichkeit ist keine PDF hinterlegt.");
    } catch { toast.error("PDF konnte nicht geladen werden."); }
    finally { setPdfBusy(null); }
  }

  function pickPdf(apId: number) {
    uploadTarget.current = apId;
    fileRef.current?.click();
  }
  async function handlePdfPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const apId = uploadTarget.current;
    if (f && apId != null) {
      try { await upload.mutateAsync({ apId, file: f }); toast.success("PDF hinterlegt."); }
      catch { toast.error("PDF-Upload fehlgeschlagen."); }
    }
    if (fileRef.current) fileRef.current.value = "";
    uploadTarget.current = null;
  }

  async function handleAddManual() {
    if (!manual.counterpart_name) { toast.error("Bitte den Lieferanten angeben."); return; }
    if (!manual.amount_gross) { toast.error("Bitte einen Betrag angeben."); return; }
    try {
      await create.mutateAsync(manual);
      toast.success("Verbindlichkeit hinzugefuegt.");
      setShowAdd(false);
      setManual({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", issue_date: "", due_date: "" });
    } catch { toast.error("Konnte die Verbindlichkeit nicht speichern."); }
  }

  async function handleCsvExport() {
    try { await exportApCsvDatev({ from: csvFrom || undefined, to: csvTo || undefined }); setShowCsv(false); }
    catch { toast.error("CSV-Export fehlgeschlagen."); }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><CreditCard className="h-6 w-6" /> Verbindlichkeiten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eingehende Rechnungen werden je Lieferant erfasst, die Original-PDF sicher abgelegt.
            Unsichere Erkennungen markiert Jana zur Bestaetigung. Bezahlt wird nie automatisch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Verbindlichkeiten exportieren</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportApXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (Betrieb)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCsv(true)}>
                <FileText className="h-4 w-4 mr-2" /> CSV fuer Steuerberater (DATEV-Kreditoren)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell</Button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handlePdfPicked} />

      <Card>
        <CardHeader><CardTitle className="text-base">Offene Verbindlichkeiten</CardTitle></CardHeader>
        <CardContent>
          {open.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Noch keine offenen Verbindlichkeiten. Sobald eine Lieferanten-Rechnung im Postfach
              eingeht, erscheint sie hier — oder du legst manuell eine an.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Rechnung</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Faellig</TableHead>
                  <TableHead>Beleg</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.counterpart_name || r.counterpart_email || "—"}</div>
                      {r.counterpart_email && r.counterpart_name && <div className="text-xs text-muted-foreground">{r.counterpart_email}</div>}
                      {r.needs_confirmation && (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            <AlertTriangle className="h-3 w-3 mr-1" /> bitte pruefen
                          </Badge>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => handleConfirm(r)} disabled={confirm.isPending}>
                            {confirm.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Bestaetigen
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.invoice_ref || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{r.amount_display || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {fmtDate(r.due_date) || "—"}
                      {r.overdue && r.days_overdue != null && (
                        <Badge variant="destructive" className="ml-2">{r.days_overdue} T ueberfaellig</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.has_pdf ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleViewPdf(r)} disabled={pdfBusy === r.id}>
                          {pdfBusy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />} PDF
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => pickPdf(r.id)} disabled={upload.isPending}>
                          <Paperclip className="h-3 w-3 mr-1" /> PDF anhaengen
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => markPaid.mutate({ apId: r.id })} title="Als bezahlt markieren">
                        <CheckCircle2 className="h-4 w-4" /> bezahlt
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {paidRows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-muted-foreground">Bezahlt ({paidRows.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-1">
              {paidRows.slice(0, 10).map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>{r.counterpart_name || r.counterpart_email} {r.invoice_ref ? `· ${r.invoice_ref}` : ""}</span>
                  <span className="flex items-center gap-2">{r.amount_display}
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => markPaid.mutate({ apId: r.id, paid: false })}>rueckgaengig</Button>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steuerberater-CSV mit optionalem Zeitraum */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV fuer Steuerberater</DialogTitle>
            <DialogDescription>
              DATEV-kompatible Kreditoren-OPOS-Liste. Zeitraum ist optional und filtert nach Belegdatum.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Von (optional)</Label><Input type="date" value={csvFrom} onChange={(e) => setCsvFrom(e.target.value)} /></div>
            <div><Label className="text-xs">Bis (optional)</Label><Input type="date" value={csvTo} onChange={(e) => setCsvTo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCsv(false)}>Abbrechen</Button>
            <Button onClick={handleCsvExport}><FileText className="h-4 w-4 mr-1" /> CSV herunterladen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manuelle Verbindlichkeit */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verbindlichkeit manuell hinzufuegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Lieferant</Label><Input value={manual.counterpart_name} onChange={(e) => setManual({ ...manual, counterpart_name: e.target.value })} /></div>
            <div><Label className="text-xs">E-Mail (optional)</Label><Input value={manual.counterpart_email} onChange={(e) => setManual({ ...manual, counterpart_email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsnr</Label><Input value={manual.invoice_ref} onChange={(e) => setManual({ ...manual, invoice_ref: e.target.value })} /></div>
              <div><Label className="text-xs">Betrag (z.B. 1.234,00)</Label><Input value={manual.amount_gross} onChange={(e) => setManual({ ...manual, amount_gross: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsdatum</Label><Input value={manual.issue_date} onChange={(e) => setManual({ ...manual, issue_date: e.target.value })} placeholder="20.07.2026" /></div>
              <div><Label className="text-xs">Faellig (TT.MM.JJJJ)</Label><Input value={manual.due_date} onChange={(e) => setManual({ ...manual, due_date: e.target.value })} placeholder="15.08.2026" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button onClick={handleAddManual} disabled={create.isPending}>Hinzufuegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
