// ---------------------------------------------------------------------------
// Einstellungen: zwei Befunde vom 29.07.2026, beide an derselben Seite.
//
// Befund 5 — „Verbundene Postfächer 1 / -1“. /me liefert im Team-Paket
// mailbox_limit = -1 als Sentinel fuer „unbegrenzt“. Diese eine Anzeige hat
// isUnlimitedLimit() nicht benutzt (SystemStatusChip und PlanLimitsBar schon)
// und die Zahl roh ausgegeben. Der Kunde las woertlich „1 / -1“.
//
// Befund 4 — der Knopf „Angaben durchsehen“ zeigt auf
// /einstellungen?tab=jana-wissen und tat nichts. Der Tab lag in
// <Tabs defaultValue>, und defaultValue liest React nur beim Mounten. Ein Link
// von der Einstellungs-Seite auf die Einstellungs-Seite wechselt aber nur die
// Adresszeile — kein Unmount, also blieb der Tab stehen.
//
// Beide Tests gehen bewusst ueber die gerenderte Seite und nicht ueber eine
// reine Funktion: die Regeln waren nie falsch, sie wurden nur nicht benutzt.
// Ein Test der Hilfsfunktion haette beide Fehler durchgelassen.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Link, Routes, Route } from "react-router-dom";

type Plan = {
  plan: string;
  mailbox_limit: number | null;
  mailbox_unlimited?: boolean;
  active_mailboxes: number;
  draft_limit: number;
  drafts_used: number;
};

const meData: { value: { plan: Plan; tenant?: unknown; mailbox_health?: unknown[] } | null } = {
  value: null,
};

