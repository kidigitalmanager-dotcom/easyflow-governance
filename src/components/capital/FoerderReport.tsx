// ─────────────────────────────────────────────────────────────────────────────
// FoerderReport.tsx — teilbarer "Latentes-Kapital"-Report als druckbares Dokument
// (Print -> PDF). Gleiche Print-CSS-Technik wie CapitalReport (eigener isolierter
// Portal-Container #capital-foerder-report-portal), KEINE PDF-Lib, KEIN api-router.
// Rendert die bereits geladenen Foerder-Radar-Daten als teilbaren Report, den der
// Kunde oder ein Foerdermittelberater direkt weitergeben kann.
//
// Ehrlichkeit traegt durch: latentes Kapital als Bandbreite mit Methode, KEINE
// Bewilligungsquoten, "Bewilligung entscheidet der Foerdergeber" im Report.
// Sprache: Deutsch (MVP).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buildFoerderReportModel, type FoerderReportMatch } from "@/lib/foerder-report-model";
import { fmtEur, type FoerderRadar } from "@/lib/capital";
import { useFoerderReportBlurbs } from "@/hooks/use-capital";
import { Printer, X, FileText, Landmark, Rocket, Coins, CheckCircle2, AlertCircle, PauseCircle, Info, Sparkles, Loader2 } from "lucide-react";

