// ─────────────────────────────────────────────────────────────────────────────
// Angebote.tsx (Phase 1b) — Angebots-Entwurf aus einer Anfrage per Knopfdruck.
// Schlanke Anfragen-Liste (request_order-Threads) → "Angebot erstellen" → Jana
// schlägt Positionen + Anschreiben vor (Preise aus der Preisliste, individuelle
// Positionen offen) → editierbarer Positions-Tisch (Live-Neuberechnung) → Freigabe
// → PDF. Kein Auto-Send; die Freigabe legt optional das Anschreiben ins Postfach.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useRequests, useOffer, useGenerateOffer, useUpdateOffer, useOfferVerdict, useBillingProfile,
} from "@/hooks/use-api";
import type { RequestItem, TenantOffer, GenerateOfferBody } from "@/lib/api-client";
import type { OfferPosition, OfferOpts } from "@/lib/offer-calc";
import { computeOffer } from "@/lib/offer-calc";
import { OfferPositionsTable, type OfferDraftState } from "@/components/documents/OfferPositionsTable";
import { OfferPdf } from "@/components/documents/OfferPdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText, Sparkles, RefreshCw, ArrowLeft, Save, CheckCircle2, Loader2, Printer, Plus, Trash2, Mail,
} from "lucide-react";

const EMPTY_DRAFT: OfferDraftState = {
  positions: [], opts: {}, subject: "", cover_text: "", valid_until: "", doc_number: "",
  counterpart_name: "", counterpart_email: "",
};

function offerToDraft(o: TenantOffer): OfferDraftState {
  const t = o.totals || null;
  const opts: OfferOpts = t
    ? {
        reverse_charge: !!t.reverse_charge, kleinunternehmer: !!t.kleinunternehmer,
        rabatt_gesamt_betrag: t.rabatt_gesamt_betrag || null,
        skonto_prozent: t.skonto_prozent || null, skonto_tage: t.skonto_tage || null,
      }
    : {};
  return {
    positions: Array.isArray(o.positions) ? (o.positions as OfferPosition[]) : [],
    opts,
    subject: o.subject || "",
    cover_text: o.cover_text || "",
    valid_until: o.valid_until || "",
    doc_number: o.doc_number || "",
    counterpart_name: o.counterpart_name || "",
    counterpart_email: o.counterpart_email || "",
  };
}

