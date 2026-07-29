// ---------------------------------------------------------------------------
// D4 (Briefing D): Verhaltenstests fuer den Dialog "Postfach verbinden" (IMAP).
//
// Geprueft wird das, was im Betrieb wehtut, wenn es falsch ist:
//   1. Die Autoconfig-Vorschau zeigt, was der Server ermittelt hat (Anbieter,
//      Server, Anbieter-Hinweise) - und nicht etwas Ausgedachtes.
//   2. IMAP- und SMTP-Ergebnis erscheinen GETRENNT, mit den deutschen
//      Backend-Texten woertlich durchgereicht. Ein Postfach kann per IMAP
//      laufen und per SMTP scheitern; genau dieser Fall darf nicht als
//      Totalausfall aussehen.
//   3. Der Kill-Switch-Fall (503 feature_disabled, das Backend liefert dafuer
//      KEIN message_de) landet als lesbarer Satz beim Kunden statt als leerer
//      Ergebnisseite.
//   4. Hard Line: das Passwort geht ausschliesslich im connect-Rumpf raus,
//      steht in keiner URL und ist nach der Antwort aus dem Feld verschwunden.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImapConnectDialog } from "./ImapMailboxConnectCard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function mockApi(responder: (body: Record<string, unknown>) => { status: number; json: unknown }) {
  calls = [];
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), init: init ?? {} });
    const { status, json } = responder(body);
    return { status, ok: status >= 200 && status < 300, json: async () => json } as Response;
  }) as unknown as typeof fetch;
}

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ImapConnectDialog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );

const GMX_CONFIG = {
  provider_hint: "gmx",
  provider_label: "GMX",
  imap_host: "imap.gmx.net",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "mail.gmx.net",
  smtp_port: 587,
  smtp_secure: false,
  username_rule: "email",
  app_password: true,
  notes_de: ["IMAP ist bei GMX standardmaessig AUS und muss im Postfach einmal aktiviert werden."],
  source: "builtin",
};

/** Anbieter waehlen, weiter, Adresse eintragen und Autoconfig ausloesen. */
async function goToForm(email = "chef@gmx.net") {
  fireEvent.click(screen.getByText("GMX"));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  const addr = await screen.findByLabelText("E-Mail-Adresse");
  fireEvent.change(addr, { target: { value: email } });
  fireEvent.blur(addr);
  return addr;
}

