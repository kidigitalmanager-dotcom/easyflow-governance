// -----------------------------------------------------------------------------
// Rechnungen.tsx (Phase 2a) - Rechnung aus einem freigegebenen Angebot (oder
// manuell) per Knopfdruck. Positions-Tisch (Live-Neuberechnung, Server rechnet
// autoritativ), Empfaenger-Anschrift + Leistungsdatum, Paragraph-14-Gate,
// Finalisieren (gapless Rechnungsnummer), PDF. KEIN Auto-Send: die PDF laedt und
// versendet der Mensch selbst. Verkaeufer-Stammdaten sind Pflicht vor der Finalisierung.
// -----------------------------------------------------------------------------
import { useState } from "react";
import {
  useInvoices, useApprovedOffers, useInvoice, useGenerateInvoice, useUpdateInvoice,
  useFinalizeInvoice, useVoidInvoice, useBillingProfile,
} from "@/hooks/use-api";
import type { TenantInvoice, ApprovedOfferItem, InvoiceListItem } from "@/lib/api-client";
import { downloadZugferdInvoice } from "@/lib/api-client";
import type { OfferPosition, OfferOpts } from "@/lib/offer-calc";
import { computeOffer, fmtEUR, fmtDateDe } from "@/lib/offer-calc";
import { InvoicePositionsTable, type InvoiceDraftState } from "@/components/documents/InvoicePositionsTable";
import { InvoicePdf } from "@/components/documents/InvoicePdf";
import { BillingProfileForm } from "@/components/documents/BillingProfileForm";
import { TimeApplyButton } from "@/components/documents/TimeApplyDialog"; // v4.132.0 — Zeiterfassung
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ReceiptText, ArrowLeft, Save, CheckCircle2, Loader2, Printer, FileDown, Plus, Trash2, Settings, AlertTriangle, ArrowRightLeft,
} from "lucide-react";

const EMPTY_DRAFT: InvoiceDraftState = {
  positions: [], opts: {}, subject: "", cover_text: "",
  counterpart_name: "", counterpart_email: "",
  buyer_address_line1: "", buyer_address_line2: "", buyer_postal_code: "", buyer_city: "", buyer_country_code: "DE",
  buyer_vat_id: "", service_date: "", issue_date: "",
};

function isoToDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "");
}
function deToIso(v: string): string {
  const s = (v || "").trim();
  const m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return s;
}

function invoiceToDraft(inv: TenantInvoice): InvoiceDraftState {
  const t = inv.totals || null;
  const opts: OfferOpts = t
    ? { reverse_charge: !!t.reverse_charge, kleinunternehmer: !!t.kleinunternehmer, rabatt_gesamt_betrag: t.rabatt_gesamt_betrag || null, skonto_prozent: t.skonto_prozent || null, skonto_tage: t.skonto_tage || null }
    : {};
  const a = inv.counterpart_address || {};
  return {
    positions: Array.isArray(inv.positions) ? (inv.positions as OfferPosition[]) : [],
    opts,
    subject: inv.subject || "",
    cover_text: inv.cover_text || "",
    counterpart_name: inv.counterpart_name || "",
    counterpart_email: inv.counterpart_email || "",
    buyer_address_line1: a.address_line1 || "",
    buyer_address_line2: a.address_line2 || "",
    buyer_postal_code: a.postal_code || "",
    buyer_city: a.city || "",
    buyer_country_code: a.country_code || "DE",
    buyer_vat_id: inv.buyer_vat_id || "",
    service_date: inv.service_date || "",
    issue_date: inv.issue_date || "",
  };
}

function clientMissing(draft: InvoiceDraftState, sellerComplete: boolean, incomplete: boolean, reverseCharge: boolean): string[] {
  const m: string[] = [];
  if (!sellerComplete) m.push("Verkäufer-Stammdaten");
  if (!draft.counterpart_name.trim()) m.push("Empfänger-Name");
  if (!draft.buyer_address_line1.trim()) m.push("Empfänger-Straße");
  if (!draft.buyer_postal_code.trim() || !draft.buyer_city.trim()) m.push("Empfänger-PLZ/Ort");
  if (!draft.service_date) m.push("Leistungsdatum");
  if (draft.positions.length === 0) m.push("mindestens eine Position");
  else if (incomplete) m.push("offene Preise");
  if (reverseCharge && !draft.buyer_vat_id.trim()) m.push("USt-IdNr des Empfängers (§13b)");
  return m;
}