export default function Angebote() {
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<OfferDraftState>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<{ messageId: string; provider: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const requests = useRequests(40);
  const billing = useBillingProfile();
  const genOffer = useGenerateOffer();
  const updOffer = useUpdateOffer();
  const verdict = useOfferVerdict();
  const offerQuery = useOffer(editId);

  const busy = genOffer.isPending || updOffer.isPending || verdict.isPending;

  // Draft aus geladenem Bestandsangebot ziehen (nur beim Öffnen)
  const loadedId = offerQuery.data?.offer?.id ?? null;
  if (editId != null && loadedId === editId && !dirty && offerQuery.data?.offer && draft === EMPTY_DRAFT) {
    setDraft(offerToDraft(offerQuery.data.offer));
  }

  const openEditor = (draftState: OfferDraftState, id: number | null) => {
    setDraft(draftState); setEditId(id); setDirty(false);
  };
  const onDraftChange = (s: OfferDraftState) => { setDraft(s); setDirty(true); };

  // Postfach-Ausloeser: das Outlook-Add-in oeffnet
  // /angebote?generate_from_message=<id>&provider=outlook. Nur message-id + Provider kommen an;
  // den Mail-Text liest offer/generate selbst (fetchInboundMessageText) -> kein PII im Client.
  // Bewusst KEIN Auto-Generieren: erst eine Bestaetigungs-Karte, dann Generieren auf Klick.
  useEffect(() => {
    const mid = searchParams.get("generate_from_message");
    if (!mid) return;
    setPendingMsg({ messageId: mid, provider: searchParams.get("provider") || "outlook" });
    const next = new URLSearchParams(searchParams);
    next.delete("generate_from_message");
    next.delete("provider");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateFromMessage(messageId: string, provider: string) {
    const body: GenerateOfferBody = { source_message_id: messageId, source_provider: provider };
    try {
      const res = await genOffer.mutateAsync(body);
      if (res.skipped) { toast.error("Angebote sind noch nicht aktiviert (Feature/Postfach)."); return; }
      setPendingMsg(null);
      const d: OfferDraftState = {
        positions: res.positions || [],
        opts: { kleinunternehmer: !!res.kleinunternehmer_default },
        subject: res.subject || "", cover_text: res.cover_text || "",
        valid_until: res.valid_until || "", doc_number: "",
        counterpart_name: "", counterpart_email: "",
      };
      openEditor(d, res.document_id);
      if (res.has_price_list) toast.success("Angebot erstellt. Preise aus der Preisliste übernommen.");
      else toast.message("Angebot erstellt. Keine Preisliste gefunden — bitte Preise eintragen.");
    } catch {
      toast.error("Angebot konnte nicht erstellt werden.");
    }
  }

  async function generateFrom(req?: RequestItem) {
    const body: GenerateOfferBody = req
      ? {
          source_message_id: req.source_message_id || undefined,
          source_provider: req.provider || undefined,
          thread_key: req.thread_key || undefined,
          source_subject: req.subject,
          thread_text: req.summary || undefined,
        }
      : {};
    try {
      const res = await genOffer.mutateAsync(body);
      if (res.skipped) { toast.error("Angebote sind noch nicht aktiviert (Feature/Postfach)."); return; }
      const d: OfferDraftState = {
        positions: res.positions || [],
        opts: { kleinunternehmer: !!res.kleinunternehmer_default },
        subject: res.subject || "", cover_text: res.cover_text || "",
        valid_until: res.valid_until || "", doc_number: "",
        counterpart_name: req?.sender && !req.sender.includes("@") ? req.sender : "",
        counterpart_email: "",
      };
      openEditor(d, res.document_id);
      if (res.has_price_list) toast.success("Angebot erstellt. Preise aus der Preisliste übernommen.");
      else toast.message("Angebot erstellt. Keine Preisliste gefunden — bitte Preise eintragen.");
    } catch {
      toast.error("Angebot konnte nicht erstellt werden.");
    }
  }

  async function openExistingOffer(id: number) {
    setEditId(id); setDraft(EMPTY_DRAFT); setDirty(false);
  }

  async function save() {
    if (editId == null) return;
    try {
      const res = await updOffer.mutateAsync({
        document_id: editId,
        positions: draft.positions,
        subject: draft.subject || undefined,
        cover_text: draft.cover_text,
        valid_until: draft.valid_until || undefined,
        doc_number: draft.doc_number || undefined,
        counterpart_name: draft.counterpart_name || undefined,
        counterpart_email: draft.counterpart_email || undefined,
        reverse_charge: !!draft.opts.reverse_charge,
        kleinunternehmer: !!draft.opts.kleinunternehmer,
        rabatt_gesamt_prozent: draft.opts.rabatt_gesamt_prozent ?? null,
        rabatt_gesamt_betrag: draft.opts.rabatt_gesamt_betrag ?? null,
        skonto_prozent: draft.opts.skonto_prozent ?? null,
        skonto_tage: draft.opts.skonto_tage ?? null,
      });
      if (res.error) { toast.error("Speichern fehlgeschlagen: " + (res.details?.join(", ") || res.error)); return; }
      // Server ist autoritativ -> Positionen/Totals aus der Antwort übernehmen
      setDraft((prev) => ({ ...prev, positions: res.positions }));
      setDirty(false);
      toast.success("Gespeichert.");
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    }
  }

  async function approve(sendCoverLetter: boolean) {
    if (editId == null) return;
    try {
      const res = await verdict.mutateAsync({ documentId: editId, action: "approve", send_cover_letter: sendCoverLetter });
      if (res.status !== "approved") {
        const msg = res.error === "offer_incomplete" ? "Es sind noch Preise offen." : res.error === "offer_empty" ? "Das Angebot hat keine Positionen." : "Freigabe nicht möglich.";
        toast.error(msg); return;
      }
      toast.success(sendCoverLetter ? "Freigegeben. Anschreiben liegt im Postfach-Entwurf." : "Freigegeben.");
      backToList();
    } catch {
      toast.error("Freigabe fehlgeschlagen.");
    }
  }

  async function reject() {
    if (editId == null) return;
    try {
      await verdict.mutateAsync({ documentId: editId, action: "reject" });
      toast.success("Angebot verworfen.");
      backToList();
    } catch { toast.error("Verwerfen fehlgeschlagen."); }
  }

  function backToList() { setEditId(null); setDraft(EMPTY_DRAFT); setDirty(false); requests.refetch(); }

  const computed = computeOffer(draft.positions, draft.opts);
  const canApprove = !dirty && !computed.incomplete && draft.positions.length > 0 && computed.errors.length === 0;

  // ── EDITOR-Ansicht ──────────────────────────────────────────────────────────
  if (editId != null) {
    if (offerQuery.isLoading && draft === EMPTY_DRAFT) {
      return <div className="p-6 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
    }
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowPdf(true)}><Printer className="mr-1 h-4 w-4" /> Als PDF</Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy || !dirty}>
              {updOffer.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Speichern
            </Button>
            <Button variant="ghost" size="sm" onClick={reject} disabled={busy}><Trash2 className="mr-1 h-4 w-4" /> Verwerfen</Button>
            <Button size="sm" onClick={() => approve(false)} disabled={busy || !canApprove} title={dirty ? "Bitte zuerst speichern" : computed.incomplete ? "Es sind noch Preise offen" : ""}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Freigeben
            </Button>
            <Button size="sm" variant="secondary" onClick={() => approve(true)} disabled={busy || !canApprove || !draft.counterpart_email}
              title={!draft.counterpart_email ? "E-Mail des Kunden fehlt" : ""}>
              <Mail className="mr-1 h-4 w-4" /> Freigeben + Anschreiben
            </Button>
          </div>
        </div>
        {dirty && <p className="text-xs text-amber-600">Ungespeicherte Änderungen — vor der Freigabe speichern.</p>}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Kopf & Empfänger</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Betreff</Label>
              <Input value={draft.subject} onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })} className="h-8" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Kunde</Label>
                <Input value={draft.counterpart_name} onChange={(e) => onDraftChange({ ...draft, counterpart_name: e.target.value })} className="h-8" /></div>
              <div><Label className="text-xs">E-Mail</Label>
                <Input value={draft.counterpart_email} onChange={(e) => onDraftChange({ ...draft, counterpart_email: e.target.value })} className="h-8" /></div>
            </div>
            <div className="sm:col-span-2"><Label className="text-xs">Anschreiben</Label>
              <Textarea value={draft.cover_text} onChange={(e) => onDraftChange({ ...draft, cover_text: e.target.value })} rows={4} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Positionen</CardTitle></CardHeader>
          <CardContent>
            <OfferPositionsTable state={draft} onChange={onDraftChange} />
          </CardContent>
        </Card>

        {showPdf && <OfferPdf state={draft} seller={billing.data?.profile} onClose={() => setShowPdf(false)} />}
      </div>
    );
  }

  // ── LISTEN-Ansicht (Anfragen) ───────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Angebote</h1>
          <p className="text-sm text-muted-foreground">Erstellen Sie ein Angebot direkt aus einer Kundenanfrage — Jana schlägt Positionen und Anschreiben vor.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => requests.refetch()} disabled={requests.isFetching}>
            <RefreshCw className={"mr-1 h-4 w-4 " + (requests.isFetching ? "animate-spin" : "")} /> Aktualisieren
          </Button>
          <Button size="sm" onClick={() => generateFrom(undefined)} disabled={genOffer.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Leeres Angebot
          </Button>
        </div>
      </div>

      {pendingMsg && (
        <Card className="border-primary/50">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Angebot aus dieser Postfach-Nachricht?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Jana liest den Mail-Text der ausgewählten Nachricht und schlägt Positionen und Anschreiben vor. Danach prüfen Sie den Positions-Tisch und geben frei.</p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => generateFromMessage(pendingMsg.messageId, pendingMsg.provider)} disabled={genOffer.isPending}>
                {genOffer.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Angebot erstellen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingMsg(null)} disabled={genOffer.isPending}>Abbrechen</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Offene Anfragen</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {requests.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
          {!requests.isLoading && (requests.data?.items?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground py-4">Keine offenen Anfragen gefunden. Anfragen erscheinen hier, sobald E-Mails als „Anfrage &amp; Auftrag" eingeordnet wurden.</p>
          )}
          {requests.data?.items?.map((req, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{req.subject}</span>
                  {req.has_offer && <Badge variant="secondary" className="text-[10px]">Angebot: {req.offer_status}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{req.sender}{req.summary ? " · " + req.summary : ""}</p>
              </div>
              <div className="shrink-0">
                {req.has_offer && req.offer_id != null ? (
                  <Button variant="outline" size="sm" onClick={() => openExistingOffer(req.offer_id as number)}>Angebot öffnen</Button>
                ) : (
                  <Button size="sm" onClick={() => generateFrom(req)} disabled={genOffer.isPending}>
                    <Sparkles className="mr-1 h-4 w-4" /> Angebot erstellen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