beforeEach(() => { calls = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ImapConnectDialog", () => {
  it("zeigt die vom Server ermittelten Serverdaten und die Anbieter-Hinweise", async () => {
    mockApi(() => ({ status: 200, json: { ok: true, action: "autoconfig", config: GMX_CONFIG } }));
    renderDialog();
    await goToForm();

    expect(await screen.findByText(/Erkannt: GMX/)).toBeInTheDocument();
    expect(screen.getByText(/imap\.gmx\.net:993/)).toBeInTheDocument();
    expect(screen.getByText(/mail\.gmx\.net:587/)).toBeInTheDocument();
    // Anbieter-Hinweis kommt woertlich aus der Backend-Antwort.
    expect(screen.getByText(GMX_CONFIG.notes_de[0])).toBeInTheDocument();
    expect(calls[0].url).toContain("/v1/dashboard/mailbox/imap/connect");
  });

  it("meldet IMAP-Erfolg und SMTP-Fehler getrennt und reicht den Backend-Text durch", async () => {
    const smtpMsg = "Anmeldung am SMTP (Versand)-Server abgelehnt: Benutzername oder Passwort stimmen nicht.";
    mockApi((body) =>
      body.action === "autoconfig"
        ? { status: 200, json: { ok: true, action: "autoconfig", config: GMX_CONFIG } }
        : {
            status: 200,
            json: {
              ok: true, action: "connect", saved: true,
              imap: { ok: true },
              smtp: { ok: false, error_code: "auth_failed", message_de: smtpMsg },
              imap_username: "chef@gmx.net", config_used: GMX_CONFIG,
            },
          },
    );
    renderDialog();
    await goToForm();
    await screen.findByText(/Erkannt: GMX/);

    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: "geheim-123" } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));

    expect(await screen.findByText(/Empfang \(IMAP\)/)).toBeInTheDocument();
    expect(screen.getByText(/Versand \(SMTP\)/)).toBeInTheDocument();
    // Kein Totalausfall: gespeichert wurde trotzdem, der Text sagt warum.
    expect(screen.getByText("Das Postfach ist verbunden.")).toBeInTheDocument();
    expect(screen.getByText(smtpMsg)).toBeInTheDocument();
    expect(screen.getByText(/Der Versand ist noch offen/)).toBeInTheDocument();
  });

  it("zeigt den Kill-Switch-Fall als lesbaren Satz, obwohl das Backend keinen Text liefert", async () => {
    mockApi(() => ({ status: 503, json: { ok: false, error: "feature_disabled" } }));
    renderDialog();
    await goToForm();

    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: "geheim-123" } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));

    expect(await screen.findByText(/derzeit abgeschaltet/)).toBeInTheDocument();
    // Keine Ergebnisseite ohne Probe-Ergebnis.
    expect(screen.queryByText("Das Postfach ist verbunden.")).not.toBeInTheDocument();
  });

  it("haelt die Passwort-Hard-Lines ein", async () => {
    mockApi((body) =>
      body.action === "autoconfig"
        ? { status: 200, json: { ok: true, action: "autoconfig", config: GMX_CONFIG } }
        : { status: 200, json: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
    );
    renderDialog();
    await goToForm();
    await screen.findByText(/Erkannt: GMX/);

    const pw = screen.getByLabelText("Passwort des Postfachs") as HTMLInputElement;
    expect(pw.type).toBe("password");
    fireEvent.change(pw, { target: { value: "geheim-123" } });

    // Realistischer Zwischenschritt und zugleich die schaerfere Probe: der Kunde
    // merkt NACH dem Passwort, dass die Adresse einen Tippfehler hat. Die zweite
    // Autoconfig-Abfrage laeuft also mit gefuelltem Passwort-State - und darf es
    // trotzdem nicht mitschicken.
    const addr = screen.getByLabelText("E-Mail-Adresse");
    fireEvent.change(addr, { target: { value: "chefin@gmx.net" } });
    fireEvent.blur(addr);
    await waitFor(() => expect(calls.filter((c) => JSON.parse(String(c.init.body)).action === "autoconfig")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    await screen.findByText("Das Postfach ist verbunden.");

    const autoCalls = calls.filter((c) => JSON.parse(String(c.init.body)).action === "autoconfig");
    const connectCall = calls.find((c) => JSON.parse(String(c.init.body)).action === "connect")!;
    // Nur der connect-Rumpf traegt das Passwort, KEINE Autoconfig-Abfrage.
    for (const c of autoCalls) expect(String(c.init.body)).not.toContain("geheim-123");
    expect(JSON.parse(String(connectCall.init.body)).password).toBe("geheim-123");
    // Nie in einer URL, egal in welchem Aufruf.
    for (const c of calls) expect(c.url).not.toContain("geheim-123");
    expect(document.body.innerHTML).not.toContain("geheim-123");
  });

  it("laesst die Server-Erkennung gegen die Anbieter-Auswahl gewinnen", async () => {
    // Das Backend laesst body.provider_hint gegen die eigene Erkennung gewinnen.
    // Ein pauschal mitgeschickter Wert wuerde also eine bessere Erkennung
    // ueberschreiben - und mit ihr die anbieterspezifischen Hinweise in den
    // Fehlermeldungen (messageDe haengt am provider_hint).
    mockApi((body) =>
      body.action === "autoconfig"
        ? { status: 200, json: { ok: true, action: "autoconfig", config: GMX_CONFIG } }
        : { status: 200, json: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
    );
    renderDialog();
    fireEvent.click(screen.getByText("IONOS"));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    const addr = await screen.findByLabelText("E-Mail-Adresse");
    fireEvent.change(addr, { target: { value: "chef@gmx.net" } });
    fireEvent.blur(addr);
    await screen.findByText(/Erkannt: GMX/);
    // Der Widerspruch wird benannt statt stillschweigend aufgeloest.
    expect(screen.getByText(/Sie hatten IONOS gewählt/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: "geheim-123" } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    await screen.findByText("Das Postfach ist verbunden.");

    const connectBody = JSON.parse(String(calls.find((c) => JSON.parse(String(c.init.body)).action === "connect")!.init.body));
    expect(connectBody.provider_hint).toBeUndefined();
  });

  it("schickt die Anbieter-Auswahl mit, wenn die Erkennung nichts findet", async () => {
    mockApi((body) =>
      body.action === "autoconfig"
        ? { status: 200, json: { ok: false, action: "autoconfig", needs_manual: true, error: "no_autoconfig_found", message_de: "Die Serverdaten konnten nicht automatisch ermittelt werden." } }
        : {
            status: 200,
            json: {
              ok: false, action: "connect", saved: false,
              imap: { ok: false, error_code: "auth_failed", message_de: "Anmeldung abgelehnt. Bei aktiver Zwei-Faktor-Anmeldung ein App-Passwort verwenden." },
              smtp: { ok: false, error_code: "auth_failed", message_de: "Anmeldung abgelehnt." },
            },
          },
    );
    renderDialog();
    fireEvent.click(screen.getByText("IONOS"));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    const addr = await screen.findByLabelText("E-Mail-Adresse");
    fireEvent.change(addr, { target: { value: "chef@eigene-firma.de" } });
    fireEvent.blur(addr);

    // Ohne Erkennung oeffnen sich die Serverfelder von selbst.
    expect(await screen.findByText("Serverdaten nicht gefunden")).toBeInTheDocument();
    expect(screen.getByText("Posteingang (IMAP)")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: "geheim-123" } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    await screen.findByText(/Es wurde nichts gespeichert/);

    const connectBody = JSON.parse(String(calls.find((c) => JSON.parse(String(c.init.body)).action === "connect")!.init.body));
    expect(connectBody.provider_hint).toBe("ionos");
  });

  it("leert das Passwort-Feld, sobald die Antwort da ist", async () => {
    mockApi((body) =>
      body.action === "autoconfig"
        ? { status: 200, json: { ok: true, action: "autoconfig", config: GMX_CONFIG } }
        : {
            status: 200,
            json: {
              ok: false, action: "connect", saved: false,
              imap: { ok: false, error_code: "auth_failed", message_de: "Anmeldung abgelehnt." },
              smtp: { ok: false, error_code: "auth_failed", message_de: "Anmeldung abgelehnt." },
            },
          },
    );
    renderDialog();
    await goToForm();
    await screen.findByText(/Erkannt: GMX/);

    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: "falsch-123" } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    expect(await screen.findByText(/Es wurde nichts gespeichert/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Noch einmal versuchen" }));
    await waitFor(() => {
      const pw = screen.getByLabelText("Passwort des Postfachs") as HTMLInputElement;
      expect(pw.value).toBe("");
    });
  });
});
