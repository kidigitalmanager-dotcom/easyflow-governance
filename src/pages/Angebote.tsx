// ─────────────────────────────────────────────────────────────────────────────
// Angebote.tsx (Phase 1b) — Angebots-Entwurf aus einer Anfrage per Knopfdruck.
// Schlanke Anfragen-Liste (request_order-Threads) → "Angebot erstellen" → Jana
// schlägt Positionen + Anschreiben vor (Preise aus der Preisliste, individuelle
// Positionen offen) → editierbarer Positions-Tisch (Live-Neuberechnung) → Freigabe
// → PDF. Kein Auto-Send; die Freigabe legt optional das Anschreiben ins Postfach.
//
// Redesign 27.07.2026: PageHeader/SectionCard/Chip statt handgebautem <h1> und
// shadcn-Card. Breite und Polsterung macht AppLayout, die Seite bringt nur noch
// `space-y-6` mit. Fachlogik (Deep-Link, Freigabe, Umwandlung) ist unveraendert;
// die Druckansicht (OfferPdf) bleibt bewusst hell — siehe @media print.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useRequests, useOffer, useGenerateOffer, useUpdateOffer, useOfferVerdict, useBillingProfile,
  useApprovedOffers, useGenerateInvoice,
} from "@/hooks/use-api";
import type { RequestItem, TenantOffer, GenerateOfferBody, ApprovedOfferItem } from "@/lib/api-client";
import type { OfferPosition, OfferOpts } from "@/lib/offer-calc";
import { computeOffer } from "@/lib/offer-calc";
import { OfferPositionsTable, type OfferDraftState } from "@/components/documents/OfferPositionsTable";
import { OfferPdf } from "@/components/documents/OfferPdf";
import { TimeApplyButton } from "@/components/documents/TimeApplyDialog"; // v4.132.0 — Zeiterfassung
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { PageHeader, SectionCard, Chip, Dot, EmptyState, type DotTone } from "@/components/ue/primitives";
import { toast } from "sonner";
import { fmtEUR } from "@/lib/offer-calc";
import { describeSkipped } from "@/lib/scan-result";
import {
  Inbox, Sparkles, RefreshCw, ArrowLeft, Save, CheckCircle2, Loader2, Printer, Plus, Trash2, Mail,
  ArrowRightLeft, FileCheck2,
} from "lucide-react";

const EMPTY_DRAFT: OfferDraftState = {
  positions: [], opts: {}, subject: "", cover_text: "", valid_until: "", doc_number: "",
  counterpart_name: "", counterpart_email: "",
};

/* Der Server liefert den Angebots-Status englisch (draft/approved/rejected).
   In der Console steht deutscher Klartext + Statuspunkt — kein Rohwert. */
