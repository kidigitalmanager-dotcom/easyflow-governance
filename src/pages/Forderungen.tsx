import { useState, useRef } from "react";
import {
  useDocuments,
  useScanSentForAr,
  useGenerateDunning,
  useDocumentVerdict,
  useMarkArPaid,
  useAddManualAr,
  useImportArXlsx,
  useConfirmArInvoice,
  useRunDunning,
} from "@/hooks/use-api";
import type { TenantDocument, DunningDraft, DunningRunResult, DunningRunItem } from "@/lib/api-client";
import { exportArXlsx, exportArCsvDatev } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Receipt, RefreshCw, Download, Upload, Plus, Mail, CheckCircle2, Loader2, AlertTriangle,
  Send, FileSpreadsheet, FileText, ChevronDown, PlayCircle,
} from "lucide-react";

// Forderungen & Erinnerungen (Phase 0/1a + v4.134.0 Mahn-Zyklus). Der Ledger fuellt sich
// thread-abgeleitet aus dem Gesendet-Ordner ("Jetzt scannen") + optional aus einer Excel-Liste.
// Eine Erinnerung wird als Entwurf ins Postfach gelegt — NIE automatisch versendet.
// v4.134.0: Zyklus-Spalten (Mahnstufe/zuletzt erinnert/naechste Aktion), Bestaetigen-Geste,
// on-demand "Alle faelligen Entwuerfe" (dry_run-Vorschau -> echt), Entwurfs-Warteschlange,
// Steuerberater-CSV (DATEV-kompatibel).

function stufeLabel(s: number | null): string {
  if (s === 3) return "Letzte Erinnerung";
  if (s === 2) return "2. Erinnerung";
  return "Zahlungserinnerung";
}
function stufeBadge(s: number | null | undefined) {
  if (!s) return <span className="text-xs text-muted-foreground">keine</span>;
  const variant = s >= 3 ? "destructive" : s === 2 ? "default" : "secondary";
  return <Badge variant={variant as "destructive" | "default" | "secondary"}>Stufe {s}</Badge>;
}
function naechsteAktion(r: TenantDocument): string {
  if (!r.overdue) return "noch nicht faellig";
  if (r.needs_confirmation) return "erst bestaetigen";
  const s = r.suggested_mahnstufe ?? (Math.min(3, (r.mahnstufe ?? 0) + 1) || 1);
  return `Stufe ${s} vorbereiten`;
}
function previewItems(r: DunningRunResult | null): DunningRunItem[] {
  if (!r?.results) return [];
  return r.results.flatMap((x) => x.items ?? []);
}
function formatAmount(v: number | null | undefined, currency: string | null | undefined): string {
  if (v == null) return "keine";
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(v); }
  catch { return `${v} ${currency || "EUR"}`; }
}
function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("de-DE") : "";
}

