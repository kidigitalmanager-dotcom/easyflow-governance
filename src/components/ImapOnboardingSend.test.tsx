// ---------------------------------------------------------------------------
// D4.1 + D5 (Briefing D, 29.07.2026): Verhaltenstests fuer die beiden neuen
// Wege durch DENSELBEN Dialog.
//
// D4.1 - IMAP direkt im Onboarding. /connect laeuft pre-login, also ohne
//        Supabase-Token und ohne den Dashboard-Endpunkt. Statt einer zweiten
//        Kopie des Dialogs wird die Transport-Funktion hereingereicht.
//        Geprueft wird das, was dabei schiefgehen kann:
//          - laeuft der Aufruf wirklich gegen den Onboarding-Endpunkt und
//            NICHT gegen den Dashboard-Endpunkt (der wuerde 401 liefern)?
//          - 🔴 steht der Onboarding-Token im RUMPF und das Passwort ebenfalls,
//            und ist in KEINER aufgerufenen URL ein Query-String? Token und
//            Postfach-Passwort duerfen nie in derselben Adresse landen, weil
//            Query-Strings in Browser-Verlauf, Referrer und Gateway-Logs stehen.
//
// D5   - Versand-Zustand. Ein Postfach kann tadellos empfangen und trotzdem
//        nicht senden. Der Dialog muss beides getrennt sagen, und es muss einen
//        Weg geben, den Versand nachzureichen, ohne das ganze Postfach neu zu
//        verbinden (mode="smtp", technisch derselbe action=connect).
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImapConnectDialog } from "./ImapMailboxConnectCard";
// 🔴 Bewusst der ECHTE Transport aus Connect.tsx, kein Nachbau. Ein Nachbau
// haette bewiesen, dass der Dialog durchreicht, was man ihm gibt - nicht, dass
// die Onboarding-Seite den Token in den Rumpf legt. Genau das ist aber die
// Hard Line, um die es geht.
import { makeOnboardingImapTransport } from "@/pages/Connect";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const IONOS_CONFIG = {
  provider_hint: "ionos",
  provider_label: "IONOS",
  imap_host: "imap.ionos.de",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "smtp.ionos.de",
  smtp_port: 465,
  smtp_secure: true,
  username_rule: "email",
  app_password: true,
  notes_de: ["Sendelimit: 50 Mails pro Stunde in den ersten 7 Tagen."],
  source: "builtin",
};

const ONB_TOKEN = "onb-token-abc123";
const PW = "IONOS!geheim#2026";

/** Alle Aufrufe, die der Dialog ueber den hereingereichten Transport macht. */
let sent: Array<Record<string, unknown>> = [];
/** Alle URLs, die im Test wirklich angefasst wurden (fuer den Query-String-Beweis). */
let urls: string[] = [];

/**
 * Der ECHTE Transport aus Connect.tsx, nur mit gemocktem fetch. `sent` und
 * `urls` fuellen sich damit aus dem, was die Seite wirklich rausschickt.
 */
function onboardingTransport(
  responder: (body: Record<string, unknown>) => { status: number; data: Record<string, unknown> },
) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    urls.push(String(url));
    sent.push(body);
    const { status, data } = responder(body);
    return { status, ok: status >= 200 && status < 300, json: async () => data } as Response;
  }) as unknown as typeof fetch;
  return makeOnboardingImapTransport(ONB_TOKEN);
}

const renderDialog = (props: Record<string, unknown> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ImapConnectDialog open onOpenChange={() => {}} {...props} />
    </QueryClientProvider>,
  );

async function goToForm(email = "chef@meine-firma.de") {
  fireEvent.click(screen.getByText("IONOS"));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  const addr = await screen.findByLabelText("E-Mail-Adresse");
  fireEvent.change(addr, { target: { value: email } });
  fireEvent.blur(addr);
  return addr;
}