const OFFER_STATUS: Record<string, { label: string; tone: DotTone }> = {
  draft: { label: "Entwurf", tone: "amber" },
  approved: { label: "freigegeben", tone: "emerald" },
  rejected: { label: "verworfen", tone: "muted" },
};
function offerStatus(raw: string | null): { label: string; tone: DotTone } {
  return OFFER_STATUS[raw ?? ""] ?? { label: raw || "–", tone: "muted" };
}

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
  const [listFilter, setListFilter] = useState<"alle" | "freigabe" | "ohne">("alle"); // v4.130.0
  const [searchParams, setSearchParams] = useSearchParams();

  const requests = useRequests(40);
  const billing = useBillingProfile();
  const genOffer = useGenerateOffer();
  const updOffer = useUpdateOffer();
  const verdict = useOfferVerdict();
  const offerQuery = useOffer(editId);
  // Umbau 2026-07-27: die Umwandlung freigegebener Angebote in Rechnungen lebt
  // jetzt HIER (vorher auf der Rechnungen-Seite) — auch Angebote ohne
  // Anfrage-Thread ("Leeres Angebot") tauchen in dieser Karte wieder auf.
  const approved = useApprovedOffers(40);
  const genInv = useGenerateInvoice();
  const navigate = useNavigate();

  const busy = genOffer.isPending || updOffer.isPending || verdict.isPending;

  async function convertToInvoice(offerId: number) {
    try {
      const res = await genInv.mutateAsync({ offer_id: offerId });
      const _skip = describeSkipped(res.skipped);
      if (_skip) { toast.error(_skip.title + ": " + _skip.hint); return; }
      if (!res.ok || !res.document_id) { toast.error("Rechnung konnte nicht erstellt werden."); return; }
      toast.success("Rechnung aus Angebot erstellt.");
      navigate(`/forderungen?tab=rechnungen&invoice=${res.document_id}`);
    } catch { toast.error("Rechnung konnte nicht erstellt werden."); }
  }

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
  // v4.131.0 (Leon 22.07.): Der Klick in der Mail IST die Bestaetigung -> SOFORT generieren
  // und direkt in den Editor springen. Die Karte bleibt nur als Fehler-Fallback.
  useEffect(() => {
    const mid = searchParams.get("generate_from_message");
    if (!mid) return;
    const prov = searchParams.get("provider") || "outlook";
    const next = new URLSearchParams(searchParams);
    next.delete("generate_from_message");
    next.delete("provider");
    setSearchParams(next, { replace: true });
    setPendingMsg({ messageId: mid, provider: prov });
    void generateFromMessage(mid, prov);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateFromMessage(messageId: string, provider: string) {
    const body: GenerateOfferBody = { source_message_id: messageId, source_provider: provider };
    try {
      const res = await genOffer.mutateAsync(body);
      const _skip = describeSkipped(res.skipped);
      if (_skip) { toast.error(_skip.title + ": " + _skip.hint); return; }
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
      const _skip = describeSkipped(res.skipped);
      if (_skip) { toast.error(_skip.title + ": " + _skip.hint); return; }
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
      // v4.130.0 — Auto-Invoice nach Approve: Entwurf liegt sofort unter Rechnungen
      if (res.auto_invoice?.ok) {
        toast.success("Rechnungs-Entwurf wurde automatisch erstellt — zu finden unter Rechnungen.");
      } else if (res.auto_invoice && !res.auto_invoice.ok) {
        toast.message("Rechnungs-Entwurf konnte nicht automatisch erstellt werden — bitte unter Rechnungen manuell generieren.");
      }
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

  // v4.132.0 — Zeiterfassung: nach der Übernahme hat der SERVER neue Positionen
  // + Totals geschrieben → Angebot neu laden und den lokalen Draft neu befüllen.
  async function onTimesApplied() {
    await offerQuery.refetch();
    setDraft(EMPTY_DRAFT);
    setDirty(false);
  }

  const computed = computeOffer(draft.positions, draft.opts);
  const canApprove = !dirty && !computed.incomplete && draft.positions.length > 0 && computed.errors.length === 0;

  // ── EDITOR-Ansicht ──────────────────────────────────────────────────────────
  if (editId != null) {
    if (offerQuery.isLoading && draft === EMPTY_DRAFT) {
      return (
        <div className="space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-64 w-full rounded-[var(--radius)]" />
        </div>
      );
    }
    // 2026-07-27: Ladefehler nicht als leeres, editierbares Angebot maskieren.
    if (offerQuery.isError && !offerQuery.data?.offer && draft === EMPTY_DRAFT) {
      return (
        <div className="space-y-6">
          <PageHeader
            kicker="Angebote"
            title="Angebot"
            actions={<Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>}
          />
          <QueryErrorNotice label="Das Angebot konnte nicht geladen werden." onRetry={() => offerQuery.refetch()} retrying={offerQuery.isFetching} />
        </div>
      );
    }
    const isDraftOffer = (offerQuery.data?.offer?.status ?? "draft") === "draft";
    return (
      <div className="space-y-6">
        <PageHeader
          kicker="Angebote"
          title={draft.subject.trim() || "Angebot bearbeiten"}
          subtitle="Positionen und Preise prüfen, dann freigeben. Die Freigabe verschickt nichts — sie legt das Anschreiben höchstens als Entwurf ins Postfach."
          actions={<Button variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Button>}
        />

        {/* Aktionsleiste: alles, was mit diesem Dokument passieren kann. */}
        <div className="glass-card flex flex-wrap items-center gap-2 px-4 py-3">
          {offerQuery.data?.offer?.detected_from === "auto_scan" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-surface bg-emerald-surface/70 px-2.5 py-1 text-[11.5px] font-medium text-emerald-light">
              <Sparkles className="h-3 w-3" /> Automatisch aus E-Mail erstellt
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPdf(true)}><Printer className="mr-1 h-4 w-4" /> Als PDF</Button>
            {/* v4.132.0 — offene Zeiteinträge als Positionen übernehmen (nur Entwurf; Server rechnet neu) */}
            {isDraftOffer && (
              <span title={dirty ? "Bitte zuerst speichern — die Übernahme lädt das Dokument neu." : ""}>
                <TimeApplyButton documentId={editId} docType="offer" customer={draft.counterpart_name} disabled={busy || dirty} onApplied={onTimesApplied} />
              </span>
            )}
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
          {dirty && (
            <p className="w-full text-[11.5px] text-amber">Ungespeicherte Änderungen — vor der Freigabe speichern.</p>
          )}
        </div>

        <SectionCard title="Kopf & Empfänger" subtitle="steht so auf dem Angebot">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </SectionCard>

        <SectionCard title="Positionen" subtitle="Summen rechnet die Console live mit; verbindlich ist der Server beim Speichern.">
          <OfferPositionsTable state={draft} onChange={onDraftChange} />
        </SectionCard>

        {/* Druckansicht: bleibt bewusst HELL (Papier-Look, @media print in index.css). */}
        {showPdf && <OfferPdf state={draft} seller={billing.data?.profile} onClose={() => setShowPdf(false)} />}
      </div>
    );
  }

  // ── LISTEN-Ansicht (Anfragen) ───────────────────────────────────────────────
  // v4.130.0 — Filter, „Wartet auf Freigabe" prominent
  const reqItems = requests.data?.items ?? [];
  const nFreigabe = reqItems.filter((r) => r.has_offer && r.offer_status === "draft").length;
  const nOhne = reqItems.filter((r) => !r.has_offer).length;
  const matchesFilter = (req: RequestItem) =>
    listFilter === "alle" ? true
      : listFilter === "freigabe" ? (req.has_offer && req.offer_status === "draft")
      : !req.has_offer;
  const shownRequests = reqItems.filter(matchesFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Vertrieb"
        title="Angebote"
        subtitle="Aus einer Kundenanfrage wird per Knopfdruck ein Angebot — Jana schlägt Positionen und Anschreiben vor. Verschickt wird nichts automatisch."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => requests.refetch()} disabled={requests.isFetching}>
              <RefreshCw className={"mr-1 h-4 w-4 " + (requests.isFetching ? "animate-spin" : "")} /> Aktualisieren
            </Button>
            <Button size="sm" onClick={() => generateFrom(undefined)} disabled={genOffer.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Leeres Angebot
            </Button>
          </>
        }
      />

      {pendingMsg && (
        <SectionCard
          className="border-primary/30"
          title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Angebot aus deiner Postfach-Nachricht</span>}
        >
          {genOffer.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Jana liest die E-Mail und erstellt das Angebot mit deinen Listenpreisen …
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Das Angebot konnte nicht automatisch erstellt werden. Erneut versuchen?</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => generateFromMessage(pendingMsg.messageId, pendingMsg.provider)} disabled={genOffer.isPending}>
                  <Sparkles className="mr-1 h-4 w-4" /> Angebot erstellen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingMsg(null)} disabled={genOffer.isPending}>Abbrechen</Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Offene Anfragen"
        subtitle="E-Mails, die als „Anfrage & Auftrag“ eingeordnet wurden"
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={listFilter === "freigabe"}
              count={nFreigabe > 0 ? nFreigabe : undefined}
              onClick={() => setListFilter(listFilter === "freigabe" ? "alle" : "freigabe")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Wartet auf Freigabe
            </Chip>
            <Chip
              active={listFilter === "ohne"}
              count={nOhne > 0 ? nOhne : undefined}
              onClick={() => setListFilter(listFilter === "ohne" ? "alle" : "ohne")}
            >
              Ohne Angebot
            </Chip>
          </div>
        }
      >
        {requests.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : requests.isError ? (
          <div className="p-4">
            <QueryErrorNotice label="Die Anfragen konnten nicht geladen werden." onRetry={() => requests.refetch()} retrying={requests.isFetching} />
          </div>
        ) : reqItems.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="Keine offenen Anfragen gefunden."
            description="Anfragen erscheinen hier, sobald E-Mails als „Anfrage & Auftrag“ eingeordnet wurden."
          />
        ) : shownRequests.length === 0 ? (
          <EmptyState
            title={listFilter === "freigabe" ? "Kein Angebot wartet gerade auf Freigabe." : "Alle Anfragen haben bereits ein Angebot."}
            description="Filter zurücksetzen, um alle Anfragen zu sehen."
            action={<Button variant="outline" size="sm" onClick={() => setListFilter("alle")}>Alle Anfragen</Button>}
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {shownRequests.map((req, i) => {
              // v4.131.0: lesbare Liste — Betreff-Fallback (alte Threads ohne audit-Betreff)
              const hasSubject = !!req.subject && req.subject !== "(kein Betreff)";
              const when = req.event_at ? new Date(req.event_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
              const title = hasSubject ? req.subject : (req.summary || `Kundenanfrage${when ? ` vom ${when}` : ""}`);
              const senderShown = req.sender && req.sender !== "(unbekannt)" ? req.sender : null;
              const subline = [senderShown, when, hasSubject && req.summary ? req.summary : null].filter(Boolean).join(" · ");
              const st = offerStatus(req.offer_status);
              return (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">{title}</span>
                      {req.has_offer && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Dot tone={st.tone} className="!h-1.5 !w-1.5" /> Angebot: {st.label}
                        </span>
                      )}
                      {req.offer_auto && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-surface bg-emerald-surface/70 px-2 py-0.5 text-[10.5px] font-medium text-emerald-light">
                          <Sparkles className="h-3 w-3" /> Automatisch aus E-Mail
                        </span>
                      )}
                    </div>
                    {subline && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subline}</p>}
                  </div>
                  <div className="shrink-0">
                    {req.has_offer && req.offer_id != null ? (
                      <Button variant={req.offer_auto && req.offer_status === "draft" ? "default" : "outline"} size="sm" onClick={() => openExistingOffer(req.offer_id as number)}>
                        {req.offer_auto && req.offer_status === "draft" ? "Prüfen & freigeben" : "Angebot öffnen"}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => generateFrom(req)} disabled={genOffer.isPending}>
                        <Sparkles className="mr-1 h-4 w-4" /> Angebot erstellen
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Umbau 2026-07-27: freigegebene Angebote (auch ohne Anfrage-Thread) —
          hier werden sie zur Rechnung. Vorher lag diese Karte auf der
          Rechnungen-Seite; ausserdem waren "Leere Angebote" nach dem Verlassen
          des Editors nirgends mehr auffindbar. */}
      <SectionCard
        title="Freigegebene Angebote"
        subtitle="bereit zur Umwandlung in eine Rechnung"
        bodyClassName="p-0"
      >
        {approved.isLoading ? (
          <div className="p-4"><Skeleton className="h-14 w-full rounded-lg" /></div>
        ) : approved.isError ? (
          <div className="p-4">
            <QueryErrorNotice label="Die freigegebenen Angebote konnten nicht geladen werden." onRetry={() => approved.refetch()} retrying={approved.isFetching} />
          </div>
        ) : (approved.data?.items?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<FileCheck2 className="h-7 w-7" />}
            title="Noch keine freigegebenen Angebote."
            description="Ein Angebot erscheint hier nach der Freigabe — bereit zur Umwandlung in eine Rechnung."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {approved.data?.items?.map((o: ApprovedOfferItem) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">{o.subject || o.counterpart_name || "Angebot #" + o.id}</span>
                    {o.has_invoice && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Dot tone="emerald" className="!h-1.5 !w-1.5" /> Rechnung vorhanden
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {o.counterpart_name || "–"}
                    {o.amount_gross != null ? <> · <span className="tabular">{fmtEUR(o.amount_gross)}</span></> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openExistingOffer(o.id)}>Öffnen</Button>
                  {o.has_invoice && o.invoice_id != null ? (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/forderungen?tab=rechnungen&invoice=${o.invoice_id}`)}>Rechnung öffnen</Button>
                  ) : (
                    <Button size="sm" onClick={() => convertToInvoice(o.id)} disabled={genInv.isPending}>
                      {genInv.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-1 h-4 w-4" />} In Rechnung umwandeln
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
