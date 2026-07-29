// ---------------------------------------------------------------------------
// Autopilot Audit-Trail: lesbar fuer einen Betrieb, nicht fuer einen Entwickler
// (Befund 2, 29.07.2026).
//
// Die Ansicht zeigte pro Zeile eine rohe UUID in Monospace und darunter ein
// aufgeklapptes JSON.stringify(reasons) samt englischer Entwicklersaetze wie
// "confidence=0.812 < threshold=0.900 for request_order".
//
// Geprueft wird deshalb:
//   1. Jede Entscheidung hat einen deutschen Satz, der den Grund nennt.
//   2. Im Normalzustand steht KEIN JSON und KEINE UUID auf der Seite.
//   3. Die technischen Angaben sind erreichbar, aber nur auf Klick.
//   4. Der Probelauf verliert seinen Grund nicht (dort steckt er NUR in
//      reasons[], weil die Entscheidung selbst nur den Modus beschreibt).
//   5. Ein unbekannter Code erfindet keine Erklaerung, sondern zeigt sich.
//   6. Jeder Code, den Engine und Sender schreiben, ist abgedeckt.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

const logData: { value: unknown } = { value: null };

vi.mock("@/hooks/use-api", () => ({
  useAutopilotLog: () => ({ data: logData.value, isLoading: false }),
}));

import EmailAutopilotAuditView from "./EmailAutopilotAuditView";

/* Die Codes, die im Betrieb tatsaechlich in governance.autopilot_log landen.
   Quelle: autopilot_engine.js (logAutopilot + checkEligibility.primary_reason)
   und useeasy-autopilot-sender (_markSent/_markHeld/_markDeferred/
   _markFallbackHuman). Stand 29.07.2026. Kommt ein Code dazu, faellt Test 6
   um — das ist der Zweck. */
const DECISIONS_AUS_DEM_BACKEND = [
  "sent", "queued_for_send",
  "shadow_would_send", "shadow_would_qualify", "shadow_would_hold",
  "held_disabled", "held_no_policy", "held_kill_switch", "killed",
  "tenant_paused", "held_daily_cap", "deferred_send_window",
  "held_low_conf", "held_no_confidence", "held_no_threshold",
  "held_risk_flag", "held_not_whitelisted",
  "held_hard_block_intent", "held_hard_block_action_type",
  "held_unknown_action_type", "not_implemented_yet",
  "held_no_core_key", "held_no_need_reply", "held_need_reply_fallback",
  "held_legal_basis", "held_no_body", "held_body_too_short",
  "held_no_maturity", "held_high_mismatch", "held_high_edit_rate",
  "send_failed_fallback_human", "held_unknown",
];

function zeile(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "log-1",
    tenant_id: "t-1",
    draft_id: "9f1d5c7e-4b2a-4c11-9d3e-77aa0c1b2f88",
    event_id: null,
    core_key: "request_order",
    confidence: 0.812,
    action_type: "email_send",
    decision: "held_low_conf",
    reasons: [{ code: "held_low_conf", msg: "confidence=0.812 < threshold=0.900 for request_order" }],
    cooldown_until: null,
    sent_at: null,
    created_at: "2026-07-29T06:30:00Z",
    ...over,
  };
}

function setzeZeilen(rows: unknown[]) {
  logData.value = {
    ok: true,
    tenant_id: "t-1",
    filters: { decision: null, action_type: null, since: null },
    pagination: { limit: 50, offset: 0, total: rows.length, has_more: false },
    rows,
  };
}

beforeEach(() => setzeZeilen([zeile()]));
afterEach(() => cleanup());