function fmtDateDe(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function StatusDot({ sc }: { sc: FoerderReportMatch["status_class"] }) {
  const m = { verified: { c: "#047857", Icon: CheckCircle2 }, verify: { c: "#B45309", Icon: AlertCircle }, paused: { c: "#64748b", Icon: PauseCircle } }[sc];
  const Icon = m.Icon;
  return <Icon className="inline w-3 h-3" style={{ color: m.c, verticalAlign: "-1px" }} />;
}

function SectionTitle({ children, breakBefore }: { children: ReactNode; breakBefore?: boolean }) {
  return (
    <h2 className={breakBefore ? "cr-break-before" : ""} style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "26px 0 10px", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>
      {children}
    </h2>
  );
}

export function FoerderReport({ radar, vertical, onClose }: { radar: FoerderRadar; vertical?: string; onClose: () => void }) {
  const blurbsHook = useFoerderReportBlurbs(vertical);
  const blurbs = blurbsHook.data?.blurbs ?? null;
  const llmPending = blurbsHook.isLoading;

  const model = useMemo(() => buildFoerderReportModel(radar, { blurbs }), [radar, blurbs]);
  const now = new Date();
  const dateStr = fmtDateDe(now);

  useEffect(() => {
    const prev = document.title;
    document.title = `UseEasy Förder-Report · ${model.companyName} · ${dateStr}`;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.title = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.companyName, dateStr, onClose]);

  const latentLabel = model.latentIsRange ? `${fmtEur(model.latentLow)} bis ${fmtEur(model.latentHigh)}` : `bis ${fmtEur(model.latentHigh)}`;
  const footerText = `UseEasy Förder-Report · ${model.companyName} · ${dateStr}`;
  const profileBits = [
    model.regionLabel,
    model.profile?.city,
    model.companyAge != null ? `gegruendet ${model.profile?.founding_year} (${model.companyAge} J.)` : null,
    model.profile?.employee_count != null ? `${model.profile.employee_count} Mitarbeitende` : null,
  ].filter(Boolean).join(" · ");

  const body = (
    <div id="capital-foerder-report-portal">
      <style>{PRINT_CSS}</style>

      {/* Toolbar (nicht gedruckt) */}
      <div className="cr-toolbar no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <FileText className="w-4 h-4" />
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Förder-Report · {model.companyName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {llmPending && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#cbd5e1" }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Begruendungen werden formuliert</span>}
          <button className="cr-btn cr-btn-primary" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Drucken / Als PDF</button>
          <button className="cr-btn" onClick={onClose}><X className="w-3.5 h-3.5" /> Schliessen</button>
        </div>
      </div>

      <div className="cr-scroll">
        <div className="cr-page">
          {/* ── Deckblatt ── */}
          <div className="cr-section">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>UseEasy · Förder-Report</p>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "6px 0 2px" }}>{model.companyName}</h1>
                <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>
                  {model.verticalLabel}{profileBits ? ` · ${profileBits}` : ""}
                </p>
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: "#64748b" }}>
                <div>Erstellt am {dateStr}</div>
                <div>Datenstand {dateStr}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", margin: "10px 0 0" }}>
              Oeffentliche Foerderprogramme, die zu Ihrer Branche und Firma passen. Aus Ihrem Firmenprofil gematcht, nicht per Fragebogen erhoben. Ihr latentes Kapital.
            </p>
          </div>

          {/* ── Latentes Kapital (Schaetzung mit Bandbreite) ── */}
          <div className="cr-section" style={{ marginTop: 16, border: "1px solid #dbeafe", background: "#eff6ff", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Landmark className="w-4 h-4" style={{ color: "#2F6FED" }} />
              <span style={{ fontSize: 12, color: "#475569" }}>Geschaetztes latentes Foerdervolumen (Schaetzung mit Bandbreite)</span>
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#0f172a", margin: "4px 0 2px", lineHeight: 1.1 }}>{latentLabel}</div>
            <div style={{ fontSize: 12.5, color: "#475569" }}>
              aus <strong>{model.grantCount}</strong> passenden Zuschussprogrammen
              {model.verifiedCount > 0 && <> · davon <strong style={{ color: "#047857" }}>{model.verifiedCount} web-verifiziert</strong> ({fmtEur(model.verifiedMax)} sofort belastbar)</>}
            </div>
            <p style={{ fontSize: 11, color: "#64748b", margin: "8px 0 0", lineHeight: 1.5 }}>
              Obergrenze aller passenden Zuschuesse (Summe der Foerderhoechstbetraege, nicht kumulativ). Realistisch kombinierbar sind meist 2 bis 4 Programme; die tatsaechliche Summe haengt vom Einzelfall ab. Ob und in welcher Hoehe gefoerdert wird, entscheidet der jeweilige Foerdergeber.
            </p>
          </div>

          {/* ── Top-Matches ── */}
          <SectionTitle>Passende Foerderprogramme</SectionTitle>
          {model.topMatches.length === 0 ? (
            <p style={{ fontSize: 12, color: "#64748b" }}>Fuer das aktuelle Profil wurden keine passenden Zuschussprogramme gefunden. Firmenprofil vervollstaendigen fuer einen exakten Abgleich.</p>
          ) : (
            <>
              <table className="cr-table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Programm</th>
                    <th style={{ width: "20%" }}>Traeger</th>
                    <th style={{ width: "16%" }}>Typische Foerdersumme</th>
                    <th>Passung und Begruendung</th>
                  </tr>
                </thead>
                <tbody>
                  {model.topMatches.map((m) => (
                    <tr key={m.program_key} className="cr-avoid">
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          {m.isStartup ? <Rocket className="w-3 h-3" style={{ color: "#2F6FED" }} /> : <Coins className="w-3 h-3" style={{ color: "#2F6FED" }} />}
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 1 }}><StatusDot sc={m.status_class} /> {m.statusLabel}{m.level ? ` · ${m.level}` : ""}</div>
                      </td>
                      <td style={{ fontSize: 11.5, color: "#334155" }}>{m.traeger}</td>
                      <td style={{ fontSize: 11.5, color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>{m.amountLabel}</td>
                      <td>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "#2F6FED", marginBottom: 2 }}>{m.fitLabel}</div>
                        <div style={{ fontSize: 11.5, color: "#334155", lineHeight: 1.45 }}>{m.reason}</div>
                        {m.conditionalNote && <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 2 }}>Bedingung: {m.conditionalNote}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {model.moreMatchCount > 0 && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "6px 0 0" }}>und {model.moreMatchCount} weitere passende Zuschussprogramme (in der UseEasy-Konsole einsehbar).</p>
              )}
            </>
          )}

          {/* ── Bedingt relevant ── */}
          {model.conditionalMatches.length > 0 && (
            <>
              <SectionTitle>Bedingt relevant</SectionTitle>
              <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 8px" }}>Diese Programme greifen, sobald die genannte Bedingung erfuellt ist (z.B. Firmenprofil vervollstaendigen). Ihre Betraege sind NICHT in der Kopfzahl oben enthalten.</p>
              <div className="cr-section" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {model.conditionalMatches.map((m) => (
                  <div key={m.program_key} className="cr-avoid" style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0f172a" }}>{m.amountLabel}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>{m.reason}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Zusaetzliche Finanzierung ── */}
          {model.financingCount > 0 && (
            <p style={{ fontSize: 11.5, color: "#475569", margin: "16px 0 0" }} className="cr-section">
              <strong>Zusaetzlich {model.financingCount} Finanzierungsprogramme</strong> (Kredite, Beteiligungen, Buergschaften) verfuegbar. Diese sind rueckzahlbar und daher NICHT im latenten Foerdervolumen enthalten.
            </p>
          )}

          {/* ── Methodik und Grenzen ── */}
          <SectionTitle breakBefore>Methodik und Grenzen</SectionTitle>
          <div className="cr-section" style={{ fontSize: 11.5, color: "#334155", lineHeight: 1.5 }}>
            {[
              ["Was die Zahl bedeutet", "Das latente Foerdervolumen ist die Summe der Foerderhoechstbetraege aller passenden Zuschussprogramme, dargestellt als Bandbreite. Es ist eine Obergrenze, keine kumulativ auszahlbare Summe: realistisch kombinierbar sind meist 2 bis 4 Programme."],
              ["Wie gematcht wird", "Der kuratierte Foerderkatalog wird gegen Ihre Branche und Ihr Firmenprofil (Alter, Stadt, Bundesland, Groesse) abgeglichen. Programme mit unerfuellter Bedingung werden ausgeblendet, Programme mit unbekannter Bedingung als 'bedingt relevant' mit Klartext-Bedingung ausgewiesen."],
              ["Verifikation", "'Web-verifiziert' bedeutet, die Programmquelle wurde geprueft (sofort belastbar). 'Status pruefen' bedeutet, das Programm sollte vor Antragstellung verifiziert werden. Automatisch aus der Foerderdatenbank des Bundes importierte, noch ungepruefte Programme fliessen NICHT in die Kopfzahl und nicht in diese Tabelle ein."],
              ["Keine Bewilligungsquoten", "Dieser Report nennt bewusst keine Bewilligungswahrscheinlichkeiten. Ob und in welcher Hoehe gefoerdert wird, entscheidet allein der jeweilige Foerdergeber nach dessen Kriterien."],
              ["Datenquellen", "Kuratierter Foerderkatalog (fachlich gegengeprueft) sowie oeffentliche Programmtraeger (Bund, Laender, EU). Foerder-Eckwerte (Betraege, Programmlisten) stammen aus dem kuratierten Katalog."],
            ].map(([h, b]) => (
              <p key={h} style={{ margin: "0 0 7px" }}><strong style={{ color: "#0f172a" }}>{h}.</strong> {b}</p>
            ))}
          </div>

          {/* ── Wichtiger Hinweis ── */}
          <SectionTitle>Wichtiger Hinweis</SectionTitle>
          <div className="cr-section" style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, padding: "12px 14px", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
            <Info className="inline w-3.5 h-3.5" style={{ verticalAlign: "-2px", color: "#64748b" }} />{" "}
            Ob und in welcher Hoehe eine Foerderung bewilligt wird, entscheidet allein der jeweilige Foerdergeber. Dieser Report ist keine Rechts-, Steuer- oder Foerderberatung und keine Zusage. Programme mit 'Status pruefen' vor Antragstellung verifizieren. Erstellt von UseEasy; ohne Gewaehr.
          </div>

          {/* ── Quellen ── */}
          <SectionTitle>Quellen</SectionTitle>
          <div className="cr-section" style={{ fontSize: 11.5, color: "#334155" }}>
            <p style={{ margin: "0 0 4px" }}><strong>Programmquellen:</strong> {model.sources.length ? model.sources.join(" · ") : "kuratierter UseEasy-Foerderkatalog"}</p>
            {model.autoExcludedCount > 0 && (
              <p style={{ margin: "0 0 4px", color: "#64748b" }}>{model.autoExcludedCount} automatisch importierte, noch ungepruefte Programme wurden aus der Kopfzahl ausgeschlossen.</p>
            )}
            {blurbs && Object.keys(blurbs).length > 0 && (
              <p style={{ margin: "4px 0 0", color: "#64748b" }}><Sparkles className="inline w-3 h-3" style={{ verticalAlign: "-1px", color: "#2F6FED" }} /> Begruendungen KI-formuliert aus den belegten Programmdaten (pseudonymisiert, zitat-treu).</p>
            )}
          </div>

          <p style={{ marginTop: 18, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>{footerText}</p>
        </div>
      </div>

      <div className="cr-print-footer">{footerText}</div>
    </div>
  );

  return createPortal(body, document.body);
}

const PRINT_CSS = `
#capital-foerder-report-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#capital-foerder-report-portal .cr-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#capital-foerder-report-portal .cr-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#capital-foerder-report-portal .cr-btn:hover { background: rgba(255,255,255,0.1); }
#capital-foerder-report-portal .cr-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#capital-foerder-report-portal .cr-btn-primary:hover { background: #2559c9; }
#capital-foerder-report-portal .cr-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#capital-foerder-report-portal .cr-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 40px 44px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#capital-foerder-report-portal .cr-table { width: 100%; border-collapse: collapse; }
#capital-foerder-report-portal .cr-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
#capital-foerder-report-portal .cr-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#capital-foerder-report-portal .cr-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#capital-foerder-report-portal) { display: none !important; }
  #capital-foerder-report-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #capital-foerder-report-portal .cr-toolbar, #capital-foerder-report-portal .no-print { display: none !important; }
  #capital-foerder-report-portal .cr-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #capital-foerder-report-portal .cr-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #capital-foerder-report-portal .cr-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  .cr-avoid { break-inside: avoid; }
  .cr-section { break-inside: avoid; }
  .cr-break-before { break-before: page; }
}
@page { size: A4; margin: 15mm 14mm 18mm; }
`;

// Button "Förder-Report exportieren (PDF)" — oeffnet den druckbaren FoerderReport
// als Overlay. Uebergibt die schon geladene FoerderRadar-Antwort (kein Doppel-Fetch).
import { useState } from "react";

export function FoerderReportButton({ radar, vertical, className }: { radar: FoerderRadar; vertical?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={"inline-flex items-center gap-1.5 text-xs font-medium rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 transition-colors hover:bg-primary/20 " + (className ?? "")}
        title="Teilbaren Förder-Report als PDF exportieren"
      >
        <FileText className="w-3.5 h-3.5" />
        Förder-Report exportieren (PDF)
      </button>
      {open && <FoerderReport radar={radar} vertical={vertical} onClose={() => setOpen(false)} />}
    </>
  );
}
