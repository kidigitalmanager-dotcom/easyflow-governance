// ─────────────────────────────────────────────────────────────────────────────
// MitarbeiterAbrechnungPdf.tsx (v4.133.0) — Lohn-/Stundenabrechnung je MITARBEITER
// als druckbares Dokument (Print → PDF). Muster OfferPdf (Print-CSS + window.print(),
// keine PDF-Lib, 0 Backend). Nutzt den LOHNSATZ (cost_rate_cents) je Eintrag, NICHT
// den Kunden-Abrechnungssatz. Basis dafür, was DER BETRIEB dem Mitarbeiter zahlt.
// ─────────────────────────────────────────────────────────────────────────────
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { fmtEUR, fmtDateDe } from "@/lib/offer-calc";
import type { TimeEntry, BillingProfile } from "@/lib/api-client";

function fmtHours(min: number): string {
  return (Math.round((min / 60) * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Lohnsatz je Eintrag: Snapshot am Eintrag, sonst aktueller Member-Lohnsatz (Fallback).
function costCentsOf(e: TimeEntry, fallbackCents: number | null): number | null {
  return e.cost_rate_cents != null ? e.cost_rate_cents : (fallbackCents != null ? fallbackCents : null);
}

export function MitarbeiterAbrechnungPdf({
  memberName, memberEmail, entries, periodLabel, seller, companyName, fallbackCostCents, onClose,
}: {
  memberName: string;
  memberEmail: string;
  entries: TimeEntry[];
  periodLabel: string;
  seller?: BillingProfile | null;
  companyName?: string | null;
  fallbackCostCents?: number | null;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const sel = seller || null;
  const sellerName = sel?.company_name || companyName || null;
  const sellerAddr = [
    sel?.address_line1, sel?.address_line2,
    [sel?.postal_code, sel?.city].filter(Boolean).join(" "),
  ].filter(Boolean);

  // Nur abgeschlossene, sortierte Einsätze; Summe Stunden + Betrag (nur bekannte Sätze).
  const rows = [...entries].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  const totalMin = rows.reduce((s, e) => s + (e.duration_min || 0), 0);
  const fb = fallbackCostCents ?? null;
  let totalCents = 0;
  let anyMissing = false;
  for (const e of rows) {
    const c = costCentsOf(e, fb);
    if (c == null) anyMissing = true;
    else totalCents += Math.round((e.duration_min / 60) * c);
  }

  const body = (
    <div id="ma-pdf-portal">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ma-toolbar no-print">
        <span className="ma-title">Mitarbeiter-Abrechnung · Vorschau</span>
        <div className="ma-actions">
          <button className="ma-btn ma-btn-primary" onClick={() => window.print()}><Printer className="ma-ico" /> Drucken / Als PDF</button>
          <button className="ma-btn" onClick={onClose}><X className="ma-ico" /> Schließen</button>
        </div>
      </div>
      <div className="ma-scroll">
        <div className="ma-page">
          <div className="ma-head">
            <div className="ma-firma">
              <div className="ma-firma-name">{sellerName || "[Ihr Firmenname — bitte Stammdaten ausfüllen]"}</div>
              {sellerAddr.map((l, i) => <div key={i} className="ma-firma-line">{l}</div>)}
            </div>
            <div className="ma-meta">
              <div><strong>Stundenabrechnung</strong></div>
              <div>Datum: {fmtDateDe(today)}</div>
              <div>Zeitraum: {periodLabel}</div>
            </div>
          </div>

          <div className="ma-emp">
            <div className="ma-emp-label">Mitarbeiter</div>
            <div className="ma-emp-name">{memberName}</div>
            <div className="ma-emp-mail">{memberEmail}</div>
          </div>

          <table className="ma-tbl">
            <thead>
              <tr>
                <th className="ma-l">Datum</th>
                <th className="ma-l">Kunde</th>
                <th className="ma-l">Tätigkeit</th>
                <th className="ma-r">Stunden</th>
                <th className="ma-r">Lohn €/Std</th>
                <th className="ma-r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="ma-empty" colSpan={6}>Keine Einträge im Zeitraum.</td></tr>
              )}
              {rows.map((e) => {
                const c = costCentsOf(e, fb);
                return (
                  <tr key={e.id}>
                    <td className="ma-l">{fmtDateDe(String(e.started_at).slice(0, 10))}</td>
                    <td className="ma-l">{e.customer_name || "—"}</td>
                    <td className="ma-l">{e.description || "—"}</td>
                    <td className="ma-r">{fmtHours(e.duration_min)}</td>
                    <td className="ma-r">{c != null ? fmtEUR(c / 100) : "offen"}</td>
                    <td className="ma-r">{c != null ? fmtEUR((e.duration_min / 60) * (c / 100)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="ma-sum">
                <td className="ma-l" colSpan={3}><strong>Summe</strong></td>
                <td className="ma-r"><strong>{fmtHours(totalMin)}</strong></td>
                <td className="ma-r"></td>
                <td className="ma-r"><strong>{fmtEUR(totalCents / 100)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {anyMissing && (
            <div className="ma-note ma-warn">Für Einsätze mit „offen“ ist kein Lohnsatz hinterlegt — Summe enthält nur die Einsätze mit Satz. Lohnsatz je Mitarbeiter unter Einstellungen → Mitarbeiter pflegen.</div>
          )}
          <div className="ma-note">Interne Abrechnungsgrundlage aus der erfassten Arbeitszeit. Kein Lohnnachweis oder Gehaltsabrechnung im steuer-/sozialversicherungsrechtlichen Sinne.</div>
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

const CSS = `
#ma-pdf-portal{position:fixed;inset:0;z-index:9999;background:#f3f4f6;display:flex;flex-direction:column}
#ma-pdf-portal *{box-sizing:border-box}
.ma-toolbar{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#111827;color:#fff;flex:0 0 auto}
.ma-title{font-size:14px;font-weight:600}
.ma-actions{display:flex;gap:8px}
.ma-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#fff;font-size:13px;cursor:pointer}
.ma-btn-primary{background:#059669;border-color:#059669}
.ma-ico{width:15px;height:15px}
.ma-scroll{flex:1 1 auto;overflow:auto;padding:24px;display:flex;justify-content:center}
.ma-page{width:210mm;min-height:297mm;background:#fff;color:#111827;padding:20mm;box-shadow:0 2px 12px rgba(0,0,0,.15);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5}
.ma-head{display:flex;justify-content:space-between;gap:16px;margin-bottom:22px}
.ma-firma-name{font-weight:700;font-size:14px}
.ma-firma-line{color:#374151}
.ma-meta{text-align:right;color:#374151}
.ma-emp{margin:8px 0 18px;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px}
.ma-emp-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
.ma-emp-name{font-weight:600;font-size:13px}
.ma-emp-mail{color:#6b7280;font-size:11px}
.ma-tbl{width:100%;border-collapse:collapse;margin-top:6px}
.ma-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:1.5px solid #d1d5db;padding:7px 6px}
.ma-tbl td{padding:7px 6px;border-bottom:1px solid #eef0f2;vertical-align:top}
.ma-l{text-align:left}
.ma-r{text-align:right;white-space:nowrap}
.ma-empty{text-align:center;color:#9ca3af;padding:18px}
.ma-sum td{border-top:1.5px solid #d1d5db;border-bottom:none;padding-top:10px;font-size:13px}
.ma-note{margin-top:16px;font-size:10.5px;color:#6b7280}
.ma-warn{color:#b45309}
@media print{
  #ma-pdf-portal{position:static;background:#fff}
  .no-print{display:none!important}
  .ma-scroll{overflow:visible;padding:0}
  .ma-page{width:auto;min-height:auto;box-shadow:none;padding:0}
  @page{size:A4;margin:16mm}
}
`;
