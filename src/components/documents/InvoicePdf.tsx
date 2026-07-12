// -----------------------------------------------------------------------------
// InvoicePdf.tsx (Phase 2a) - Rechnung als druckbares Dokument (Print -> PDF).
// Muster: OfferPdf / CapitalReport (Print-CSS + window.print(), KEINE PDF-Lib,
// 0 Backend-Dep). Nutzt dieselbe Rechen-Engine (offer-calc) wie der Positions-Tisch.
// Zeigt Verkaeufer-Stammdaten + Empfaenger-Anschrift + Rechnungsnummer + Datum +
// Leistungsdatum + Faelligkeit + Zahlungshinweise (IBAN). Bis zur Finalisierung
// steht "ENTWURF" statt der Nummer.
// -----------------------------------------------------------------------------
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { computeOffer, fmtEUR, fmtDateDe, type OfferPosition } from "@/lib/offer-calc";
import type { InvoiceDraftState } from "./InvoicePositionsTable";
import type { BillingProfile } from "@/lib/api-client";

export function InvoicePdf({
  state, seller, docNumber, dueDate, onClose,
}: {
  state: InvoiceDraftState;
  seller?: BillingProfile | null;
  docNumber?: string | null;
  dueDate?: string | null;
  onClose: () => void;
}) {
  const computed = computeOffer(state.positions, state.opts);
  const t = computed.totals;
  const today = new Date().toISOString().slice(0, 10);
  const issue = state.issue_date || today;
  const coverParas = String(state.cover_text || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const s = seller || null;
  const zeroVat = t.reverse_charge || t.kleinunternehmer;

  const sellerAddr = [
    s?.address_line1, s?.address_line2,
    [s?.postal_code, s?.city].filter(Boolean).join(" "),
  ].filter(Boolean);
  const buyerAddr = [
    state.buyer_address_line1, state.buyer_address_line2,
    [state.buyer_postal_code, state.buyer_city].filter(Boolean).join(" "),
  ].filter(Boolean);

  const body = (
    <div id="inv-pdf-portal">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="iv-toolbar no-print">
        <span className="iv-title">Rechnung · Vorschau{!docNumber ? " (Entwurf)" : ""}</span>
        <div className="iv-actions">
          <button className="iv-btn iv-btn-primary" onClick={() => window.print()}><Printer className="iv-ico" /> Drucken / Als PDF</button>
          <button className="iv-btn" onClick={onClose}><X className="iv-ico" /> Schließen</button>
        </div>
      </div>
      <div className="iv-scroll">
        <div className="iv-page">
          {/* Kopf: Verkaeufer + Rechnungs-Meta */}
          <div className="iv-head">
            <div className="iv-firma">
              <div className="iv-firma-name">{s?.company_name || "[Ihr Firmenname - bitte Stammdaten ausfüllen]"}</div>
              {sellerAddr.map((l, i) => <div key={i} className="iv-firma-line">{l}</div>)}
              {(s?.vat_id || s?.tax_number) && (
                <div className="iv-firma-line iv-muted">{s?.vat_id ? "USt-IdNr: " + s.vat_id : "Steuernummer: " + s?.tax_number}</div>
              )}
            </div>
            <div className="iv-meta">
              <div><strong>Rechnung</strong></div>
              <div>Nr. {docNumber || "ENTWURF"}</div>
              <div>Rechnungsdatum: {fmtDateDe(issue)}</div>
              {state.service_date && <div>Leistungsdatum: {fmtDateDe(state.service_date)}</div>}
              {dueDate && <div>Fällig bis: {fmtDateDe(dueDate)}</div>}
            </div>
          </div>

          {/* Empfaenger */}
          <div className="iv-empf">
            {state.counterpart_name && <div className="iv-empf-name">{state.counterpart_name}</div>}
            {buyerAddr.map((l, i) => <div key={i}>{l}</div>)}
            {state.buyer_country_code && state.buyer_country_code !== "DE" && <div>{state.buyer_country_code}</div>}
            {state.buyer_vat_id && <div className="iv-muted">USt-IdNr: {state.buyer_vat_id}</div>}
          </div>

          {/* Betreff + Anschreiben */}
          {state.subject && <h1 className="iv-betreff">{state.subject}</h1>}
          {coverParas.map((p, i) => <p key={i} className="iv-para">{p}</p>)}

          {/* Positionen */}
          <table className="iv-table">
            <thead>
              <tr>
                <th className="iv-r">Pos.</th>
                <th>Beschreibung</th>
                <th className="iv-r">Menge</th>
                <th>Einheit</th>
                <th className="iv-r">Einzelpreis</th>
                {!zeroVat && <th className="iv-r">MwSt</th>}
                <th className="iv-r">Netto</th>
              </tr>
            </thead>
            <tbody>
              {computed.positions.map((p: OfferPosition, i) => (
                <tr key={i}>
                  <td className="iv-r">{p.pos ?? i + 1}</td>
                  <td>{p.beschreibung || ""}</td>
                  <td className="iv-r">{p.menge ?? ""}</td>
                  <td>{p.einheit || ""}</td>
                  <td className="iv-r">{p.einzelpreis_netto == null ? "—" : fmtEUR(p.einzelpreis_netto)}</td>
                  {!zeroVat && <td className="iv-r">{p.mwst_satz}%</td>}
                  <td className="iv-r">{p.netto == null ? "—" : fmtEUR(p.netto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summen */}
          <div className="iv-sums">
            <div className="iv-sumrow"><span>Zwischensumme (netto)</span><span>{fmtEUR(t.netto)}</span></div>
            {t.rabatt_gesamt_betrag > 0 && <div className="iv-sumrow"><span>Gesamt-Rabatt</span><span>− {fmtEUR(t.rabatt_gesamt_betrag)}</span></div>}
            {t.mwst_7 > 0 && <div className="iv-sumrow"><span>zzgl. 7% MwSt</span><span>{fmtEUR(t.mwst_7)}</span></div>}
            {t.mwst_19 > 0 && <div className="iv-sumrow"><span>zzgl. 19% MwSt</span><span>{fmtEUR(t.mwst_19)}</span></div>}
            {zeroVat && <div className="iv-sumrow iv-muted"><span>Umsatzsteuer</span><span>0,00 EUR</span></div>}
            <div className="iv-sumrow iv-total"><span>Rechnungsbetrag (brutto)</span><span>{fmtEUR(t.brutto)}</span></div>
            {t.skonto_betrag != null && <div className="iv-sumrow iv-muted"><span>abzgl. {t.skonto_prozent}% Skonto</span><span>{fmtEUR(t.skonto_brutto)}</span></div>}
          </div>

          {/* Zahlungshinweise */}
          <div className="iv-pay">
            {dueDate && <p>Bitte überweisen Sie den Rechnungsbetrag von {fmtEUR(t.brutto)} bis zum {fmtDateDe(dueDate)}{docNumber ? " unter Angabe der Rechnungsnummer " + docNumber : ""}.</p>}
            {(s?.iban || s?.bank_name) && (
              <p className="iv-muted">
                {s?.bank_name ? s.bank_name + " · " : ""}{s?.iban ? "IBAN " + s.iban : ""}{s?.bic ? " · BIC " + s.bic : ""}
              </p>
            )}
          </div>

          {/* Hinweise (Steuer/Skonto) */}
          {t.hinweise.length > 0 && (
            <div className="iv-hinweise">
              {t.hinweise.map((h, i) => <p key={i}>{h}</p>)}
            </div>
          )}

          {/* Disclaimer */}
          <p className="iv-disclaimer">
            {!docNumber ? "Entwurf - noch nicht finalisiert (keine Rechnungsnummer vergeben). " : ""}
            Alle Preise verstehen sich {t.kleinunternehmer ? "ohne Umsatzsteuer (§19 UStG)" : t.reverse_charge ? "netto; die Umsatzsteuer schuldet der Leistungsempfänger (§13b UStG)" : "netto zzgl. gesetzlicher Umsatzsteuer"}.
          </p>
          <div className="iv-print-footer">{s?.company_name || "Rechnung"}{docNumber ? " · " + docNumber : ""} · {fmtDateDe(issue)}</div>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

const CSS = `
#inv-pdf-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#inv-pdf-portal .iv-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#inv-pdf-portal .iv-title { font-size: 13px; font-weight: 600; }
#inv-pdf-portal .iv-actions { display: inline-flex; gap: 8px; }
#inv-pdf-portal .iv-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#inv-pdf-portal .iv-btn:hover { background: rgba(255,255,255,0.1); }
#inv-pdf-portal .iv-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#inv-pdf-portal .iv-ico { width: 14px; height: 14px; }
#inv-pdf-portal .iv-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#inv-pdf-portal .iv-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 44px 48px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#inv-pdf-portal .iv-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; gap: 20px; }
#inv-pdf-portal .iv-firma { font-size: 12px; color: #334155; line-height: 1.5; }
#inv-pdf-portal .iv-firma-name { font-size: 16px; font-weight: 700; color: #0f172a; }
#inv-pdf-portal .iv-firma-line { font-size: 12px; }
#inv-pdf-portal .iv-meta { text-align: right; font-size: 12px; color: #334155; line-height: 1.5; white-space: nowrap; }
#inv-pdf-portal .iv-empf { font-size: 13px; margin-bottom: 22px; line-height: 1.5; }
#inv-pdf-portal .iv-empf-name { font-weight: 600; }
#inv-pdf-portal .iv-muted { color: #64748b; }
#inv-pdf-portal .iv-betreff { font-size: 15px; font-weight: 700; margin: 0 0 14px; }
#inv-pdf-portal .iv-para { font-size: 12.5px; line-height: 1.6; margin: 0 0 10px; white-space: pre-wrap; }
#inv-pdf-portal .iv-table { width: 100%; border-collapse: collapse; margin: 18px 0; }
#inv-pdf-portal .iv-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; font-weight: 600; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; }
#inv-pdf-portal .iv-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#inv-pdf-portal .iv-r { text-align: right; }
#inv-pdf-portal .iv-table th.iv-r { text-align: right; }
#inv-pdf-portal .iv-sums { margin: 6px 0 0 auto; max-width: 320px; font-size: 12.5px; }
#inv-pdf-portal .iv-sumrow { display: flex; justify-content: space-between; padding: 4px 0; }
#inv-pdf-portal .iv-total { font-weight: 700; border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 7px; font-size: 14px; }
#inv-pdf-portal .iv-pay { margin-top: 20px; font-size: 12px; color: #334155; line-height: 1.5; }
#inv-pdf-portal .iv-pay p { margin: 0 0 4px; }
#inv-pdf-portal .iv-hinweise { margin-top: 16px; font-size: 11px; color: #475569; line-height: 1.5; }
#inv-pdf-portal .iv-hinweise p { margin: 0 0 4px; }
#inv-pdf-portal .iv-disclaimer { margin-top: 22px; font-size: 10px; color: #94a3b8; line-height: 1.5; }
#inv-pdf-portal .iv-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#inv-pdf-portal) { display: none !important; }
  #inv-pdf-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #inv-pdf-portal .iv-toolbar, #inv-pdf-portal .no-print { display: none !important; }
  #inv-pdf-portal .iv-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #inv-pdf-portal .iv-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #inv-pdf-portal .iv-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  #inv-pdf-portal .iv-table tr { break-inside: avoid; }
}
@page { size: A4; margin: 16mm 15mm 18mm; }
`;
