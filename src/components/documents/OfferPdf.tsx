// ─────────────────────────────────────────────────────────────────────────────
// OfferPdf.tsx — Angebot als druckbares Dokument (Print → PDF). Muster:
// CapitalReport (Print-CSS + window.print(), KEINE PDF-Lib, 0 Backend-Dep).
// Nutzt dieselbe Rechen-Engine (offer-calc) wie der Positions-Tisch.
// ─────────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { computeOffer, fmtEUR, fmtDateDe, type OfferOpts, type OfferPosition } from "@/lib/offer-calc";
import type { OfferDraftState } from "./OfferPositionsTable";

export function OfferPdf({
  state, companyName, docNumberFallback, onClose,
}: {
  state: OfferDraftState;
  companyName?: string | null;
  docNumberFallback?: string;
  onClose: () => void;
}) {
  const computed = computeOffer(state.positions, state.opts);
  const t = computed.totals;
  const today = new Date().toISOString().slice(0, 10);
  const coverParas = String(state.cover_text || "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  const body = (
    <div id="offer-pdf-portal">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="op-toolbar no-print">
        <span className="op-title">Angebot · Vorschau</span>
        <div className="op-actions">
          <button className="op-btn op-btn-primary" onClick={() => window.print()}><Printer className="op-ico" /> Drucken / Als PDF</button>
          <button className="op-btn" onClick={onClose}><X className="op-ico" /> Schließen</button>
        </div>
      </div>
      <div className="op-scroll">
        <div className="op-page">
          {/* Kopf */}
          <div className="op-head">
            <div className="op-firma">{companyName || "[Ihr Firmenname]"}</div>
            <div className="op-meta">
              <div><strong>Angebot</strong></div>
              {(state.doc_number || docNumberFallback) && <div>Nr. {state.doc_number || docNumberFallback}</div>}
              <div>Datum: {fmtDateDe(today)}</div>
              {state.valid_until && <div>Gültig bis: {fmtDateDe(state.valid_until)}</div>}
            </div>
          </div>

          {/* Empfaenger */}
          {(state.counterpart_name || state.counterpart_email) && (
            <div className="op-empf">
              {state.counterpart_name && <div>{state.counterpart_name}</div>}
              {state.counterpart_email && <div className="op-muted">{state.counterpart_email}</div>}
            </div>
          )}

          {/* Betreff + Anschreiben */}
          {state.subject && <h1 className="op-betreff">{state.subject}</h1>}
          {coverParas.map((p, i) => <p key={i} className="op-para">{p}</p>)}

          {/* Positionen */}
          <table className="op-table">
            <thead>
              <tr>
                <th className="op-r">Pos.</th>
                <th>Beschreibung</th>
                <th className="op-r">Menge</th>
                <th>Einheit</th>
                <th className="op-r">Einzelpreis</th>
                {!t.reverse_charge && !t.kleinunternehmer && <th className="op-r">MwSt</th>}
                <th className="op-r">Netto</th>
              </tr>
            </thead>
            <tbody>
              {computed.positions.map((p: OfferPosition, i) => (
                <tr key={i}>
                  <td className="op-r">{p.pos ?? i + 1}</td>
                  <td>{p.beschreibung || ""}</td>
                  <td className="op-r">{p.menge ?? ""}</td>
                  <td>{p.einheit || ""}</td>
                  <td className="op-r">{p.einzelpreis_netto == null ? "—" : fmtEUR(p.einzelpreis_netto)}</td>
                  {!t.reverse_charge && !t.kleinunternehmer && <td className="op-r">{p.mwst_satz}%</td>}
                  <td className="op-r">{p.netto == null ? "—" : fmtEUR(p.netto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summen */}
          <div className="op-sums">
            <div className="op-sumrow"><span>Zwischensumme (netto)</span><span>{fmtEUR(t.netto)}</span></div>
            {t.rabatt_gesamt_betrag > 0 && <div className="op-sumrow"><span>Gesamt-Rabatt</span><span>− {fmtEUR(t.rabatt_gesamt_betrag)}</span></div>}
            {t.mwst_7 > 0 && <div className="op-sumrow"><span>zzgl. 7% MwSt</span><span>{fmtEUR(t.mwst_7)}</span></div>}
            {t.mwst_19 > 0 && <div className="op-sumrow"><span>zzgl. 19% MwSt</span><span>{fmtEUR(t.mwst_19)}</span></div>}
            {(t.reverse_charge || t.kleinunternehmer) && <div className="op-sumrow op-muted"><span>Umsatzsteuer</span><span>0,00 EUR</span></div>}
            <div className="op-sumrow op-total"><span>Gesamtbetrag (brutto)</span><span>{fmtEUR(t.brutto)}</span></div>
            {t.skonto_betrag != null && <div className="op-sumrow op-muted"><span>abzgl. {t.skonto_prozent}% Skonto</span><span>{fmtEUR(t.skonto_brutto)}</span></div>}
          </div>

          {/* Hinweise */}
          {t.hinweise.length > 0 && (
            <div className="op-hinweise">
              {t.hinweise.map((h, i) => <p key={i}>{h}</p>)}
            </div>
          )}

          {/* Disclaimer */}
          <p className="op-disclaimer">
            Dies ist ein Angebots-Entwurf. Alle Preise verstehen sich {t.kleinunternehmer ? "ohne Umsatzsteuer (§19 UStG)" : t.reverse_charge ? "netto; die Umsatzsteuer schuldet der Leistungsempfänger (§13b UStG)" : "netto zzgl. gesetzlicher Umsatzsteuer"}.
            {state.valid_until ? ` Das Angebot ist gültig bis ${fmtDateDe(state.valid_until)}.` : ""}
          </p>
          <div className="op-print-footer">{companyName || "Angebot"} · erstellt mit UseEasy · {fmtDateDe(today)}</div>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

const CSS = `
#offer-pdf-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#offer-pdf-portal .op-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#offer-pdf-portal .op-title { font-size: 13px; font-weight: 600; }
#offer-pdf-portal .op-actions { display: inline-flex; gap: 8px; }
#offer-pdf-portal .op-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#offer-pdf-portal .op-btn:hover { background: rgba(255,255,255,0.1); }
#offer-pdf-portal .op-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#offer-pdf-portal .op-ico { width: 14px; height: 14px; }
#offer-pdf-portal .op-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#offer-pdf-portal .op-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 44px 48px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#offer-pdf-portal .op-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
#offer-pdf-portal .op-firma { font-size: 17px; font-weight: 700; }
#offer-pdf-portal .op-meta { text-align: right; font-size: 12px; color: #334155; line-height: 1.5; }
#offer-pdf-portal .op-empf { font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
#offer-pdf-portal .op-muted { color: #64748b; }
#offer-pdf-portal .op-betreff { font-size: 15px; font-weight: 700; margin: 0 0 14px; }
#offer-pdf-portal .op-para { font-size: 12.5px; line-height: 1.6; margin: 0 0 10px; white-space: pre-wrap; }
#offer-pdf-portal .op-table { width: 100%; border-collapse: collapse; margin: 18px 0; }
#offer-pdf-portal .op-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; font-weight: 600; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; }
#offer-pdf-portal .op-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#offer-pdf-portal .op-r { text-align: right; }
#offer-pdf-portal .op-table th.op-r { text-align: right; }
#offer-pdf-portal .op-sums { margin: 6px 0 0 auto; max-width: 320px; font-size: 12.5px; }
#offer-pdf-portal .op-sumrow { display: flex; justify-content: space-between; padding: 4px 0; }
#offer-pdf-portal .op-total { font-weight: 700; border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 7px; font-size: 14px; }
#offer-pdf-portal .op-hinweise { margin-top: 20px; font-size: 11px; color: #475569; line-height: 1.5; }
#offer-pdf-portal .op-hinweise p { margin: 0 0 4px; }
#offer-pdf-portal .op-disclaimer { margin-top: 24px; font-size: 10px; color: #94a3b8; line-height: 1.5; }
#offer-pdf-portal .op-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#offer-pdf-portal) { display: none !important; }
  #offer-pdf-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #offer-pdf-portal .op-toolbar, #offer-pdf-portal .no-print { display: none !important; }
  #offer-pdf-portal .op-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #offer-pdf-portal .op-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #offer-pdf-portal .op-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  #offer-pdf-portal .op-table tr { break-inside: avoid; }
}
@page { size: A4; margin: 16mm 15mm 18mm; }
`;
