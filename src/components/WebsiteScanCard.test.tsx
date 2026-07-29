// ---------------------------------------------------------------------------
// Die Karte „Ihre Website“ im gescheiterten Zustand.
//
// Die Logik selbst steht in src/lib/website-scan-failure.ts und ist dort
// einzeln geprueft. Hier geht es nur um die Verdrahtung, denn genau daran ist
// es bis v4.168.0 gescheitert: das Backend lieferte den `retry`-Block seit
// v4.167.0, im veroeffentlichten Bundle kam `not_before` NULL mal vor. Eine
// perfekte Funktion, die niemand aufruft, ist fuer den Kunden nichts wert.
//
// Geprueft wird deshalb das, was der Kunde sieht:
//   1. Laeuft ein zweiter Anlauf, steht der Zeitpunkt da und KEIN Knopf.
//   2. Ist Schluss, steht der zur Ursache passende Grund da und der Knopf.
//   3. Die Erklaerung „baut den Inhalt erst im Browser auf“ erscheint nur
//      dort, wo sie stimmt.
//   4. Das Banner auf der Uebersicht schweigt, solange wir selbst noch
//      arbeiten.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const setupData: { value: unknown } = { value: null };

vi.mock("@/hooks/use-api", () => ({
  useTenantSetupSelf: () => ({ data: setupData.value, isLoading: false, isError: false }),
  useSaveTenantSetupSelf: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

import WebsiteScanCard from "./WebsiteScanCard";

type Retry = {
  cause: string | null; attempt: number; planned: boolean;
  not_before: string | null; final: boolean;
};

function scan(over: { retry?: Retry | null; error?: string | null; cause?: string | null }) {
  setupData.value = {
    website_scan: {
      website_url: "https://beispiel.de",
      available: true,
      state: "failed",
      last_crawl: {
        upload_id: "u1", url: "https://beispiel.de", status: "failed", chunks: 0,
        error: over.error ?? "No content extracted from URL", at: "2026-07-29T06:00:00Z",
        cause: over.cause ?? null, attempt: 1,
      },
      retry: over.retry ?? null,
      facts: { proposed: 0, confirmed: 0, rejected: 0 },
      categories_covered: [],
      categories_missing: [],
      scanned_at: null,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-29T06:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("zweiter Anlauf laeuft", () => {
  beforeEach(() => {
    scan({
      retry: { cause: "http_5xx", attempt: 1, planned: true, not_before: "2026-07-29T12:00:00Z", final: false },
    });
  });

  it("sagt dem Kunden, wann wir es erneut versuchen", () => {
    render(<WebsiteScanCard />);
    expect(screen.getByText(/gegen 14:00 Uhr/)).toBeTruthy();
    expect(screen.getByText(/Sie müssen nichts tun/)).toBeTruthy();
  });

  it("fordert ihn nicht auf, seine Adresse zu pruefen", () => {
    render(<WebsiteScanCard />);
    expect(screen.queryByRole("button", { name: /Andere Adresse eintragen/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/prüfen Sie die Adresse/i);
  });

  it("das Banner auf der Uebersicht schweigt, solange wir arbeiten", () => {
    const { container } = render(<WebsiteScanCard variant="banner" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("endgueltig gescheitert", () => {
  it("bot_wall: nennt den echten Grund, nicht die Browser-Erklaerung", () => {
    scan({ retry: { cause: "bot_wall", attempt: 1, planned: false, not_before: null, final: true } });
    render(<WebsiteScanCard />);
    expect(screen.getByText(/blockt automatische Zugriffe/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/erst im Browser aufbauen/);
    expect(screen.getByRole("button", { name: /Andere Adresse eintragen/ })).toBeTruthy();
  });

  it("dead_dns: sagt, dass es die Adresse nicht mehr gibt", () => {
    scan({ retry: { cause: "dead_dns", attempt: 2, planned: false, not_before: null, final: true } });
    render(<WebsiteScanCard />);
    expect(screen.getByText(/gibt es nicht mehr/)).toBeTruthy();
  });

  it("no_content: hier und nur hier die Browser-Erklaerung", () => {
    scan({ retry: { cause: "no_content", attempt: 1, planned: false, not_before: null, final: true } });
    render(<WebsiteScanCard />);
    expect(screen.getByText(/erst im Browser aufbauen/)).toBeTruthy();
  });

  it("Altzeile ohne Marke: Disallow bleibt Disallow", () => {
    scan({ retry: null, error: "robots.txt disallows crawling" });
    render(<WebsiteScanCard />);
    expect(screen.getByText(/erlaubt kein automatisches Lesen/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/erst im Browser aufbauen/);
  });

  it("Altzeile ohne Marke und ohne Aussage: kein erfundener Grund", () => {
    scan({ retry: null, error: "No content extracted from URL" });
    render(<WebsiteScanCard />);
    expect(screen.getByText(/kein lesbarer Text zu finden/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/erst im Browser aufbauen/);
  });

  it("das Banner meldet sich, wenn der Kunde wirklich dran ist", () => {
    scan({ retry: { cause: "dead_dns", attempt: 2, planned: false, not_before: null, final: true } });
    const { container } = render(<WebsiteScanCard variant="banner" />);
    expect(container.innerHTML).not.toBe("");
    expect(screen.getByText(/gibt es nicht mehr/)).toBeTruthy();
  });
});