export default function Forderungen() {
  const open = useDocuments("ar_invoice", "open");
  const paid = useDocuments("ar_invoice", "paid");
  const dunningQueue = useDocuments("dunning", "draft");
  const scan = useScanSentForAr();
  const generate = useGenerateDunning();
  const verdict = useDocumentVerdict();
  const markPaid = useMarkArPaid();
  const addManual = useAddManualAr();
  const importXlsx = useImportArXlsx();
  const confirmAr = useConfirmArInvoice();
  const runDun = useRunDunning();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<DunningDraft | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", due_date: "" });
  const [preview, setPreview] = useState<DunningRunResult | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");

  const rows = open.data?.items ?? [];
  const paidRows = paid.data?.items ?? [];
  const queue = dunningQueue.data?.items ?? [];

  async function handleScan() {
    try {
      const r = await scan.mutateAsync(720); // letzte 30 Tage
      if (r.skipped) toast.info("Scan uebersprungen: " + String(r.skipped));
      else toast.success(`Gesendet-Ordner gescannt: ${r.upserted ?? 0} Forderungen erfasst (${r.structured ?? 0} aus E-Rechnung, ${r.text_fallback ?? 0} aus E-Mail-Text).`);
    } catch (e) { toast.error("Scan fehlgeschlagen."); }
  }

  async function handleGenerate(ar: TenantDocument) {
    try {
      const d = await generate.mutateAsync({ arInvoiceId: ar.id, use_llm: useLlm });
      setDraft(d); setEditSubject(d.subject); setEditBody(d.body);
    } catch (e) { toast.error("Entwurf konnte nicht erzeugt werden."); }
  }

  async function handleApprove() {
    if (!draft) return;
    try {
      await verdict.mutateAsync({ documentId: draft.dunning_document_id, action: "approve", subject: editSubject, body: editBody });
      toast.success("Erinnerung liegt als Entwurf in deinem Postfach. Du kannst sie dort pruefen und senden.");
      setDraft(null); open.refetch();
    } catch (e) { toast.error("Konnte den Entwurf nicht ins Postfach legen."); }
  }
  async function handleReject() {
    if (!draft) return;
    try { await verdict.mutateAsync({ documentId: draft.dunning_document_id, action: "reject" }); toast.info("Entwurf verworfen."); setDraft(null); }
    catch (e) { toast.error("Aktion fehlgeschlagen."); }
  }

  // v4.134.0 — Entwurfs-Warteschlange: Freigeben/Verwerfen direkt (bestehender verdict-Flow).
  async function queueApprove(d: TenantDocument) {
    try { await verdict.mutateAsync({ documentId: d.id, action: "approve" }); toast.success("Erinnerung liegt als Entwurf in deinem Postfach."); }
    catch (e) { toast.error("Konnte den Entwurf nicht ins Postfach legen."); }
  }
  async function queueReject(d: TenantDocument) {
    try { await verdict.mutateAsync({ documentId: d.id, action: "reject" }); toast.info("Entwurf verworfen."); }
    catch (e) { toast.error("Aktion fehlgeschlagen."); }
  }

  // v4.134.0 — Bestaetigen-Geste fuer needs_confirmation-Zeilen (Text-Fallback).
  async function handleConfirm(r: TenantDocument) {
    try {
      const res = await confirmAr.mutateAsync(r.id);
      if (!res.ok) { toast.error("Konnte die Forderung nicht bestaetigen."); return; }
      toast.success("Forderung bestaetigt. Sie kann jetzt automatisch bemahnt werden.");
      open.refetch();
    } catch (e) { toast.error("Konnte die Forderung nicht bestaetigen."); }
  }

  // v4.134.0 — "Alle faelligen Entwuerfe": erst dry_run-Vorschau, dann echt.
  async function handleDryRun() {
    try {
      const r = await runDun.mutateAsync(true);
      if (r.migration_missing) { toast.error("Der Zyklus ist serverseitig noch nicht freigeschaltet (Migration ausstehend)."); return; }
      setPreview(r);
    } catch (e) { toast.error("Vorschau fehlgeschlagen."); }
  }
  async function handleRunReal() {
    try {
      const r = await runDun.mutateAsync(false);
      const n = previewItems(preview).length;
      toast.success(`${n} Erinnerungs-Entwuerfe erzeugt. Sie liegen unten zur Freigabe bereit.`);
      setPreview(null);
      open.refetch(); dunningQueue.refetch();
    } catch (e) { toast.error("Erzeugen fehlgeschlagen."); }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    try {
      const r = await importXlsx.mutateAsync(b64);
      toast.success(`Import: ${r.imported ?? 0} neu, ${r.updated ?? 0} aktualisiert, ${r.marked_paid ?? 0} als bezahlt.`);
    } catch (err) { toast.error("Import fehlgeschlagen (bitte .xlsx pruefen)."); }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleAddManual() {
    if (!manual.amount_gross) { toast.error("Bitte einen Betrag angeben."); return; }
    try {
      await addManual.mutateAsync(manual);
      toast.success("Forderung hinzugefuegt.");
      setShowAdd(false); setManual({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", due_date: "" });
    } catch (e) { toast.error("Konnte die Forderung nicht speichern."); }
  }

  async function handleCsvExport() {
    try {
      await exportArCsvDatev({ from: csvFrom || undefined, to: csvTo || undefined });
      setShowCsv(false);
    } catch (e) { toast.error("CSV-Export fehlgeschlagen."); }
  }

  const previewCount = previewItems(preview).length;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Receipt className="h-6 w-6" /> Forderungen &amp; Erinnerungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jana erkennt aus deinem Gesendet-Ordner, welche Rechnungen offen sind, und bereitet
            Zahlungserinnerungen als Entwurf vor. Gesendet wird nie automatisch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleScan} disabled={scan.isPending}>
            {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Jetzt scannen
          </Button>
          <Button variant="outline" size="sm" onClick={handleDryRun} disabled={runDun.isPending}>
            {runDun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Alle faelligen Entwuerfe
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Forderungen exportieren</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportArXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (Betrieb)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowCsv(true)}>
                <FileText className="h-4 w-4 mr-2" /> CSV fuer Steuerberater (DATEV-kompatibel)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Liste importieren
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manuell</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Switch checked={useLlm} onCheckedChange={setUseLlm} id="llm" />
        <Label htmlFor="llm" className="text-muted-foreground">Erinnerungen im Jana-Ton formulieren (sonst neutrale Vorlage)</Label>
      </div>

      {/* v4.134.0 — Entwurfs-Warteschlange: vom Zyklus erzeugte Erinnerungen zur Freigabe */}
      {queue.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" /> Erinnerungs-Entwuerfe zur Freigabe ({queue.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {queue.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3 border rounded-md p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {stufeBadge(d.mahnstufe)}
                      <span className="font-medium truncate">{d.counterpart_name || d.counterpart_email || "keine Angabe"}</span>
                      {d.invoice_ref && <span className="text-xs text-muted-foreground">Rechnung {d.invoice_ref}</span>}
                    </div>
                    {d.subject && <div className="text-sm mt-1 truncate">{d.subject}</div>}
                    {d.amount_display && <div className="text-xs text-muted-foreground">{d.amount_display}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => queueReject(d)} disabled={verdict.isPending}>Verwerfen</Button>
                    <Button size="sm" onClick={() => queueApprove(d)} disabled={verdict.isPending}>
                      {verdict.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Freigeben
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Offene Forderungen</CardTitle></CardHeader>
        <CardContent>
          {open.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Noch keine offenen Forderungen. Klicke auf „Jetzt scannen", um deinen Gesendet-Ordner
              nach verschickten Rechnungen zu durchsuchen, oder importiere eine Liste.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Rechnung</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Faellig</TableHead>
                  <TableHead>Mahnstufe</TableHead>
                  <TableHead>Zuletzt erinnert</TableHead>
                  <TableHead>Naechste Aktion</TableHead>
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
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => handleConfirm(r)} disabled={confirmAr.isPending}>
                            {confirmAr.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />} Bestaetigen
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
                    <TableCell>{stufeBadge(r.mahnstufe || r.suggested_mahnstufe)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_reminded_at
                        ? <span>{fmtDate(r.last_reminded_at)}{r.reminder_count ? ` (${r.reminder_count}x)` : ""}</span>
                        : <span>noch nie</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{naechsteAktion(r)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.overdue ? (
                        <Button size="sm" variant="default" onClick={() => handleGenerate(r)} disabled={generate.isPending}>
                          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          {" "}Erinnerung
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">noch nicht faellig</span>
                      )}
                      <Button size="sm" variant="ghost" className="ml-1" onClick={() => markPaid.mutate({ arInvoiceId: r.id })} title="Als bezahlt markieren">
                        <CheckCircle2 className="h-4 w-4" />
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
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => markPaid.mutate({ arInvoiceId: r.id, undo: true })}>rueckgaengig</Button>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dunning-Entwurf: Vorschau + Freigabe (Postfach-Entwurf, kein Versand) */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft ? stufeLabel(draft.mahnstufe) : ""}</DialogTitle>
            <DialogDescription>
              Diese Erinnerung wird als <strong>Entwurf</strong> in deinen Postfach-Entwuerfen abgelegt.
              Du pruefst und sendest sie dort selbst. {draft?.used_llm ? "(Jana-Ton)" : "(Vorlage)"}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">An: {draft.to_name || draft.to_email || "—"} · Betrag: {draft.amount}</div>
              <div>
                <Label className="text-xs">Betreff</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Text</Label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="font-mono text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={handleReject} disabled={verdict.isPending}>Verwerfen</Button>
            <Button onClick={handleApprove} disabled={verdict.isPending}>
              {verdict.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} In Postfach-Entwuerfe legen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v4.134.0 — dry_run-Vorschau: welche Forderungen erinnerungsreif sind */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Faellige Zahlungserinnerungen</DialogTitle>
            <DialogDescription>
              {previewCount === 0
                ? "Aktuell ist keine Forderung erinnerungsreif (Karenz, Abstand und Bestaetigung werden beachtet)."
                : `${previewCount} Forderung(en) sind erinnerungsreif. Es werden Entwuerfe in der Konsole erzeugt, die du unten einzeln freigibst. Es wird nichts versendet.`}
            </DialogDescription>
          </DialogHeader>
          {previewCount > 0 && (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Rechnung</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Ueberfaellig</TableHead>
                    <TableHead>Stufe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewItems(preview).map((it) => (
                    <TableRow key={it.ar_invoice_id}>
                      <TableCell>{it.counterpart_name || "—"}</TableCell>
                      <TableCell className="text-sm">{it.invoice_ref || "—"}</TableCell>
                      <TableCell className="text-right">{formatAmount(it.amount_gross, it.currency)}</TableCell>
                      <TableCell>{it.days_overdue != null ? `${it.days_overdue} T` : "—"}</TableCell>
                      <TableCell>{stufeBadge(it.suggested_mahnstufe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>Abbrechen</Button>
            <Button onClick={handleRunReal} disabled={runDun.isPending || previewCount === 0}>
              {runDun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {previewCount} Entwuerfe erzeugen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v4.134.0 — Steuerberater-CSV mit optionalem Zeitraum */}
      <Dialog open={showCsv} onOpenChange={setShowCsv}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CSV fuer Steuerberater</DialogTitle>
            <DialogDescription>
              DATEV-kompatible OPOS-Liste (offene Posten) mit Mahnstatus. Zeitraum ist optional
              und filtert nach Belegdatum.
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

      {/* Manuelle Forderung */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Forderung manuell hinzufuegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Kunde</Label><Input value={manual.counterpart_name} onChange={(e) => setManual({ ...manual, counterpart_name: e.target.value })} /></div>
            <div><Label className="text-xs">E-Mail</Label><Input value={manual.counterpart_email} onChange={(e) => setManual({ ...manual, counterpart_email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rechnungsnr</Label><Input value={manual.invoice_ref} onChange={(e) => setManual({ ...manual, invoice_ref: e.target.value })} /></div>
              <div><Label className="text-xs">Betrag (z.B. 1.234,00)</Label><Input value={manual.amount_gross} onChange={(e) => setManual({ ...manual, amount_gross: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Faellig (TT.MM.JJJJ)</Label><Input value={manual.due_date} onChange={(e) => setManual({ ...manual, due_date: e.target.value })} placeholder="15.08.2026" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Abbrechen</Button>
            <Button onClick={handleAddManual} disabled={addManual.isPending}>Hinzufuegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