vi.mock("@/hooks/use-api", () => ({
  useMe: () => ({
    data: meData.value,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDisconnectMailbox: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "leon@example.de" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

/* Die Unterkarten der Seite holen jeweils eigene Daten. Fuer die beiden
   Befunde sind sie ohne Belang, also werden sie durch Marker ersetzt — so
   bleibt der Test auf das gerichtet, was er beweisen soll. */
vi.mock("@/components/WebsiteScanCard", () => ({ default: () => <div data-testid="website-scan" /> }));
vi.mock("@/components/AutoOfferSettingsCard", () => ({ default: () => <div data-testid="auto-offer" /> }));
vi.mock("@/components/DunningSettingsCard", () => ({ default: () => <div data-testid="dunning" /> }));
vi.mock("@/components/MailboxReconnectCard", () => ({ default: () => <div data-testid="reconnect" /> }));
vi.mock("@/components/ImapMailboxConnectCard", () => ({ default: () => <div data-testid="imap" /> }));
vi.mock("@/components/AssistantConfigCard", () => ({ default: () => <div data-testid="assistant" /> }));
vi.mock("@/components/TenantSetupSelfCard", () => ({ default: () => <div data-testid="tenant-setup" /> }));
vi.mock("@/components/SecurityMfaCard", () => ({ default: () => <div data-testid="mfa" /> }));
vi.mock("@/components/PriceListsCard", () => ({ default: () => <div data-testid="price-lists" /> }));
vi.mock("@/components/DhlTrackingCard", () => ({ default: () => <div data-testid="dhl" /> }));
vi.mock("@/components/HubSpotIntegration", () => ({ default: () => <div data-testid="hubspot" /> }));
vi.mock("@/components/MicrosoftIntegration", () => ({ default: () => <div data-testid="microsoft" /> }));
vi.mock("@/components/TelegramIntegration", () => ({ default: () => <div data-testid="telegram" /> }));
vi.mock("@/components/SpreadsheetConfigTab", () => ({ default: () => <div data-testid="spreadsheet" /> }));
vi.mock("@/components/KnowledgeBaseTab", () => ({ default: () => <div data-testid="knowledge" /> }));
vi.mock("@/components/JanaKnowledgeTab", () => ({ default: () => <div data-testid="jana-wissen" /> }));
vi.mock("@/components/JanaAutopilotTab", () => ({ default: () => <div data-testid="jana-voice" /> }));
vi.mock("@/components/EmailAutopilotTab", () => ({ default: () => <div data-testid="email-autopilot" /> }));
vi.mock("@/components/EmailAutopilotAuditView", () => ({ default: () => <div data-testid="email-autopilot-audit" /> }));
vi.mock("@/components/StichprobenAuditTab", () => ({ default: () => <div data-testid="stichproben" /> }));
vi.mock("@/components/BillingTab", () => ({ default: () => <div data-testid="billing" /> }));
vi.mock("@/components/AiTransparencyTab", () => ({ default: () => <div data-testid="ki-transparenz" /> }));

import Einstellungen from "./Einstellungen";

function setzePlan(over: Partial<Plan>) {
  meData.value = {
    plan: {
      plan: "team", mailbox_limit: -1, active_mailboxes: 1,
      draft_limit: 1000, drafts_used: 12, ...over,
    },
    tenant: { status: "active" },
    mailbox_health: [],
  };
}

function zeige(pfad = "/einstellungen") {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      {/* Der Link steht ABSICHTLICH neben der Seite und zeigt auf dieselbe
          Route: genau so verhaelt sich „Angaben durchsehen“ in der Karte
          „Ihre Website“ — Navigation ohne Unmount. */}
      <Link to="/einstellungen?tab=jana-wissen">Angaben durchsehen</Link>
      <Routes>
        <Route path="/einstellungen" element={<Einstellungen />} />
        <Route path="/mitarbeiter" element={<div data-testid="mitarbeiter" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => setzePlan({}));
afterEach(() => cleanup());

describe("Befund 5: Postfach-Zaehler im Team-Paket", () => {
  it("schreibt niemals die rohe -1 auf den Bildschirm", () => {
    setzePlan({ mailbox_limit: -1, active_mailboxes: 1 });
    const { container } = zeige();
    expect(container.textContent).not.toContain("-1");
    expect(container.textContent).not.toContain("1 / -1");
  });

  it("sagt stattdessen, dass unbegrenzt moeglich ist", () => {
    setzePlan({ mailbox_limit: -1, active_mailboxes: 1 });
    zeige();
    expect(screen.getByText(/unbegrenzt möglich/)).toBeInTheDocument();
  });

  it("erkennt auch das Flag und null als unbegrenzt", () => {
    setzePlan({ mailbox_limit: 3, mailbox_unlimited: true, active_mailboxes: 4 });
    const { container } = zeige();
    expect(container.textContent).toContain("unbegrenzt möglich");
    // Und keine Ueber-Limit-Warnung: unbegrenzt kann man nicht ueberschreiten.
    expect(screen.queryByText(/Mehr Postfächer verbunden als der Plan erlaubt/)).not.toBeInTheDocument();

    cleanup();
    setzePlan({ mailbox_limit: null, active_mailboxes: 2 });
    expect(zeige().container.textContent).toContain("unbegrenzt möglich");
  });

  it("zeigt ein echtes Limit weiterhin als Zahl", () => {
    setzePlan({ mailbox_limit: 3, active_mailboxes: 1 });
    const { container } = zeige();
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("verbunden");
    expect(container.textContent).not.toContain("unbegrenzt möglich");
  });

  it("warnt weiterhin, wenn ein echtes Limit ueberschritten ist", () => {
    setzePlan({ mailbox_limit: 2, active_mailboxes: 5 });
    zeige();
    expect(screen.getByText(/Mehr Postfächer verbunden als der Plan erlaubt/)).toBeInTheDocument();
  });
});

describe("Befund 4: Deep-Link auf die eigene Seite", () => {
  it("oeffnet den Tab beim direkten Aufruf", () => {
    zeige("/einstellungen?tab=jana-wissen");
    expect(screen.getByTestId("jana-wissen")).toBeInTheDocument();
  });

  it("schaltet den Tab um, wenn sich nur die Adresszeile aendert", () => {
    zeige("/einstellungen");
    // Vorher: der allgemeine Bereich.
    expect(screen.getByTestId("website-scan")).toBeInTheDocument();
    expect(screen.queryByTestId("jana-wissen")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Angaben durchsehen"));

    // Nachher: Jana-Wissen — ohne dass die Seite neu gemountet wurde.
    expect(screen.getByTestId("jana-wissen")).toBeInTheDocument();
    expect(screen.queryByTestId("website-scan")).not.toBeInTheDocument();
  });

  it("haelt die bekannten Alias-Links am Leben", () => {
    zeige("/einstellungen?tab=excel");
    expect(screen.getByTestId("spreadsheet")).toBeInTheDocument();
    cleanup();

    zeige("/einstellungen?tab=jana");
    expect(screen.getByTestId("jana-voice")).toBeInTheDocument();
    cleanup();

    zeige("/einstellungen?tab=email-autopilot-audit");
    expect(screen.getByTestId("email-autopilot-audit")).toBeInTheDocument();
  });

  it("faellt bei unbekanntem Tab auf den allgemeinen Bereich zurueck", () => {
    zeige("/einstellungen?tab=gibtesnicht");
    expect(screen.getByTestId("website-scan")).toBeInTheDocument();
  });

  it("leitet ?tab=team weiterhin auf die Mitarbeiter-Seite um", () => {
    zeige("/einstellungen?tab=team");
    expect(screen.getByTestId("mitarbeiter")).toBeInTheDocument();
  });

  it("schreibt einen Klick auf einen Tab in die Adresszeile zurueck", () => {
    zeige("/einstellungen");
    const trigger = screen.getByRole("tab", { name: /Jana-Wissen/ });
    // Radix aktiviert den Reiter beim Fokus (activationMode="automatic"),
    // deshalb hier beide Ereignisse statt nur click.
    fireEvent.mouseDown(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(screen.getByTestId("jana-wissen")).toBeInTheDocument();
  });
});