describe("Audit-Trail: Klartext statt Maschinenraum", () => {
  it("nennt den Grund auf Deutsch", () => {
    render(<EmailAutopilotAuditView />);
    expect(screen.getByText("Zu unsicher")).toBeInTheDocument();
    expect(
      screen.getByText(/nicht sicher genug und hat ihn Ihnen vorgelegt/),
    ).toBeInTheDocument();
    // Die Kategorie steht als Wort da, nicht als core_key.
    expect(screen.getByText("Anfrage & Auftrag")).toBeInTheDocument();
    expect(screen.queryByText("request_order")).not.toBeInTheDocument();
  });

  it("zeigt weder JSON noch den englischen Entwicklersatz", () => {
    const { container } = render(<EmailAutopilotAuditView />);
    const text = container.textContent || "";
    expect(text).not.toContain("confidence=0.812");
    expect(text).not.toContain('"code"');
    expect(text).not.toContain("{");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("blendet die Roh-Kennungen aus, bis man sie ausdruecklich anfordert", () => {
    const { container } = render(<EmailAutopilotAuditView />);
    expect(container.textContent).not.toContain("9f1d5c7e-4b2a-4c11-9d3e-77aa0c1b2f88");

    fireEvent.click(screen.getByRole("button", { name: /Technische Angaben/ }));
    expect(container.textContent).toContain("9f1d5c7e-4b2a-4c11-9d3e-77aa0c1b2f88");
    expect(container.textContent).toContain("held_low_conf");
    expect(screen.getByText("81 Prozent")).toBeInTheDocument();
  });

  it("verliert im Probelauf den eigentlichen Grund nicht", () => {
    // Hier beschreibt die Entscheidung nur den Modus. Wuerde die Ansicht wie
    // sonst reasons[0] als Dublette wegwerfen, stuende der Grund nirgends.
    setzeZeilen([
      zeile({
        decision: "shadow_would_hold",
        reasons: [{ code: "held_risk_flag", msg: "risk_flag=bank_details permanently blocks auto-send" }],
      }),
    ]);
    render(<EmailAutopilotAuditView />);
    expect(screen.getByText("Probelauf: hätte zurückgehalten")).toBeInTheDocument();
    expect(
      screen.getByText(/nie automatisch beantwortet/),
    ).toBeInTheDocument();
  });

  it("zeigt denselben Satz nicht zweimal", () => {
    // decision === reasons[0].code ist der Normalfall der Engine.
    const { container } = render(<EmailAutopilotAuditView />);
    const treffer = (container.textContent || "").match(/nicht sicher genug/g) || [];
    expect(treffer.length).toBe(1);
  });

  it("nennt den naechsten Versuch, wenn das Sendefenster voll war", () => {
    setzeZeilen([
      zeile({
        decision: "deferred_send_window",
        reasons: [{ code: "send_window_reached", retry_in_minutes: 15 }],
        cooldown_until: "2026-07-29T06:45:00Z",
      }),
    ]);
    render(<EmailAutopilotAuditView />);
    expect(screen.getByText("Wartet auf das Sende-Fenster")).toBeInTheDocument();
    expect(screen.getByText(/Nächster Versuch ab/)).toBeInTheDocument();
  });

  it("erfindet fuer einen unbekannten Code keine Erklaerung", () => {
    setzeZeilen([zeile({ decision: "held_voellig_neu", reasons: [] })]);
    render(<EmailAutopilotAuditView />);
    // Der Rohwert ist sichtbar — besser ein unverstandener Code als ein
    // erfundener Grund.
    expect(screen.getByText("held_voellig_neu")).toBeInTheDocument();
    expect(screen.getByText(/noch keine Erklärung in der Console/)).toBeInTheDocument();
  });

  it("kennt jeden Code, den Engine und Sender schreiben", () => {
    setzeZeilen(
      DECISIONS_AUS_DEM_BACKEND.map((d, i) => zeile({ id: `l-${i}`, decision: d, reasons: [] })),
    );
    const { container } = render(<EmailAutopilotAuditView />);
    const text = container.textContent || "";
    const ohneErklaerung = DECISIONS_AUS_DEM_BACKEND.filter((d) => text.includes(d));
    expect(ohneErklaerung).toEqual([]);
    expect(screen.queryByText(/noch keine Erklärung in der Console/)).not.toBeInTheDocument();
  });

  it("beschriftet auch die Filter-Auswahl in Klartext", () => {
    render(<EmailAutopilotAuditView />);
    const auswahl = screen.getByRole("combobox");
    // Kein roher Code im sichtbaren Teil der Auswahl.
    expect(within(auswahl).queryByText(/held_|shadow_|_send$/)).not.toBeInTheDocument();
  });
});
