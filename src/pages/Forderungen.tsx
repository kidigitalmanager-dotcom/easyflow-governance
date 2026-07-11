import { useState, useRef } from "react";
import {
  useDocuments,
  useScanSentForAr,
  useGenerateDunning,
  useDocumentVerdict,
  useMarkArPaid,
  useAddManualAr,
  useImportArXlsx,
} from "@/hooks/use-api";
import type { TenantDocument, DunningDraft } from "@/lib/api-client";
import { exportArXlsx } from "@/lib/api-client";
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
import { toast } from "sonner";
import {
  Receipt, RefreshCw, Download, Upload, Plus, Mail, CheckCircle2, Loader2, AlertTriangle,
} from "lucide-react";

// Forderungen & Erinnerungen (Phase 0/1a). Der Ledger fuellt sich thread-abgeleitet
// aus dem Gesendet-Ordner ("Jetzt scannen") + optional aus einer Excel-Liste.
// Eine Erinnerung wird als Entwurf ins Postfach gelegt — NIE automatisch versendet.

function stufeLabel(s: number | null): string {
  if (s === 3) return "Letzte Erinnerung";
  if (s === 2) return "2. Erinnerung";
  return "Zahlungserinnerung";
}

export default function Forderungen() {
  const open = useDocuments("ar_invoice", "open");
  const paid = useDocuments("ar_invoice", "paid");
  const scan = useScanSentForAr();
  const generate = useGenerateDunning();
  const verdict = useDocumentVerdict();
  const markPaid = useMarkArPaid();
  const addManual = useAddManualAr();
  const importXlsx = useImportArXlsx();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<DunningDraft | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState({ counterpart_name: "", counterpart_email: "", invoice_ref: "", amount_gross: "", due_date: "" });

  const rows = open.data?.items ?? [];
  const paidRows = paid.data?.items ?? [];

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
          <Button variant="outline" size="sm" onClick={() => exportArXlsx().catch(() => toast.error("Export fehlgeschlagen."))}>
            <Download className="h-4 w-4" /> Export
          </Button>
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
                  <TableHead>Status</TableHead>
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
                        <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300">
                          <AlertTriangle className="h-3 w-3 mr-1" /> bitte pruefen
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.invoice_ref || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{r.amount_display || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.due_date ? new Date(r.due_date).toLocaleDateString("de-DE") : "—"}
                      {r.overdue && r.days_overdue != null && (
                        <Badge variant="destructive" className="ml-2">{r.days_overdue} T ueberfaellig</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.reminder_count ? <span className="text-xs text-muted-foreground">{r.reminder_count}x erinnert</span> : <span className="text-xs text-muted-foreground">offen</span>}
                    </TableCell>
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
