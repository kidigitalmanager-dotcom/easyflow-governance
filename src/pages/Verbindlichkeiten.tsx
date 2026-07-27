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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, Chip, Dot, EmptyState, type DotTone } from "@/components/ue/primitives";
import { describeSkipped } from "@/lib/scan-result";
import { toast } from "sonner";
import {
  CreditCard, Download, Plus, CheckCircle2, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, ChevronDown, Paperclip, Eye,
} from "lucide-react";

// Verbindlichkeiten (AP) — Spiegel des Forderungs-Ledgers. Eingehende Rechnungen aus dem
// Postfach werden automatisch je Lieferant angelegt (needs_confirmation bei unsicheren PDFs),
// die Original-PDF liegt sicher in S3 (Ansicht per kurzlebiger Link). Bezahlen bleibt Owner-Klick;
// NICHTS wird automatisch gezahlt oder versendet.
//
// Redesign 27.07.2026: Console-Bausteine (PageHeader/SectionCard/Chip/Dot/EmptyState) statt
// Card+Table. Die Tabellenspalten Faellig/Beleg/Aktion stehen jetzt als Meta-Zeile bzw. rechts
// in der Listenzeile — alle Aktionen (bestaetigen, PDF ansehen/anhaengen, bezahlt, rueckgaengig,
// Export, manuell anlegen) sind unveraendert erhalten.

const DAY_MS = 86_400_000;

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("de-DE") : "–";
}

/* Statuspunkt der Zeile: im Verzug = rot, in den naechsten 7 Tagen faellig = amber.
   Beides folgt aus Server-Feldern (overdue/due_date) — nichts wird geschaetzt. */
function faelligTone(r: { overdue: boolean; due_date: string | null }, now = Date.now()): DotTone {
  if (r.overdue) return "danger";
  const t = r.due_date ? Date.parse(r.due_date) : NaN;
  if (Number.isFinite(t) && t <= now + 7 * DAY_MS) return "amber";
  return "muted";
}
function isBaldFaellig(r: { overdue: boolean; due_date: string | null }, now = Date.now()): boolean {
  return !r.overdue && faelligTone(r, now) === "amber";
}

