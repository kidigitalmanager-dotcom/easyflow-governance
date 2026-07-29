// ---------------------------------------------------------------------------
// Jana Voice: der Tab hing bei „Lade Konfiguration ...“ (Befund 1, 29.07.2026).
//
// Der Fehler lag NICHT in der Anzeige, sondern in der Kette dahinter. Das
// Backend antwortet fuer einen Betrieb ohne Eintrag mit HTTP 404 und dem Rumpf
// { error: 'policy_not_found', tenant_id, hard_blocked_intents, known_intents }.
// apiFetch hat diesen Rumpf verworfen und nur „API Fehler 404“ geworfen. Der
// Zweig, der daraus einen leeren Entwurf bauen sollte, las aber `data.error` —
// und `data` ist bei einem Wurf immer undefined. Toter Code, seit es ihn gibt.
//
// Deshalb pruefen die Tests hier BEIDE Glieder der Kette:
//   1. Der Tab macht aus dem fachlichen 404 ein bedienbares Formular.
//   2. Ein 404 OHNE diesen Rumpf (Route nicht deployt) bleibt ein Fehler und
//      wird nicht als „alles leer, bitte ausfuellen“ getarnt.
//   3. Die Sperrliste kommt vom Server, nicht aus der lokalen Kopie.
// Dass apiFetch den Rumpf ueberhaupt liefert, prueft api-fehler-rumpf.test.ts
// ueber den echten Aufrufweg.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";

const policyQuery: { value: { data?: unknown; isLoading: boolean; error: unknown } } = {
  value: { data: undefined, isLoading: false, error: null },
};

vi.mock("@/hooks/use-api", () => ({
  useAutonomyPolicy: () => ({ ...policyQuery.value, refetch: vi.fn() }),
  useSaveAutonomyPolicy: () => ({ mutate: vi.fn(), isPending: false }),
  useTestAutonomyPolicy: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import JanaAutopilotTab from "./JanaAutopilotTab";

const LEER_RUMPF = {
  ok: false,
  error: "policy_not_found",
  tenant_id: "t-1",
  hard_blocked_intents: ["billing_payment", "contract_legal", "manual_review"],
  known_intents: [
    "request_order", "support_issue", "status_fulfillment", "returns_refund",
    "billing_payment", "contract_legal", "manual_review",
  ],
};

beforeEach(() => {
  policyQuery.value = { data: undefined, isLoading: false, error: null };
});
afterEach(() => cleanup());

/* Der Beweis, dass apiFetch den Rumpf ueberhaupt weiterreicht, steht bewusst
   NICHT hier: eine erste Fassung baute den ApiError im Test selbst und blieb
   deshalb auch dann gruen, wenn apiFetch den Rumpf wieder wegwarf (Mutation
   M7). Diese Kette prueft src/lib/api-fehler-rumpf.test.ts ueber den echten
   Aufrufweg. Hier geht es nur noch um das, was der Tab daraus macht. */

describe("Jana Voice ohne gespeicherte Regeln", () => {
  it("zeigt ein bedienbares Formular statt endlos „Lade Konfiguration“", async () => {
    policyQuery.value = {
      data: undefined,
      isLoading: false,
      error: new ApiError(404, "API Fehler 404", LEER_RUMPF),
    };
    render(<JanaAutopilotTab />);

    await waitFor(() => {
      expect(screen.queryByText(/Lade Konfiguration/i)).not.toBeInTheDocument();
    });
    // Der Leer-Entwurf ist da: die Anlass-Auswahl steht als Schaltflaeche auf
    // der Seite (den Text gibt es zusaetzlich in der Test-Auswahl, deshalb
    // gezielt ueber die Rolle).
    expect(
      await screen.findByRole("button", { name: /Anfrage & Auftrag/ }),
    ).toBeInTheDocument();
    // Und keine Fehlerkarte — „noch nichts gespeichert“ ist kein Fehler.
    expect(screen.queryByText(/nicht laden/i)).not.toBeInTheDocument();
  });

  it("uebernimmt die Sperrliste aus der Server-Antwort, nicht aus der lokalen Kopie", async () => {
    policyQuery.value = {
      data: undefined,
      isLoading: false,
      error: new ApiError(404, "API Fehler 404", {
        ...LEER_RUMPF,
        // Server sperrt hier zusaetzlich „Status & Abwicklung“.
        hard_blocked_intents: ["billing_payment", "contract_legal", "manual_review", "status_fulfillment"],
      }),
    };
    render(<JanaAutopilotTab />);

    // Ein serverseitig gesperrtes Anliegen darf nicht schaltbar sein.
    const gesperrt = await screen.findByRole("button", { name: /Status & Abwicklung/ });
    expect(gesperrt).toBeDisabled();
    expect(gesperrt).toHaveTextContent("blockiert");

    // Gegenprobe: ein NICHT gesperrtes Anliegen bleibt bedienbar. Ohne diese
    // Zeile wuerde der Test auch dann gruen bleiben, wenn schlicht alles
    // deaktiviert waere.
    const offen = await screen.findByRole("button", { name: /Anfrage & Auftrag/ });
    expect(offen).not.toBeDisabled();
  });

  it("behandelt einen 404 ohne policy_not_found weiter als Fehler", async () => {
    // So sieht ein fehlender Gateway-Pfad aus: 404, aber kein fachlicher Rumpf.
    policyQuery.value = {
      data: undefined,
      isLoading: false,
      error: new ApiError(404, "API Fehler 404", { message: "Not Found" }),
    };
    render(<JanaAutopilotTab />);

    expect(await screen.findByText(/nicht laden/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lade Konfiguration/i)).not.toBeInTheDocument();
  });

  it("zeigt gespeicherte Regeln unveraendert an", async () => {
    policyQuery.value = {
      data: {
        ok: true,
        policy: {
          tenant_id: "t-1", channel: "voice", enabled: true,
          allowed_intents: ["request_order"], confidence_threshold: 0.9,
          trigger_on_inbound: true, trigger_on_stalled: false, stalled_days_threshold: 5,
          active_hours_start: "09:00", active_hours_end: "18:00", active_days: [1, 2, 3, 4, 5],
          timezone: "Europe/Berlin", daily_cap: 10, per_contact_cooldown_days: 14,
          test_mode_enabled: true, test_phone_whitelist: [], email_cta_enabled: false,
          hard_blocked_intents: ["billing_payment", "contract_legal", "manual_review"],
          known_intents: LEER_RUMPF.known_intents,
          updated_at: "2026-07-29T06:00:00Z",
        },
      },
      isLoading: false,
      error: null,
    };
    render(<JanaAutopilotTab />);
    expect(
      await screen.findByRole("button", { name: /Anfrage & Auftrag/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Lade Konfiguration/i)).not.toBeInTheDocument();
  });
});