beforeEach(() => {
  sent = [];
  urls = [];
  // Wachhund: solange kein Test seinen Transport gesetzt hat, darf niemand
  // fetchen. Der Dialog darf im Onboarding NICHT still auf den
  // Dashboard-Endpunkt zurueckfallen.
  global.fetch = vi.fn(async () => {
    throw new Error("fetch ohne gesetzten Onboarding-Transport");
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("D4.1 - IMAP im Onboarding (pre-login)", () => {
  it("nutzt den hereingereichten Transport statt des Dashboard-Endpunkts", async () => {
    renderDialog({
      transport: onboardingTransport((b) =>
        b.action === "autoconfig"
          ? { status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG } }
          : { status: 200, data: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
      ),
      invalidateMe: false,
    });
    await goToForm();
    expect(await screen.findByText(/Erkannt: IONOS/)).toBeInTheDocument();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes("/v1/onboarding/connect/imap"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1/dashboard/"))).toBe(false);
  });

  it("🔴 schickt Token UND Passwort im Rumpf, nie in einem Query-String", async () => {
    renderDialog({
      transport: onboardingTransport((b) =>
        b.action === "autoconfig"
          ? { status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG } }
          : { status: 200, data: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
      ),
      invalidateMe: false,
    });
    await goToForm();
    await screen.findByText(/Erkannt: IONOS/);
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    await screen.findByText("Das Postfach ist verbunden.");

    const connect = sent.find((c) => c.action === "connect");
    expect(connect).toBeTruthy();
    expect(connect!.token).toBe(ONB_TOKEN);
    expect(connect!.password).toBe(PW);
    // Keine einzige angefasste Adresse traegt einen Query-String, also koennen
    // Token und Passwort dort auch nicht gemeinsam auftauchen.
    expect(urls.every((u) => !u.includes("?"))).toBe(true);
    expect(urls.every((u) => !u.includes(ONB_TOKEN) && !u.includes(PW))).toBe(true);
    // Und die Adresszeile des Browsers bleibt ebenfalls sauber.
    expect(window.location.search).not.toContain(PW);
  });

  it("🔴 traegt in der Autoconfig-Abfrage KEIN Passwort, auch nach einer Korrektur der Adresse", async () => {
    renderDialog({
      transport: onboardingTransport(() => ({
        status: 200,
        data: { ok: true, action: "autoconfig", config: IONOS_CONFIG },
      })),
      invalidateMe: false,
    });
    const addr = await goToForm("chef@meine-firm.de"); // Tippfehler
    await screen.findByText(/Erkannt: IONOS/);
    // Realistischer Weg: erst Passwort tippen, DANN den Tippfehler korrigieren.
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.change(addr, { target: { value: "chef@meine-firma.de" } });
    fireEvent.blur(addr);

    const autoconfigs = sent.filter((c) => c.action === "autoconfig");
    expect(autoconfigs.length).toBeGreaterThanOrEqual(2);
    for (const a of autoconfigs) expect(a.password).toBeUndefined();
  });

  it("meldet einen verbrauchten Onboarding-Link lesbar zurueck", async () => {
    renderDialog({
      transport: onboardingTransport(() => ({ status: 410, data: { ok: false, status: "used" } })),
      invalidateMe: false,
    });
    await goToForm();
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    expect(await screen.findByText(/fehlgeschlagen|später/i)).toBeInTheDocument();
    expect(screen.queryByText("Das Postfach ist verbunden.")).not.toBeInTheDocument();
  });
});

describe("D5 - Versand-Zustand im Dialog", () => {
  it("sagt nach dem Verbinden, dass der Versand eingerichtet ist", async () => {
    renderDialog({
      transport: onboardingTransport((b) =>
        b.action === "autoconfig"
          ? { status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG } }
          : { status: 200, data: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
      ),
      invalidateMe: false,
    });
    await goToForm();
    await screen.findByText(/Erkannt: IONOS/);
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));

    expect(await screen.findByText(/Versand ist eingerichtet/)).toBeInTheDocument();
    expect(screen.getByText(/Gesendet-Ordner/)).toBeInTheDocument();
    // Und der Gegensatz steht NICHT da.
    expect(screen.queryByText(/Der Versand ist noch offen/)).not.toBeInTheDocument();
  });

  it("🔴 sagt bei fehlgeschlagenem SMTP, dass man es ohne Neuverbinden nachholen kann", async () => {
    const smtpMsg = "Anmeldung am SMTP (Versand)-Server abgelehnt: Benutzername oder Passwort stimmen nicht.";
    renderDialog({
      transport: onboardingTransport((b) =>
        b.action === "autoconfig"
          ? { status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG } }
          : {
              status: 200,
              data: {
                ok: true, action: "connect", saved: true,
                imap: { ok: true },
                smtp: { ok: false, error_code: "auth_failed", message_de: smtpMsg },
              },
            },
      ),
      invalidateMe: false,
    });
    await goToForm();
    await screen.findByText(/Erkannt: IONOS/);
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));

    expect(await screen.findByText(/ohne das Postfach neu zu verbinden/)).toBeInTheDocument();
    // Backend-Text woertlich durchgereicht, nicht neu getextet.
    expect(screen.getByText(smtpMsg)).toBeInTheDocument();
    expect(screen.queryByText(/Versand ist eingerichtet/)).not.toBeInTheDocument();
  });

  it("mode=smtp startet direkt beim Formular mit offenen Serverdaten", async () => {
    renderDialog({
      mode: "smtp",
      initialEmail: "chef@meine-firma.de",
      transport: onboardingTransport(() => ({
        status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG },
      })),
      invalidateMe: false,
    });
    expect(await screen.findByText("Versand einrichten")).toBeInTheDocument();
    expect(screen.getByText(/Ihr Postfach bleibt verbunden/)).toBeInTheDocument();
    // Die Serverfelder stehen offen: meistens ist genau der SMTP-Server schuld.
    expect(screen.getByText("Postausgang (SMTP)")).toBeInTheDocument();
    // Der Anbieter-Schritt wird uebersprungen.
    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
  });

  it("mode=smtp meldet den Erfolg als Versand, nicht als neues Postfach", async () => {
    renderDialog({
      mode: "smtp",
      initialEmail: "chef@meine-firma.de",
      transport: onboardingTransport((b) =>
        b.action === "autoconfig"
          ? { status: 200, data: { ok: true, action: "autoconfig", config: IONOS_CONFIG } }
          : { status: 200, data: { ok: true, action: "connect", saved: true, imap: { ok: true }, smtp: { ok: true } } },
      ),
      invalidateMe: false,
    });
    await screen.findByText("Versand einrichten");
    fireEvent.change(screen.getByLabelText("Passwort des Postfachs"), { target: { value: PW } });
    fireEvent.click(screen.getByRole("button", { name: /Verbinden/ }));
    expect(await screen.findByText("Der Versand ist eingerichtet.")).toBeInTheDocument();
    expect(screen.queryByText("Das Postfach ist verbunden.")).not.toBeInTheDocument();
  });
});