export default function Rechnungen() {
  const [view, setView] = useState<"list" | "editor" | "billing">("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InvoiceDraftState>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [zugferdBusy, setZugferdBusy] = useState(false);

  const invoices = useInvoices(50);
  const approved = useApprovedOffers(40);
  const billing = useBillingProfile();
  const genInv = useGenerateInvoice();
  const updInv = useUpdateInvoice();
  const finalize = useFinalizeInvoice();
  const voidInv = useVoidInvoice();
  const invoiceQuery = useInvoice(editId);

  const busy = genInv.isPending || updInv.isPending || finalize.isPending || voidInv.isPending;
  const loaded = invoiceQuery.data?.invoice ?? null;
  const isDraft = !loaded || loaded.status === "draft";
  const sellerComplete = !!billing.data?.complete;

  // Draft aus geladener Rechnung ziehen (nur beim Öffnen)
  const loadedId = loaded?.id ?? null;
  if (editId != null && loadedId === editId && !dirty && loaded && draft === EMPTY_DRAFT) {
    setDraft(invoiceToDraft(loaded));
  }

  const onDraftChange = (s: InvoiceDraftState) => { setDraft(s); setDirty(true); };

  async function generateFromOffer(offerId: number) {
    try {
      const res = await genInv.mutateAsync({ offer_id: offerId });
      if (res.skipped) { toast.error("Rechnungen sind noch nicht aktiviert (Feature/Postfach)."); return; }
      if (!res.ok || !res.document_id) { toast.error("Rechnung konnte nicht erstellt werden."); return; }
      openInvoice(res.document_id);
      toast.success("Rechnung aus Angebot erstellt. Bitte Empfänger-Anschrift + Leistungsdatum ergänzen.");
    } catch { toast.error("Rechnung konnte nicht erstellt werden."); }
  }
  async function generateManual() {
    try {
      const res = await genInv.mutateAsync({});
      if (res.skipped) { toast.error("Rechnungen sind noch nicht aktiviert (Feature/Postfach)."); return; }
      if (!res.ok || !res.document_id) { toast.error("Rechnung konnte nicht erstellt werden."); return; }
      openInvoice(res.document_id);
    } catch { toast.error("Rechnung konnte nicht erstellt werden."); }
  }
  function openInvoice(id: number) { setEditId(id); setDraft(EMPTY_DRAFT); setDirty(false); setView("editor"); }

  async function save() {
    if (editId == null) return;
    try {
      const res = await updInv.mutateAsync({
        document_id: editId,
        positions: draft.positions,
        subject: draft.subject || undefined,
        cover_text: draft.cover_text,
        counterpart_name: draft.counterpart_name || undefined,
        counterpart_email: draft.counterpart_email || undefined,
        counterpart_address: {
          address_line1: draft.buyer_address_line1, address_line2: draft.buyer_address_line2,
          postal_code: draft.buyer_postal_code, city: draft.buyer_city, country_code: draft.buyer_country_code,
        },
        buyer_vat_id: draft.buyer_vat_id || undefined,
        service_date: draft.service_date || undefined,
        issue_date: draft.issue_date || undefined,
        reverse_charge: !!draft.opts.reverse_charge,
        kleinunternehmer: !!draft.opts.kleinunternehmer,
        rabatt_gesamt_prozent: draft.opts.rabatt_gesamt_prozent ?? null,
        rabatt_gesamt_betrag: draft.opts.rabatt_gesamt_betrag ?? null,
        skonto_prozent: draft.opts.skonto_prozent ?? null,
        skonto_tage: draft.opts.skonto_tage ?? null,
      });
      if (res.error) { toast.error("Speichern fehlgeschlagen: " + (res.details?.join(", ") || res.error)); return; }
      setDraft((prev) => ({ ...prev, positions: res.positions }));
      setDirty(false);
      toast.success("Gespeichert.");
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }

  async function doFinalize() {
    if (editId == null) return;
    if (dirty) { toast.error("Bitte zuerst speichern."); return; }
    try {
      const res = await finalize.mutateAsync(editId);
      if (!res.ok || res.status !== "final") {
        if (res.error === "invoice_incomplete") toast.error("Pflichtangaben fehlen: " + (res.missing?.join(", ") || ""));
        else toast.error("Finalisierung nicht möglich.");
        return;
      }
      toast.success("Rechnung " + res.doc_number + " finalisiert.");
      await invoiceQuery.refetch();
    } catch { toast.error("Finalisierung fehlgeschlagen."); }
  }

  async function doVoid() {
    if (editId == null) return;
    try {
      await voidInv.mutateAsync(editId);
      toast.success("Rechnung storniert.");
      backToList();
    } catch { toast.error("Stornieren fehlgeschlagen."); }
  }

  async function doDownloadZugferd() {
    if (editId == null) return;
    setZugferdBusy(true);
    try {
      await downloadZugferdInvoice(editId, loaded?.doc_number || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ZUGFeRD-Download fehlgeschlagen.");
    } finally {
      setZugferdBusy(false);
    }
  }

  function backToList() { setEditId(null); setDraft(EMPTY_DRAFT); setDirty(false); setView("list"); invoices.refetch(); approved.refetch(); }

  // v4.132.0 — Zeiterfassung: nach der Übernahme hat der SERVER neue Positionen
  // + Totals geschrieben → Rechnung neu laden und den lokalen Draft neu befüllen.
  async function onTimesApplied() {
    await invoiceQuery.refetch();
    setDraft(EMPTY_DRAFT);
    setDirty(false);
  }

  const computed = computeOffer(draft.positions, draft.opts);
  const missing = clientMissing(draft, sellerComplete, computed.incomplete, computed.totals.reverse_charge);
  const canFinalize = !dirty && missing.length === 0 && isDraft;

  // ── STAMMDATEN-Ansicht ──────────────────────────────────────────────────────
  if (view === "billing") {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => setView("list")}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Settings className="h-5 w-5" /> Rechnungs-Stammdaten</h1>
          <p className="text-sm text-muted-foreground">Ihre Firmenangaben erscheinen auf jeder Rechnung und sind für die Finalisierung Pflicht (§14 UStG).</p>
        </div>
        <BillingProfileForm onSaved={() => billing.refetch()} />
      </div>
    );
  }

  // ── EDITOR-Ansicht ──────────────────────────────────────────────────────────
  if (view === "editor" && editId != null) {
    if (invoiceQuery.isLoading && draft === EMPTY_DRAFT) {
      return <div className="p-6 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
    }
    const docNumber = loaded?.doc_number || null;
    const dueDate = loaded?.due_date || null;
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>
          <div className="flex items-center gap-2 flex-wrap">
            {docNumber && <Badge variant="secondary">Rechnung {docNumber}</Badge>}
            <Button variant="outline" size="sm" onClick={() => setShowPdf(true)}><Printer className="mr-1 h-4 w-4" /> Als PDF</Button>
            {isDraft && (
              <>
                {/* v4.132.0 — offene Zeiteinträge als Positionen übernehmen (Server rechnet neu) */}
                <span title={dirty ? "Bitte zuerst speichern — die Übernahme lädt das Dokument neu." : ""}>
                  <TimeApplyButton documentId={editId} docType="invoice" customer={draft.counterpart_name} disabled={busy || dirty} onApplied={onTimesApplied} />
                </span>
                <Button variant="outline" size="sm" onClick={save} disabled={busy || !dirty}>
                  {updInv.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Speichern
                </Button>
                <Button variant="ghost" size="sm" onClick={doVoid} disabled={busy}><Trash2 className="mr-1 h-4 w-4" /> Verwerfen</Button>
                <Button size="sm" onClick={doFinalize} disabled={busy || !canFinalize}
                  title={dirty ? "Bitte zuerst speichern" : missing.length ? "Es fehlen: " + missing.join(", ") : ""}>
                  {finalize.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Finalisieren
                </Button>
              </>
            )}
            {!isDraft && loaded?.status === "final" && (
              <>
                <Button variant="outline" size="sm" onClick={doDownloadZugferd} disabled={zugferdBusy}
                  title="Rechnung als ZUGFeRD-PDF (PDF/A-3b mit eingebettetem EN-16931-XML) herunterladen">
                  {zugferdBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} ZUGFeRD-PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={doVoid} disabled={busy}><Trash2 className="mr-1 h-4 w-4" /> Stornieren</Button>
              </>
            )}
          </div>
        </div>
        {dirty && <p className="text-xs text-amber-600">Ungespeicherte Änderungen - vor der Finalisierung speichern.</p>}
        {!isDraft && <p className="text-xs text-muted-foreground">Diese Rechnung ist {loaded?.status === "final" ? "finalisiert" : "storniert"} und kann nicht mehr bearbeitet werden.</p>}

        {/* §14-Vollstaendigkeit */}
        {isDraft && missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Für die Finalisierung fehlen noch: {missing.join(", ")}.
              {!sellerComplete && <> <button className="underline" onClick={() => setView("billing")}>Stammdaten ausfüllen</button>.</>}
            </span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Empfänger & Leistung</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Kunde / Empfänger *</Label>
              <Input value={draft.counterpart_name} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, counterpart_name: e.target.value })} className="h-8" /></div>
            <div><Label className="text-xs">E-Mail</Label>
              <Input value={draft.counterpart_email} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, counterpart_email: e.target.value })} className="h-8" /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Straße + Nr. *</Label>
              <Input value={draft.buyer_address_line1} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, buyer_address_line1: e.target.value })} className="h-8" /></div>
            <div><Label className="text-xs">PLZ *</Label>
              <Input value={draft.buyer_postal_code} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, buyer_postal_code: e.target.value })} className="h-8" /></div>
            <div><Label className="text-xs">Ort *</Label>
              <Input value={draft.buyer_city} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, buyer_city: e.target.value })} className="h-8" /></div>
            <div><Label className="text-xs">USt-IdNr {computed.totals.reverse_charge ? "(§13b: Pflicht)" : "(optional)"}</Label>
              <Input value={draft.buyer_vat_id} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, buyer_vat_id: e.target.value })} className="h-8" /></div>
            <div><Label className="text-xs">Land</Label>
              <Input value={draft.buyer_country_code} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, buyer_country_code: e.target.value.toUpperCase().slice(0, 2) })} className="h-8" placeholder="DE" /></div>
            <div><Label className="text-xs">Leistungsdatum *</Label>
              <Input value={isoToDe(draft.service_date)} disabled={!isDraft} placeholder="TT.MM.JJJJ" onChange={(e) => onDraftChange({ ...draft, service_date: deToIso(e.target.value) })} className="h-8" /></div>
            <div><Label className="text-xs">Rechnungsdatum</Label>
              <Input value={isoToDe(draft.issue_date)} disabled={!isDraft} placeholder="heute" onChange={(e) => onDraftChange({ ...draft, issue_date: deToIso(e.target.value) })} className="h-8" /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Betreff</Label>
              <Input value={draft.subject} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })} className="h-8" /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Anschreiben (optional)</Label>
              <Textarea value={draft.cover_text} disabled={!isDraft} onChange={(e) => onDraftChange({ ...draft, cover_text: e.target.value })} rows={3} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Positionen</CardTitle></CardHeader>
          <CardContent>
            <InvoicePositionsTable state={draft} onChange={onDraftChange} readOnly={!isDraft} />
          </CardContent>
        </Card>

        {showPdf && <InvoicePdf state={draft} seller={billing.data?.profile} docNumber={loaded?.doc_number} dueDate={loaded?.due_date} onClose={() => setShowPdf(false)} />}
      </div>
    );
  }

  // ── LISTEN-Ansicht ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><ReceiptText className="h-5 w-5" /> Rechnungen</h1>
          <p className="text-sm text-muted-foreground">Erstellen Sie eine Rechnung aus einem freigegebenen Angebot - oder manuell. Der PDF-Download versendet nichts; das machen Sie selbst.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setView("billing")}><Settings className="mr-1 h-4 w-4" /> Stammdaten</Button>
          <Button size="sm" onClick={generateManual} disabled={genInv.isPending}><Plus className="mr-1 h-4 w-4" /> Leere Rechnung</Button>
        </div>
      </div>

      {!sellerComplete && !billing.isLoading && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Ihre Rechnungs-Stammdaten sind noch unvollständig. <button className="underline" onClick={() => setView("billing")}>Jetzt ausfüllen</button> - vorher lassen sich keine Rechnungen finalisieren.</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Freigegebene Angebote</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {approved.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
          {!approved.isLoading && (approved.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-4">Keine freigegebenen Angebote. Ein Angebot erscheint hier, sobald es im Bereich „Angebote" freigegeben wurde.</p>
          )}
          {approved.data?.items?.map((o: ApprovedOfferItem) => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{o.subject || o.counterpart_name || "Angebot #" + o.id}</span>
                  {o.has_invoice && <Badge variant="secondary" className="text-[10px]">Rechnung vorhanden</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{o.counterpart_name || ""}{o.amount_gross != null ? " · " + fmtEUR(o.amount_gross) : ""}</p>
              </div>
              <div className="shrink-0">
                {o.has_invoice && o.invoice_id != null ? (
                  <Button variant="outline" size="sm" onClick={() => openInvoice(o.invoice_id as number)}>Rechnung öffnen</Button>
                ) : (
                  <Button size="sm" onClick={() => generateFromOffer(o.id)} disabled={genInv.isPending}>
                    <ArrowRightLeft className="mr-1 h-4 w-4" /> In Rechnung umwandeln
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Rechnungen</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {invoices.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
          {!invoices.isLoading && (invoices.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-4">Noch keine Rechnungen.</p>
          )}
          {invoices.data?.items?.map((inv: InvoiceListItem) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{inv.doc_number || "Entwurf"}</span>
                  <Badge variant={inv.status === "final" ? "default" : inv.status === "void" ? "destructive" : "secondary"} className="text-[10px]">
                    {inv.status === "final" ? "finalisiert" : inv.status === "void" ? "storniert" : "Entwurf"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {inv.counterpart_name || inv.subject || ""}{inv.amount_gross != null ? " · " + fmtEUR(inv.amount_gross) : ""}
                  {inv.created_at ? " · erstellt " + fmtDateDe(inv.created_at) : ""}
                  {inv.issue_date ? " · Rechnungsdatum " + fmtDateDe(inv.issue_date) : ""}
                </p>
              </div>
              <div className="shrink-0">
                <Button variant="outline" size="sm" onClick={() => openInvoice(inv.id)}>Öffnen</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
