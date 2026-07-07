// ─────────────────────────────────────────────────────────────────────────────
// FoerderAntragBundle.tsx — teilbares "an Foerdermittelberater weiterleiten"-Bundle
// (Print -> PDF). Eigener isolierter Portal-Container #capital-foerder-antrag-portal,
// gleiche Print-CSS-Technik wie CapitalReport/FoerderReport, KEINE PDF-Lib, KEIN api-router.
// Inhalt: Programm-Detail + belegte Antrags-Checkliste (aus foerder-detail RAG) +
// Firmenstammdaten + aggregierte UseEasy-Signale (0-100, KEINE Rohunterlagen).
// Ehrlichkeit: keine erfundenen Unterlagen/Fristen/Quoten; offizielle Richtlinie massgeblich.
// Sprache: Deutsch (MVP). Beruehrt FoerderReport.tsx NICHT.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fmtEur, verticalLabelDe, foerderSignalLabel, type FoerderDetailResponse, type FoerderDetailItem } from "@/lib/capital";
import { Printer, X, FileText, ClipboardList, ListChecks, CalendarClock, Building2, Gauge, Landmark } from "lucide-react";

function fmtDateDe(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="fab-section" style={{ breakInside: "avoid", marginTop: 22 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", paddingBottom: 5, borderBottom: "2px solid #e2e8f0", display: "flex", alignItems: "center", gap: 6 }}>
        {icon}{title}
      </h2>
      {children}
    </div>
  );
}

function ChecklistBlock({ title, icon, items, emptyNote }: { title: string; icon: ReactNode; items: FoerderDetailItem[]; emptyNote: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#334155", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 5 }}>{icon}{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>{emptyNote}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 12, color: "#0f172a", marginBottom: 3, lineHeight: 1.45 }}>
              {it.text}
              <span style={{ fontSize: 9.5, color: "#64748b", marginLeft: 5, whiteSpace: "nowrap" }}>[Beleg {it.quelle}]</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FoerderAntragBundle({ data, onClose }: { data: FoerderDetailResponse; onClose: () => void }) {
  const program = data.program;
  const detail = data.detail ?? null;
  const firm = data.firm ?? null;
  const now = new Date();
  const dateStr = fmtDateDe(now);
  const progName = program?.name ?? "Foerderprogramm";
  const companyName = firm?.account_name ?? "Ihr Unternehmen";

  useEffect(() => {
    const prev = document.title;
    document.title = `UseEasy Foerder-Antrag · ${progName} · ${dateStr}`;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.title = prev; window.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progName, dateStr, onClose]);

  const amt = program && (program.amount_max_eur ?? 0) > 0
    ? (program.amount_min_eur && program.amount_min_eur !== program.amount_max_eur
        ? `${fmtEur(program.amount_min_eur)} – ${fmtEur(program.amount_max_eur)}`
        : `bis ${fmtEur(program.amount_max_eur)}`)
    : "individuell";
  const profile = firm?.profile ?? null;
  const companyAge = profile?.founding_year ? (now.getFullYear() - profile.founding_year) : null;
  const profileBits = [
    profile?.city,
    profile?.region,
    profile?.founding_year ? `gegruendet ${profile.founding_year}${companyAge != null ? ` (${companyAge} J.)` : ""}` : null,
    profile?.employee_count != null ? `${profile.employee_count} Mitarbeitende` : null,
    firm?.vertical ? verticalLabelDe(firm.vertical) : null,
  ].filter(Boolean);
  const signals = firm?.signals ?? [];
  const footerText = `UseEasy Foerder-Antrags-Bundle · ${progName} · ${dateStr}`;

  const body = (
    <div id="capital-foerder-antrag-portal">
      <style>{PRINT_CSS}</style>

      <div className="fab-toolbar no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <FileText className="w-4 h-4" />
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Antrags-Bundle · {progName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="fab-btn fab-btn-primary" onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Drucken / Als PDF</button>
          <button className="fab-btn" onClick={onClose}><X className="w-3.5 h-3.5" /> Schliessen</button>
        </div>
      </div>

      <div className="fab-scroll">
        <div className="fab-page">
          {/* Deckblatt */}
          <div className="fab-section">
            <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", margin: 0 }}>UseEasy · Foerder-Antrag zur Weiterleitung</p>
            <h1 style={{ fontSize: 23, fontWeight: 800, color: "#0f172a", margin: "6px 0 2px" }}>{progName}</h1>
            <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>
              {[program?.provider, program?.level, program?.funding_type].filter(Boolean).join(" · ") || "Foerderprogramm"} · Foerdersumme {amt}
            </p>
            <p style={{ fontSize: 11.5, color: "#64748b", margin: "8px 0 0" }}>Fuer: <strong style={{ color: "#334155" }}>{companyName}</strong>{profileBits.length ? ` · ${profileBits.join(" · ")}` : ""} · Stand {dateStr}</p>
          </div>

          {/* Antrags-Zusammenfassung */}
          <Section title="So beantragst du das (Jana)" icon={<ClipboardList className="w-3.5 h-3.5" style={{ color: "#2F6FED" }} />}>
            {detail?.summary ? (
              <p style={{ fontSize: 12.5, color: "#0f172a", lineHeight: 1.55, margin: 0 }}>{detail.summary}</p>
            ) : (
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                {data.indexed === false
                  ? "Die offizielle Richtlinie ist fuer dieses Programm noch nicht indexiert. Bitte die verlinkte Quelle heranziehen – sie ist massgeblich."
                  : "Fuer dieses Programm liegt noch keine belegte Antrags-Zusammenfassung vor. Bitte die verlinkte Quelle heranziehen."}
              </p>
            )}
          </Section>

          {/* Antrags-Checkliste */}
          <Section title="Antrags-Checkliste" icon={<ListChecks className="w-3.5 h-3.5" style={{ color: "#2F6FED" }} />}>
            <ChecklistBlock title="Benoetigte Unterlagen" icon={<ClipboardList className="w-3 h-3" style={{ color: "#64748b" }} />}
              items={detail?.documents_needed ?? []} emptyNote="In der Richtlinie sind keine spezifischen Unterlagen genannt – bitte beim Foerdergeber erfragen." />
            <ChecklistBlock title="Antrags-Schritte" icon={<ListChecks className="w-3 h-3" style={{ color: "#64748b" }} />}
              items={detail?.steps ?? []} emptyNote="Keine belegten Antrags-Schritte gefunden – siehe Quelle." />
            <ChecklistBlock title="Fristen & Voraussetzungen" icon={<CalendarClock className="w-3 h-3" style={{ color: "#64748b" }} />}
              items={detail?.deadlines_conditions ?? []} emptyNote="Keine belegten Fristen/Voraussetzungen gefunden – siehe Quelle." />
          </Section>

          {/* Firmenstammdaten */}
          <Section title="Firmenstammdaten" icon={<Building2 className="w-3.5 h-3.5" style={{ color: "#2F6FED" }} />}>
            {profile ? (
              <table className="fab-table">
                <tbody>
                  <tr><td style={{ color: "#64748b", width: 160 }}>Unternehmen</td><td>{companyName}</td></tr>
                  <tr><td style={{ color: "#64748b" }}>Gruendungsjahr</td><td>{profile.founding_year ?? "–"}{companyAge != null ? ` (${companyAge} Jahre)` : ""}</td></tr>
                  <tr><td style={{ color: "#64748b" }}>Ort</td><td>{[profile.postal_code, profile.city].filter(Boolean).join(" ") || "–"}</td></tr>
                  <tr><td style={{ color: "#64748b" }}>Bundesland/Region</td><td>{profile.region ?? "–"}</td></tr>
                  <tr><td style={{ color: "#64748b" }}>Mitarbeitende</td><td>{profile.employee_count ?? "–"}</td></tr>
                  <tr><td style={{ color: "#64748b" }}>Branche</td><td>{firm?.vertical ? verticalLabelDe(firm.vertical) : "–"}</td></tr>
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>Kein Firmenprofil hinterlegt. Stammdaten koennen im Foerder-Radar ergaenzt werden.</p>
            )}
          </Section>

          {/* Aggregierte UseEasy-Signale */}
          <Section title="Aggregierte UseEasy-Signale" icon={<Gauge className="w-3.5 h-3.5" style={{ color: "#2F6FED" }} />}>
            <p style={{ fontSize: 10.5, color: "#94a3b8", margin: "0 0 6px" }}>
              Aggregierte 0–100-Indizes aus UseEasy – KEINE Antrags-Rohunterlagen (z.B. Jahresabschluss/BWA). Zur Einordnung fuer den Berater; die echten Nachweise stellt das Unternehmen bereit.
            </p>
            {signals.length ? (
              <table className="fab-table">
                <thead><tr><th>Signal</th><th style={{ textAlign: "right" }}>Wert (0–100)</th><th>Stand</th></tr></thead>
                <tbody>
                  {signals.map((s) => (
                    <tr key={s.metric_key}>
                      <td>{foerderSignalLabel(s.metric_key)}{s.is_illustrative ? " (illustrativ)" : ""}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.value == null ? "–" : Math.round(Number(s.value))}</td>
                      <td style={{ color: "#64748b" }}>{s.period ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ fontSize: 11.5, color: "#94a3b8", margin: 0 }}>Noch keine aggregierten Signale verfuegbar.</p>
            )}
          </Section>

          {/* Quelle + Disclaimer */}
          <Section title="Quelle & Hinweis" icon={<Landmark className="w-3.5 h-3.5" style={{ color: "#2F6FED" }} />}>
            {data.source_url && (
              <p style={{ fontSize: 12, margin: "0 0 6px" }}>
                Offizielle Quelle: <a href={data.source_url} style={{ color: "#2F6FED", wordBreak: "break-all" }}>{data.source_url}</a>
              </p>
            )}
            <p style={{ fontSize: 10.5, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
              {data.disclaimer ?? "Ohne Gewaehr – die offizielle Foerderrichtlinie ist massgeblich. UseEasy trifft keine Aussage zu Bewilligungschancen."}
              {" "}Die Bewilligung entscheidet der Foerdergeber. Alle Angaben stammen aus der offiziellen Richtlinie bzw. den hinterlegten Firmendaten.
            </p>
          </Section>
        </div>
      </div>

      <div className="fab-print-footer">{footerText}</div>
    </div>
  );

  return createPortal(body, document.body);
}

const PRINT_CSS = `
#capital-foerder-antrag-portal { position: fixed; inset: 0; z-index: 60; background: rgba(15,23,42,0.6); overflow-y: auto; -webkit-overflow-scrolling: touch; }
#capital-foerder-antrag-portal .fab-toolbar { position: sticky; top: 0; z-index: 61; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; background: #0f172a; color: #fff; }
#capital-foerder-antrag-portal .fab-btn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 6px 11px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: #fff; cursor: pointer; }
#capital-foerder-antrag-portal .fab-btn:hover { background: rgba(255,255,255,0.1); }
#capital-foerder-antrag-portal .fab-btn-primary { background: #2F6FED; border-color: #2F6FED; }
#capital-foerder-antrag-portal .fab-btn-primary:hover { background: #2559c9; }
#capital-foerder-antrag-portal .fab-scroll { max-width: 880px; margin: 24px auto; padding: 0 16px 56px; }
#capital-foerder-antrag-portal .fab-page { background: #fff; color: #0f172a; border-radius: 10px; box-shadow: 0 12px 44px rgba(0,0,0,0.4); padding: 40px 44px; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
#capital-foerder-antrag-portal .fab-table { width: 100%; border-collapse: collapse; }
#capital-foerder-antrag-portal .fab-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #94a3b8; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
#capital-foerder-antrag-portal .fab-table td { font-size: 12px; color: #0f172a; padding: 7px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
#capital-foerder-antrag-portal .fab-print-footer { display: none; }
@media print {
  html, body { background: #fff !important; }
  body > *:not(#capital-foerder-antrag-portal) { display: none !important; }
  #capital-foerder-antrag-portal { position: static !important; background: #fff !important; overflow: visible !important; }
  #capital-foerder-antrag-portal .fab-toolbar, #capital-foerder-antrag-portal .no-print { display: none !important; }
  #capital-foerder-antrag-portal .fab-scroll { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  #capital-foerder-antrag-portal .fab-page { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
  #capital-foerder-antrag-portal .fab-print-footer { display: block !important; position: fixed; left: 0; right: 0; bottom: 6mm; text-align: center; font-size: 8.5px; color: #94a3b8; }
  .fab-section { break-inside: avoid; }
}
@page { size: A4; margin: 15mm 14mm 18mm; }
`;
