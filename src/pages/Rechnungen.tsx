// -----------------------------------------------------------------------------
// Rechnungen.tsx (Phase 2a) - Rechnung erstellen, §14-Gate, Finalisieren
// (gapless Rechnungsnummer), PDF/ZUGFeRD. KEIN Auto-Send: die PDF laedt und
// versendet der Mensch selbst. Verkaeufer-Stammdaten sind Pflicht vor der Finalisierung.
//
// Umbau 2026-07-27 (Leon): kein eigener Nav-Punkt mehr, sondern Untertab von
// Forderungen (RechnungenView, eingebettet). Die Liste zeigt NUR erstellte
// Rechnungen; die Umwandlung freigegebener Angebote lebt jetzt auf der
// Angebote-Seite und springt per ?tab=rechnungen&invoice=<id> hierher.
// Neu ausserdem: Bestaetigungsdialog vor Verwerfen/Stornieren, echte
// Fehlerzustaende statt falscher Leere.
//
// Redesign 27.07.2026: PageHeader/SectionCard statt handgebautem <h1> + shadcn-Card.
// WICHTIG fuer die Einbettung: Forderungen.tsx rendert oberhalb nur die Untertab-Chips
// und verlaesst sich darauf, dass diese View ihren eigenen Kopf mitbringt — der
// PageHeader bleibt deshalb hier. Ausserdem KEIN eigenes max-w/p-* mehr: Breite und
// Polsterung macht AppLayout. Die Druckansichten (InvoicePdf) bleiben bewusst hell.
// -----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useInvoices, useInvoice, useGenerateInvoice, useUpdateInvoice,
  useFinalizeInvoice, useVoidInvoice, useBillingProfile,
} from "@/hooks/use-api";
import type { TenantInvoice, InvoiceListItem } from "@/lib/api-client";
import { downloadZugferdInvoice } from "@/lib/api-client";
import type { OfferPosition, OfferOpts } from "@/lib/offer-calc";
import { computeOffer, fmtEUR, fmtDateDe } from "@/lib/offer-calc";
import { InvoicePositionsTable, type InvoiceDraftState } from "@/components/documents/InvoicePositionsTable";
import { InvoicePdf } from "@/components/documents/InvoicePdf";
import { BillingProfileForm } from "@/components/documents/BillingProfileForm";
import { TimeApplyButton } from "@/components/documents/TimeApplyDialog"; // v4.132.0 — Zeiterfassung
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, EmptyState, Dot, type DotTone } from "@/components/ue/primitives";
import { toast } from "sonner";
import {
  ReceiptText, ArrowLeft, Save, CheckCircle2, Loader2, Printer, FileDown, Plus, Trash2, Settings, AlertTriangle,
} from "lucide-react";

const EMPTY_DRAFT: InvoiceDraftState = {
  positions: [], opts: {}, subject: "", cover_text: "",
  counterpart_name: "", counterpart_email: "",
  buyer_address_line1: "", buyer_address_line2: "", buyer_postal_code: "", buyer_city: "", buyer_country_code: "DE",
  buyer_vat_id: "", service_date: "", issue_date: "",
};

/* Server-Status englisch -> deutscher Klartext + Statuspunkt. */
const INVOICE_STATUS: Record<string, { label: string; tone: DotTone }> = {
  final: { label: "finalisiert", tone: "emerald" },
  void: { label: "storniert", tone: "danger" },
  draft: { label: "Entwurf", tone: "amber" },
};
function invoiceStatus(raw: string | null | undefined): { label: string; tone: DotTone } {
  return INVOICE_STATUS[raw ?? ""] ?? INVOICE_STATUS.draft;
}

function isoToDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "");
}
function deToIso(v: string): string {
  const s = (v || "").trim();
  // Trennzeichen Punkt ODER Schraegstrich — beides in der Zeichenklasse, kein Escape noetig.
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
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

export function RechnungenView() {
  const [view, setView] = useState<"list" | "editor" | "billing">("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InvoiceDraftState>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [zugferdBusy, setZugferdBusy] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  // 2026-07-27: auch das Finalisieren bekommt eine Rueckfrage. Es vergibt die
  // lueckenlose Rechnungsnummer und sperrt das Dokument — beides laesst sich
  // nur noch per Storno "korrigieren", und die Nummer bleibt dann verbraucht.
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const invoices = useInvoices(50);
  const billing = useBillingProfile();
  const genInv = useGenerateInvoice();
  const updInv = useUpdateInvoice();
  const finalize = useFinalizeInvoice();
  const voidInv = useVoidInvoice();
  const invoiceQuery = useInvoice(editId);

  // Deep-Link ?invoice=<id> (z.B. von Angebote nach "In Rechnung umwandeln"):
  // Editor direkt oeffnen. Der Parameter wird danach entfernt, damit "Zurueck"
  // nicht wieder in den Editor springt.
  useEffect(() => {
    const p = searchParams.get("invoice");
    const id = p ? parseInt(p, 10) : NaN;
    if (Number.isFinite(id) && id > 0) {
      setEditId(id); setDraft(EMPTY_DRAFT); setDirty(false); setView("editor");
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete("invoice"); return n; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("invoice")]);

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
    setConfirmFinalize(false);
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

  // 2026-07-27: laeuft nur noch ueber den Bestaetigungsdialog (confirmVoid) —
  // vorher stornierte EIN Klick eine finalisierte, lueckenlos nummerierte Rechnung.
  async function doVoid() {
    if (editId == null) return;
    setConfirmVoid(false);
    try {
      await voidInv.mutateAsync(editId);
      toast.success(loaded?.status === "final" ? "Rechnung storniert." : "Entwurf verworfen.");
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

  function backToList() { setEditId(null); setDraft(EMPTY_DRAFT); setDirty(false); setView("list"); invoices.refetch(); }

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
      <div className="space-y-6">
        <PageHeader
          kicker="Buchhaltung"
          title="Rechnungs-Stammdaten"
          subtitle="Deine Firmenangaben erscheinen auf jeder Rechnung und sind für die Finalisierung Pflicht (§14 UStG)."
          actions={
            <Button variant="ghost" size="sm" onClick={() => setView("list")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Zurück
            </Button>
          }
        />
        <SectionCard title="Verkäufer-Angaben" subtitle="Firma, Anschrift, Steuernummer und Bankverbindung">
          <BillingProfileForm onSaved={() => billing.refetch()} />
        </SectionCard>
      </div>
    );
  }

  // ── EDITOR-Ansicht ──────────────────────────────────────────────────────────
  if (view === "editor" && editId != null) {
    if (invoiceQuery.isLoading && draft === EMPTY_DRAFT) {
      return (
        <div className="space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
        </div>
      );
    }
    // 2026-07-27: Ladefehler ist ein Ladefehler — vorher wurde hier ein leeres,
    // editierbares Formular gerendert, das wie eine echte Rechnung aussah.
    if (invoiceQuery.isError && !loaded) {
      return (
        <div className="space-y-6">
          <PageHeader
            kicker="Buchhaltung"
            title="Rechnung"
            actions={<Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>}
          />
          <QueryErrorNotice label="Die Rechnung konnte nicht geladen werden." onRetry={() => invoiceQuery.refetch()} retrying={invoiceQuery.isFetching} />
        </div>
      );
    }
    const docNumber = loaded?.doc_number || null;
    const st = invoiceStatus(loaded?.status);
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Buchhaltung"
          title={docNumber ? `Rechnung ${docNumber}` : "Rechnungs-Entwurf"}
          subtitle={
            isDraft
              ? "Der PDF-Download verschickt nichts — das machst du selbst. Finalisieren vergibt die lückenlose Rechnungsnummer."
              : `Diese Rechnung ist ${st.label} und kann nicht mehr bearbeitet werden.`
          }
          actions={<Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>}
        />

        {/* Aktionsleiste: alles, was mit diesem Dokument passieren kann. */}
        <div className="glass-card flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Dot tone={st.tone} /> {st.label}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
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
                <Button variant="ghost" size="sm" onClick={() => setConfirmVoid(true)} disabled={busy}><Trash2 className="mr-1 h-4 w-4" /> Verwerfen</Button>
                {/* 2026-07-27: Tooltip an das Banner unten angeglichen. `missing` enthaelt
                    bei einer gescheiterten Stammdaten-Query zwangslaeufig
                    "Verkäufer-Stammdaten" (sellerComplete ist dann false) — der Tooltip
                    behauptete also einen Pflege-Mangel, wo nur die Query kaputt ist. */}
                <Button size="sm" onClick={() => setConfirmFinalize(true)} disabled={busy || !canFinalize}
                  title={
                    dirty
                      ? "Bitte zuerst speichern"
                      : billing.isError
                        ? "Die Rechnungs-Stammdaten konnten nicht geladen werden — ob etwas fehlt, ist gerade nicht feststellbar."
                        : missing.length
                          ? "Es fehlen: " + missing.join(", ")
                          : ""
                  }>
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
                <Button variant="ghost" size="sm" onClick={() => setConfirmVoid(true)} disabled={busy}><Trash2 className="mr-1 h-4 w-4" /> Stornieren</Button>
              </>
            )}
          </div>
          {dirty && (
            <p className="w-full text-[11.5px] text-amber">Ungespeicherte Änderungen — vor der Finalisierung speichern.</p>
          )}
        </div>

        {/* §14-Vollstaendigkeit. 2026-07-27: ein Ladefehler der Stammdaten darf hier
            NICHT als "Verkäufer-Stammdaten fehlen" erscheinen — das waere eine
            falsche Tatsachenbehauptung ueber gepflegte Daten. */}
        {isDraft && billing.isError && (
          <QueryErrorNotice
            label="Die Rechnungs-Stammdaten konnten nicht geladen werden."
            onRetry={() => billing.refetch()}
            retrying={billing.isFetching}
          />
        )}
        {isDraft && !billing.isError && missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber/40 bg-amber-surface px-3 py-2.5 text-sm text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Für die Finalisierung fehlen noch: {missing.join(", ")}.
              {!sellerComplete && <> <button className="underline underline-offset-2" onClick={() => setView("billing")}>Stammdaten ausfüllen</button>.</>}
            </span>
          </div>
        )}

        <SectionCard title="Empfänger & Leistung" subtitle="Pflichtangaben nach §14 UStG sind mit * markiert">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </SectionCard>

        <SectionCard title="Positionen" subtitle="Summen rechnet die Console live mit; verbindlich ist der Server beim Speichern.">
          <InvoicePositionsTable state={draft} onChange={onDraftChange} readOnly={!isDraft} />
        </SectionCard>

        {/* Druckansicht: bleibt bewusst HELL (Papier-Look, @media print in index.css). */}
        {showPdf && <InvoicePdf state={draft} seller={billing.data?.profile} docNumber={loaded?.doc_number} dueDate={loaded?.due_date} onClose={() => setShowPdf(false)} />}

        <AlertDialog open={confirmFinalize} onOpenChange={setConfirmFinalize}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rechnung jetzt finalisieren?</AlertDialogTitle>
              <AlertDialogDescription>
                Die Rechnung bekommt ihre lückenlose Rechnungsnummer und lässt sich danach nicht mehr
                bearbeiten. Korrigieren geht dann nur noch über eine Stornierung — die Nummer bleibt
                dabei verbraucht. Versendet wird nichts; die PDF lädst du selbst herunter.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={doFinalize}>Finalisieren</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmVoid} onOpenChange={setConfirmVoid}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{loaded?.status === "final" ? "Rechnung wirklich stornieren?" : "Entwurf wirklich verwerfen?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {loaded?.status === "final"
                  ? `Die Rechnung ${docNumber || ""} wird storniert. Die vergebene Rechnungsnummer bleibt verbraucht; das lässt sich nicht rückgängig machen.`
                  : "Der Entwurf wird verworfen und lässt sich nicht wiederherstellen."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={doVoid} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {loaded?.status === "final" ? "Stornieren" : "Verwerfen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── LISTEN-Ansicht ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Buchhaltung"
        title="Rechnungen"
        subtitle="Aus einem freigegebenen Angebot — oder manuell. Der PDF-Download verschickt nichts; das machst du selbst."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setView("billing")}><Settings className="mr-1 h-4 w-4" /> Stammdaten</Button>
            <Button size="sm" onClick={generateManual} disabled={genInv.isPending}><Plus className="mr-1 h-4 w-4" /> Leere Rechnung</Button>
          </>
        }
      />

      {/* 2026-07-27: Fehler beim Laden der Stammdaten NICHT als "unvollständig"
          ausgeben — sonst schickt ein Verbindungsproblem den Betrieb ins Formular. */}
      {billing.isError ? (
        <QueryErrorNotice
          label="Die Rechnungs-Stammdaten konnten nicht geladen werden."
          onRetry={() => billing.refetch()}
          retrying={billing.isFetching}
        />
      ) : !sellerComplete && !billing.isLoading ? (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber/40 bg-amber-surface px-3 py-2.5 text-sm text-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Deine Rechnungs-Stammdaten sind noch unvollständig.{" "}
            <button className="underline underline-offset-2" onClick={() => setView("billing")}>Jetzt ausfüllen</button> — vorher
            lassen sich keine Rechnungen finalisieren.
          </span>
        </div>
      ) : null}

      {/* Umbau 2026-07-27: hier stehen NUR noch erstellte Rechnungen. Die
          Umwandlung freigegebener Angebote lebt auf der Angebote-Seite. */}
      <SectionCard title="Rechnungen" subtitle="Entwürfe, finalisierte und stornierte Belege" bodyClassName="p-0">
        {invoices.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : invoices.isError ? (
          <div className="p-4">
            <QueryErrorNotice label="Die Rechnungen konnten nicht geladen werden." onRetry={() => invoices.refetch()} retrying={invoices.isFetching} />
          </div>
        ) : (invoices.data?.items?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ReceiptText className="h-7 w-7" />}
            title="Noch keine Rechnungen."
            description="Aus einem freigegebenen Angebot (Bereich „Angebote“) oder über „Leere Rechnung“ erstellen."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {invoices.data?.items?.map((inv: InvoiceListItem) => {
              const st = invoiceStatus(inv.status);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">{inv.doc_number || "Entwurf"}</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Dot tone={st.tone} className="!h-1.5 !w-1.5" /> {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {inv.counterpart_name || inv.subject || "–"}
                      {inv.amount_gross != null ? <> · <span className="tabular">{fmtEUR(inv.amount_gross)}</span></> : null}
                      {inv.created_at ? <> · erstellt <span className="tabular">{fmtDateDe(inv.created_at)}</span></> : null}
                      {inv.issue_date ? <> · Rechnungsdatum <span className="tabular">{fmtDateDe(inv.issue_date)}</span></> : null}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openInvoice(inv.id)}>Öffnen</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// Route /rechnungen leitet auf /forderungen?tab=rechnungen um; der Default-Export
// bleibt fuer Alt-Importe erhalten.
export default RechnungenView;