type ApFilter = "alle" | "verzug" | "bald" | "pruefen" | "ohnebeleg";

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
  const [filter, setFilter] = useState<ApFilter>("alle");
  // 2026-07-27: Spinner nur in der geklickten Zeile — vorher drehte das Icon in
  // JEDER Zeile mit, weil nur der globale isPending-Zustand abgefragt wurde.
  const [busyRow, setBusyRow] = useState<number | null>(null);

  const rows = open.data?.items ?? [];
  const paidRows = paid.data?.items ?? [];
  // 2026-07-27: Der Server kann die Liste mit `skipped` ausliefern (Rechnungseingang
  // fuer den Betrieb nicht freigeschaltet). Ohne Hinweis stand dann "Noch keine offenen
  // Verbindlichkeiten" da — eine falsche Entwarnung bei einer Liste, die es gar nicht gab.
  const skipped = describeSkipped(open.data?.skipped);

  const counts = {
    alle: rows.length,
    verzug: rows.filter((r) => r.overdue).length,
    bald: rows.filter((r) => isBaldFaellig(r)).length,
    pruefen: rows.filter((r) => r.needs_confirmation).length,
    ohnebeleg: rows.filter((r) => !r.has_pdf).length,
  };
  const shown = rows.filter((r) =>
    filter === "verzug" ? r.overdue
      : filter === "bald" ? isBaldFaellig(r)
        : filter === "pruefen" ? r.needs_confirmation
          : filter === "ohnebeleg" ? !r.has_pdf
            : true,
  );

  async function handleConfirm(r: ApInvoice) {
    setBusyRow(r.id);
    try {
      const res = await confirm.mutateAsync(r.id);
      if (!res.ok) { toast.error("Konnte die Verbindlichkeit nicht bestätigen."); return; }
      toast.success("Verbindlichkeit bestätigt.");
    } catch { toast.error("Konnte die Verbindlichkeit nicht bestätigen."); }
    finally { setBusyRow(null); }
  }

  async function handleViewPdf(r: ApInvoice) {
    setPdfBusy(r.id);
    try {
      const res = await getAp(r.id);
      if (res.item?.pdf_url) {
        // 2026-07-27: Der Link kommt erst NACH dem await — manche Browser werten das
        // nicht mehr als Nutzergeste und blocken das Fenster still. Deshalb pruefen
        // wir das Ergebnis und sagen es, statt den Klick ins Leere laufen zu lassen.
        const w = window.open(res.item.pdf_url, "_blank", "noopener,noreferrer");
        if (!w) toast.error("Der Browser hat das PDF-Fenster blockiert. Bitte Pop-ups für diese Seite erlauben.");
      } else {
        toast.info("Zu dieser Verbindlichkeit ist keine PDF hinterlegt.");
      }
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
      setBusyRow(apId);
      try { await upload.mutateAsync({ apId, file: f }); toast.success("PDF hinterlegt."); }
      catch { toast.error("PDF-Upload fehlgeschlagen."); }
      finally { setBusyRow(null); }
    }
    if (fileRef.current) fileRef.current.value = "";
    uploadTarget.current = null;
  }

  async function handleAddManual() {
    if (!manual.counterpart_name) { toast.error("Bitte den Lieferanten angeben."); return; }
    if (!manual.amount_gross) { toast.error("Bitte einen Betrag angeben."); return; }
    try {
      await create.mutateAsync(manual);
      toast.success("Verbindlichkeit hinzugefügt.");
      setShowAdd(false);
      setManual({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", issue_date: "", due_date: "" });
    } catch { toast.error("Konnte die Verbindlichkeit nicht speichern."); }
  }

  async function handleCsvExport() {
    try { await exportApCsvDatev({ from: csvFrom || undefined, to: csvTo || undefined }); setShowCsv(false); }
    catch { toast.error("CSV-Export fehlgeschlagen."); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buchhaltung"
        title="Verbindlichkeiten"
        subtitle="Eingehende Rechnungen werden je Lieferant erfasst, die Original-PDF sicher abgelegt. Unsichere Erkennungen markiert Jana zur Bestätigung. Bezahlt wird nie automatisch."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Verbindlichkeiten exportieren</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportApXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (Betrieb)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCsv(true)}>
                  <FileText className="mr-2 h-4 w-4" /> CSV für Steuerberater (DATEV-Kreditoren)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell</Button>
          </div>
        }
      />

      {/* Ein Datei-Dialog fuer alle Zeilen; das Ziel merkt sich uploadTarget. */}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handlePdfPicked} />

      <SectionCard
        title="Offene Verbindlichkeiten"
        subtitle={
          open.isSuccess
            ? (rows.length === 0
                ? "aus deinem Postfach erfasst oder manuell angelegt"
                : `${rows.length} offen · ${counts.verzug} im Verzug`)
            : undefined
        }
        bodyClassName="p-0"
        action={
          open.isSuccess && rows.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              <Chip active={filter === "alle"} count={counts.alle} onClick={() => setFilter("alle")}>Alle</Chip>
              <Chip active={filter === "verzug"} count={counts.verzug} onClick={() => setFilter("verzug")}>Im Verzug</Chip>
              <Chip active={filter === "bald"} count={counts.bald} onClick={() => setFilter("bald")}>Bald fällig</Chip>
              {/* Chip bleibt sichtbar, solange er aktiv ist — sonst verschwindet beim
                  Bestaetigen/Anhaengen der letzten Zeile der Filter, und die Liste sieht
                  leer aus, ohne dass man den Weg zurueck findet. */}
              {(counts.pruefen > 0 || filter === "pruefen") && (
                <Chip active={filter === "pruefen"} count={counts.pruefen} onClick={() => setFilter("pruefen")}>Zu prüfen</Chip>
              )}
              {(counts.ohnebeleg > 0 || filter === "ohnebeleg") && (
                <Chip active={filter === "ohnebeleg"} count={counts.ohnebeleg} onClick={() => setFilter("ohnebeleg")}>Ohne Beleg</Chip>
              )}
            </div>
          ) : null
        }
      >
        {open.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : open.isError ? (
          <div className="p-4">
            <QueryErrorNotice
              label="Die offenen Verbindlichkeiten konnten nicht geladen werden."
              onRetry={() => open.refetch()}
              retrying={open.isFetching}
            />
          </div>
        ) : rows.length === 0 && skipped ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title={skipped.title}
            description={skipped.hint + " Das ist kein leerer Bestand: der Server hat gar keine Liste ausgeliefert."}
            action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell anlegen</Button>}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title="Noch keine offenen Verbindlichkeiten"
            description="Sobald eine Lieferanten-Rechnung im Postfach eingeht, erscheint sie hier — oder du legst manuell eine an."
            action={<Button size="sm" variant="outline" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell anlegen</Button>}
          />
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            Keine Verbindlichkeit in diesem Filter.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.map((r) => {
              const meta: string[] = [];
              if (r.counterpart_email && r.counterpart_name) meta.push(r.counterpart_email);
              meta.push(`fällig ${fmtDate(r.due_date)}`);
              if (r.issue_date) meta.push(`Rechnungsdatum ${fmtDate(r.issue_date)}`);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Dot tone={faelligTone(r)} className="mt-[7px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[13px] font-medium">
                        {r.counterpart_name || r.counterpart_email || "–"}
                      </span>
                      {r.invoice_ref && <span className="text-[11px] text-tx-weak">Rechnung {r.invoice_ref}</span>}
                      {r.overdue && r.days_overdue != null && (
                        <span className="whitespace-nowrap rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger">
                          <span className="tabular">{r.days_overdue}</span> Tage überfällig
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta.join(" · ")}</p>
                    {r.needs_confirmation && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                          <AlertTriangle className="h-3 w-3" /> bitte prüfen
                        </span>
                        <Button
                          size="sm" variant="outline" className="h-6 px-2 text-xs"
                          onClick={() => handleConfirm(r)} disabled={confirm.isPending}
                        >
                          {busyRow === r.id && confirm.isPending
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <CheckCircle2 className="mr-1 h-3 w-3" />} Bestätigen
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[13px] font-medium">{r.amount_display || "–"}</p>
                    {r.has_pdf ? (
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                        onClick={() => handleViewPdf(r)} disabled={pdfBusy === r.id}
                      >
                        {pdfBusy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="mr-1 h-3 w-3" />} PDF
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => pickPdf(r.id)} disabled={upload.isPending}
                      >
                        {busyRow === r.id && upload.isPending
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Paperclip className="mr-1 h-3 w-3" />} PDF anhängen
                      </Button>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="sm" variant="ghost" title="Als bezahlt markieren"
                      onClick={() => markPaid.mutate({ apId: r.id }, { onError: () => toast.error("Konnte die Verbindlichkeit nicht als bezahlt markieren.") })}
                    >
                      <CheckCircle2 className="h-4 w-4" /> bezahlt
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* 2026-07-27: Auch die Bezahlt-Liste braucht einen echten Fehlerzustand — sonst
          sieht ein Ladefehler aus, als waere nie eine Rechnung beglichen worden. */}
      {(paid.isError || paidRows.length > 0) && (
        <SectionCard
          title={
            <span className="flex items-center gap-2 text-muted-foreground">
              Bezahlt {!paid.isError && <span className="tabular">({paidRows.length})</span>}
            </span>
          }
          subtitle={!paid.isError && paidRows.length > 10 ? "die zehn jüngsten · vollständig im Excel-Export" : undefined}
          bodyClassName="p-0"
        >
          {paid.isError ? (
            <div className="p-4">
              <QueryErrorNotice
                label="Die bezahlten Verbindlichkeiten konnten nicht geladen werden."
                onRetry={() => paid.refetch()}
                retrying={paid.isFetching}
              />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line-soft">
                {paidRows.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      {r.counterpart_name || r.counterpart_email || "–"}
                      {r.invoice_ref ? ` · ${r.invoice_ref}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-[12.5px]">{r.amount_display || "–"}</span>
                      <Button
                        size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => markPaid.mutate({ apId: r.id, paid: false }, { onError: () => toast.error("Konnte den Bezahlt-Status nicht zurücknehmen.") })}
                      >
                        rückgängig
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              {paidRows.length > 10 && (
                <p className="px-4 py-2 text-[11px] text-tx-weak">
                  … und <span className="tabular">{paidRows.length - 10}</span> weitere (vollständig im Excel-Export).
                </p>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* Steuerberater-CSV mit optionalem Zeitraum */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV für Steuerberater</DialogTitle>
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
            <Button onClick={handleCsvExport}><FileText className="mr-1 h-4 w-4" /> CSV herunterladen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manuelle Verbindlichkeit */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Verbindlichkeit manuell hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Lieferant</Label><Input value={manual.counterpart_name} onChange={(e) => setManual({ ...manual, counterpart_name: e.target.value })} /></div>
            <div><Label className="text-xs">E-Mail (optional)</Label><Input value={manual.counterpart_email} onChange={(e) => setManual({ ...manual, counterpart_email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsnr</Label><Input value={manual.invoice_ref} onChange={(e) => setManual({ ...manual, invoice_ref: e.target.value })} /></div>
              <div><Label className="text-xs">Betrag (z.B. 1.234,00)</Label><Input value={manual.amount_gross} onChange={(e) => setManual({ ...manual, amount_gross: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsdatum</Label><Input value={manual.issue_date} onChange={(e) => setManual({ ...manual, issue_date: e.target.value })} placeholder="TT.MM.JJJJ" /></div>
              <div><Label className="text-xs">Fällig (TT.MM.JJJJ)</Label><Input value={manual.due_date} onChange={(e) => setManual({ ...manual, due_date: e.target.value })} placeholder="TT.MM.JJJJ" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button onClick={handleAddManual} disabled={create.isPending}>Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
