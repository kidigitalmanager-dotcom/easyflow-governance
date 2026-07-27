import { describe, it, expect } from "vitest";
import { isMoneyItem, isDeadlineItem, deadlineSenderSet } from "./review-facets";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-27T10:00:00Z");

describe("isMoneyItem", () => {
  it("erkennt Geld-Intents aus action_type", () => {
    expect(isMoneyItem({ action_type: "invoice_query" })).toBe(true);
    expect(isMoneyItem({ action_type: "offer_request" })).toBe(true);
    expect(isMoneyItem({ action_type: "E_dunning_reminder" })).toBe(true);
  });

  it("erkennt Geld auch am gesetzten Core-Key", () => {
    expect(isMoneyItem({ action_type: "other", applied_core_key: "RE_rechnung" })).toBe(true);
  });

  it("laesst Nicht-Geld in Ruhe", () => {
    expect(isMoneyItem({ action_type: "appointment" })).toBe(false);
    expect(isMoneyItem({ action_type: "support_request" })).toBe(false);
    expect(isMoneyItem({})).toBe(false);
  });
});

describe("deadlineSenderSet", () => {
  const entities = [
    { entity_email: "A.Weber@Bau.de", next_deadline_at: new Date(NOW + 2 * DAY).toISOString() },
    { entity_email: "spaet@bau.de", next_deadline_at: new Date(NOW + 40 * DAY).toISOString() },
    { entity_email: "ueberfaellig@bau.de", next_deadline_at: new Date(NOW - 5 * DAY).toISOString() },
    { entity_email: null, next_deadline_at: new Date(NOW + 1 * DAY).toISOString() },
    { entity_email: "ohne@bau.de", next_deadline_at: null },
    { entity_email: "kaputt@bau.de", next_deadline_at: "nicht-datum" },
  ];

  it("nimmt nur Fristen im Horizont — und normalisiert auf Kleinschreibung", () => {
    const s = deadlineSenderSet(entities, 14, NOW);
    expect(s.has("a.weber@bau.de")).toBe(true);
    expect(s.has("ueberfaellig@bau.de")).toBe(true);
    expect(s.has("spaet@bau.de")).toBe(false);
    expect(s.has("ohne@bau.de")).toBe(false);
    expect(s.has("kaputt@bau.de")).toBe(false);
    expect(s.size).toBe(2);
  });

  it("kommt mit fehlenden Daten klar", () => {
    expect(deadlineSenderSet(undefined, 14, NOW).size).toBe(0);
    expect(deadlineSenderSet([], 14, NOW).size).toBe(0);
  });
});

describe("isDeadlineItem", () => {
  const senders = deadlineSenderSet(
    [{ entity_email: "a.weber@bau.de", next_deadline_at: new Date(NOW + 2 * DAY).toISOString() }],
    14,
    NOW,
  );

  it("trifft die blanke Adresse", () => {
    expect(isDeadlineItem({ sender: "A.Weber@bau.de" }, senders)).toBe(true);
  });

  it("trifft auch die Form \"Name <mail>\"", () => {
    expect(isDeadlineItem({ sender: "Anna Weber <a.weber@bau.de>" }, senders)).toBe(true);
  });

  it("ist ohne Treffer false", () => {
    expect(isDeadlineItem({ sender: "fremd@bau.de" }, senders)).toBe(false);
    expect(isDeadlineItem({}, senders)).toBe(false);
    expect(isDeadlineItem({ sender: "a.weber@bau.de" }, new Set())).toBe(false);
  });
});
