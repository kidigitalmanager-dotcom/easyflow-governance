// ---------------------------------------------------------------------------
// apiFetch: der Antwort-Rumpf eines Fehlers darf nicht verloren gehen.
//
// Warum diese Datei getrennt existiert: die erste Fassung der Gegenprobe zu
// Befund 1 hat `new ApiError(404, ..., rumpf)` im Test SELBST gebaut und dann
// geprueft, dass der Rumpf drin steht. Das ist zirkulaer — die Mutation, die
// das dritte Argument in apiFetch wieder entfernt, blieb gruen (M7). Ein Test,
// der nur sein eigenes Konstrukt prueft, beweist ueber den Produktivpfad
// nichts.
//
// Deshalb geht dieser Test durch die ECHTE Kette: fetchAutonomyPolicy ->
// apiFetch -> fetch. Nur `fetch` und die Sitzung sind ersetzt, alles
// dazwischen ist der ausgelieferte Code.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock wird an den Dateianfang gehoben, deshalb darf die Fabrik keine
// Variable von aussen anfassen. Der Zaehler kommt per vi.hoisted.
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "jwt-test" } } }),
      signOut,
    },
  },
}));

import { fetchAutonomyPolicy, ApiError } from "./api-client";

const LEER_RUMPF = {
  ok: false,
  error: "policy_not_found",
  tenant_id: "t-1",
  hard_blocked_intents: ["billing_payment", "contract_legal", "manual_review"],
  known_intents: ["request_order", "support_issue"],
};

function antwort(status: number, body: unknown, jsonKaputt = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (jsonKaputt) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
  } as unknown as Response;
}

/** Ruft den echten Weg auf und gibt den geworfenen Fehler zurueck. */
async function fange(channel: "voice" | "email"): Promise<ApiError> {
  try {
    await fetchAutonomyPolicy(channel);
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("Es wurde kein Fehler geworfen — der Test prueft dann nichts.");
}

beforeEach(() => {
  signOut.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch reicht den Fehler-Rumpf durch", () => {
  it("legt den 404-Rumpf des Backends an den geworfenen Fehler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort(404, LEER_RUMPF)));

    await expect(fetchAutonomyPolicy("voice")).rejects.toThrow(ApiError);
    const fehler = await fange("voice");

    expect(fehler.status).toBe(404);
    expect((fehler.payload as { error: string }).error).toBe("policy_not_found");
    expect((fehler.payload as { tenant_id: string }).tenant_id).toBe("t-1");
    expect((fehler.payload as { hard_blocked_intents: string[] }).hard_blocked_intents)
      .toContain("contract_legal");
  });

  it("haelt die Meldung kundentauglich — kein roher Code im Text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort(404, LEER_RUMPF)));
    const fehler = await fange("voice");
    expect(fehler.message).toBe("API Fehler 404");
    expect(fehler.message).not.toContain("policy_not_found");
  });

  it("kippt nicht, wenn der Fehler gar kein JSON ist", async () => {
    // So sieht eine HTML-Fehlerseite vom Gateway aus. Der Aufruf muss weiterhin
    // einen ApiError werfen und nicht an res.json() zerschellen.
    vi.stubGlobal("fetch", vi.fn(async () => antwort(502, null, true)));
    const fehler = await fange("voice");
    expect(fehler).toBeInstanceOf(ApiError);
    expect(fehler.status).toBe(502);
    expect(fehler.payload).toBeUndefined();
  });

  it("meldet sich bei 401 weiterhin ab", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort(401, { error: "jwt_required" })));
    await fetchAutonomyPolicy("voice").catch(() => undefined);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("gibt bei Erfolg unveraendert den Rumpf zurueck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort(200, { ok: true, policy: { tenant_id: "t-1" } })));
    const res = await fetchAutonomyPolicy("voice");
    expect((res as { ok: boolean }).ok).toBe(true);
  });
});
