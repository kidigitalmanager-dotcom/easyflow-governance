import { describe, expect, it } from "vitest";
import {
  ADDONS, PLANS, allConsoleItems, addonDeepLink, discoverForArea, gate, isBooked, priceLabel,
  type ConsoleItem,
} from "./consoleCatalog";
import type { BillingEntitlements } from "./api-client";

/**
 * Preis- und Schluessel-Test fuer den Console-Katalog.
 *
 * Zweck: die Zahlen und lookup_keys sind gegen die LIVE-Stripe-Preise und gegen
 * billing_catalog.js verifiziert (05.08.2026). Dieser Test pinnt sie ABSICHTLICH,
 * damit eine Preisaenderung nicht still durchrutscht: wer einen Preis aendert,
 * muss ihn hier zweimal anfassen und merkt dabei, dass Server, Website und
 * Console mitgezogen werden muessen.
 */

const ERWARTETE_PREISE: Record<string, number> = {
  ue2_email_starter_monthly: 49,
  ue2_email_pro_monthly: 99,
  ue2_extra_mailbox_monthly: 35,
  ue2_volume_pack_monthly: 99,
  ue2_autopilot_monthly: 99,
  ue2_erp_sync_monthly: 79,
  ue2_branch_pack_monthly: 29,
  ue2_copilot_seat_monthly: 39,
  ue2_voice_jana_monthly: 199,
  ue2_phone_local_monthly: 2.99,
  ue2_phone_mobile_monthly: 30,
  ue2_webchat_monthly: 49,
  ue2_accounting_monthly: 34,
  ue2_accounting_time_monthly: 5,
  ue2_accounting_docpack_monthly: 19,
  ue2_compliance_radar_monthly: 49,
};

const LEER: BillingEntitlements = {
  base_plan: null,
  base_mailboxes: 0, mail_quota: 0, extra_mailboxes: 0, copilot_seats: 0,
  volume_packs: 0, autopilot_mailboxes: 0, erp_data_sources: 0, branch_packs: 0,
  phone_local: 0, phone_mobile: 0, voice_enabled: false,
};
const mit = (p: Partial<BillingEntitlements>): BillingEntitlements => ({ ...LEER, ...p });
/** Full-Stack, wie billing_catalog.js PLAN_ENTITLEMENTS.fullstack es setzt. */
const FULLSTACK = mit({
  base_plan: "fullstack", base_mailboxes: 1, mail_quota: 3000,
  erp_data_sources: 1, autopilot_mailboxes: 1, branch_packs: 1,
  voice_enabled: true, phone_mobile: 1, copilot_seats: 3,
  compliance_radar: true, accounting_enabled: true, time_tracking_enabled: true,
  doc_quota: 400, webchat_enabled: true,
});

describe("consoleCatalog: Preise (gegen LIVE-Stripe verifiziert 05.08.2026)", () => {
  it("jede Position hat genau den erwarteten Netto-Monatspreis", () => {
    for (const it of allConsoleItems()) {
      expect(ERWARTETE_PREISE[it.key], `unbekannter lookup_key im Katalog: ${it.key}`).toBeDefined();
      expect(it.price_eur, `Preis von ${it.key} weicht ab`).toBe(ERWARTETE_PREISE[it.key]);
    }
  });

  it("der Katalog enthaelt genau die erwarteten Positionen, keine mehr und keine weniger", () => {
    expect(allConsoleItems().map((i) => i.key).sort()).toEqual(Object.keys(ERWARTETE_PREISE).sort());
  });

  it("🔴 jeder Schluessel traegt das _monthly-Suffix (sonst 404 price_not_found bei Stripe)", () => {
    // billing_console.js validiert normalisiert, fragt Stripe aber mit rawKey.
    // Blanke Schluessel wie "ue2_accounting" existieren in Stripe NICHT.
    for (const it of allConsoleItems()) expect(it.key.endsWith("_monthly")).toBe(true);
  });

  it("keine doppelten Schluessel", () => {
    const keys = allConsoleItems().map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("consoleCatalog: priceLabel", () => {
  it("ganze Betraege ohne Nachkomma", () => expect(priceLabel(34)).toBe("34 €"));
  it("Cent-Betraege mit Komma, nicht mit Punkt", () => expect(priceLabel(2.99)).toBe("2,99 €"));
  it("Tausendertrennung deutsch", () => expect(priceLabel(1234)).toBe("1.234 €"));
});

describe("consoleCatalog: gate spiegelt canPurchase() aus billing_catalog.js", () => {
  const byKey = (k: string) => allConsoleItems().find((i) => i.key === k)!;

  it("Basis-Plan ist immer waehlbar", () => {
    expect(gate(byKey("ue2_email_starter_monthly"), LEER).ok).toBe(true);
  });
  it("standalone: Voice, Co-Pilot, Compliance-Radar, Website-Chat brauchen keinen Plan", () => {
    for (const k of ["ue2_voice_jana_monthly", "ue2_copilot_seat_monthly", "ue2_compliance_radar_monthly", "ue2_webchat_monthly"]) {
      expect(gate(byKey(k), LEER).ok, k).toBe(true);
    }
  });
  it("Rufnummern brauchen Voice", () => {
    expect(gate(byKey("ue2_phone_local_monthly"), LEER)).toEqual({ ok: false, hint: "Benötigt Voice „Jana“" });
    expect(gate(byKey("ue2_phone_local_monthly"), mit({ voice_enabled: true })).ok).toBe(true);
  });
  it("Autopilot und Buchhaltung brauchen einen Basis-Plan", () => {
    expect(gate(byKey("ue2_autopilot_monthly"), LEER).hint).toBe("Benötigt einen E-Mail-Plan");
    expect(gate(byKey("ue2_accounting_monthly"), LEER).hint).toBe("Benötigt einen E-Mail-Plan");
    expect(gate(byKey("ue2_accounting_monthly"), mit({ base_plan: "starter" })).ok).toBe(true);
  });
  it("🔴 Zeiterfassung: OHNE Plan meldet sie den Plan, nicht die Buchhaltung (Server prueft in dieser Reihenfolge)", () => {
    expect(gate(byKey("ue2_accounting_time_monthly"), LEER).hint).toBe("Benötigt einen E-Mail-Plan");
    expect(gate(byKey("ue2_accounting_time_monthly"), mit({ base_plan: "starter" })).hint).toBe("Benötigt Buchhaltung");
    expect(gate(byKey("ue2_accounting_time_monthly"), mit({ base_plan: "starter", accounting_enabled: true })).ok).toBe(true);
  });
  it("Beleg-Paket verhaelt sich wie die Zeiterfassung", () => {
    expect(gate(byKey("ue2_accounting_docpack_monthly"), mit({ base_plan: "pro" })).hint).toBe("Benötigt Buchhaltung");
  });
});

describe("consoleCatalog: isBooked", () => {
  const byKey = (k: string) => allConsoleItems().find((i) => i.key === k)!;

  it("Flag-Leistungen: nur echtes true zaehlt", () => {
    expect(isBooked(byKey("ue2_voice_jana_monthly"), LEER)).toBe(false);
    expect(isBooked(byKey("ue2_voice_jana_monthly"), mit({ voice_enabled: true }))).toBe(true);
  });
  it("Mengen-Leistungen: ab 1 gilt als vorhanden", () => {
    expect(isBooked(byKey("ue2_autopilot_monthly"), mit({ autopilot_mailboxes: 0 }))).toBe(false);
    expect(isBooked(byKey("ue2_autopilot_monthly"), mit({ autopilot_mailboxes: 1 }))).toBe(true);
  });
  it("ohne Entitlements gilt nichts als gebucht (kein falsches Grau)", () => {
    expect(isBooked(byKey("ue2_voice_jana_monthly"), null)).toBe(false);
  });
});

describe("consoleCatalog: discoverForArea (die Entdecken-Gruppe)", () => {
  it("Neukunde mit E-Mail Starter sieht in jedem Bereich nur, was ihm fehlt", () => {
    const e = mit({ base_plan: "starter", base_mailboxes: 1, mail_quota: 1000 });
    expect(discoverForArea("arbeit", e).map((i) => i.key)).toEqual([
      "ue2_autopilot_monthly", "ue2_voice_jana_monthly", "ue2_webchat_monthly",
    ]);
    expect(discoverForArea("geld", e).map((i) => i.key)).toEqual([
      "ue2_erp_sync_monthly", "ue2_accounting_monthly",
    ]);
    expect(discoverForArea("mitarbeiter", e).map((i) => i.key)).toEqual([
      "ue2_copilot_seat_monthly", "ue2_accounting_time_monthly",
    ]);
    expect(discoverForArea("signale", e).map((i) => i.key)).toEqual(["ue2_compliance_radar_monthly"]);
  });

  it("🔴 Full-Stack sieht NICHTS — dort ist nichts zu verkaufen", () => {
    for (const a of ["arbeit", "geld", "mitarbeiter", "signale"]) {
      expect(discoverForArea(a, FULLSTACK), a).toEqual([]);
    }
  });

  it("waehrend die Entitlements laden wird nichts gerendert (kein Flackern)", () => {
    for (const a of ["arbeit", "geld", "mitarbeiter", "signale"]) {
      expect(discoverForArea(a, undefined), a).toEqual([]);
    }
  });

  it("gebucht = weg: mit Voice verschwindet Voice aus „Arbeit“", () => {
    const e = mit({ base_plan: "starter", voice_enabled: true });
    expect(discoverForArea("arbeit", e).map((i) => i.key)).not.toContain("ue2_voice_jana_monthly");
  });

  it("System hat keine Entdecken-Eintraege (dort wohnt der Abo-Tab selbst)", () => {
    expect(discoverForArea("system", mit({ base_plan: "starter" }))).toEqual([]);
  });

  it("kein Bereich zeigt mehr als drei Zeilen (Dezenz-Grenze)", () => {
    // Schlimmster Fall: Kunde ohne jedes Entitlement, also alles noch zu haben.
    for (const a of ["arbeit", "geld", "mitarbeiter", "signale"]) {
      expect(discoverForArea(a, LEER).length, a).toBeLessThanOrEqual(3);
    }
  });

  it("jeder Entdecken-Eintrag hat Nutzen-Text, Symbol und Bundle-Angabe", () => {
    const inArea = ADDONS.filter((i) => i.area);
    expect(inArea.length).toBe(8);
    for (const it of inArea) {
      expect(it.benefit, `${it.key} ohne benefit`).toBeTruthy();
      expect(it.icon, `${it.key} ohne icon`).toBeTruthy();
      expect(it.in_bundles?.length, `${it.key} ohne in_bundles`).toBeGreaterThan(0);
      expect(it.ent_field, `${it.key} ohne ent_field`).toBeTruthy();
    }
  });

  it("Mengen-Zusaetze ohne eigene Faehigkeit erscheinen NICHT in Entdecken", () => {
    // Zusatz-Postfach, Volumen-Paket, Branchen-Pack, Rufnummern, Beleg-Paket:
    // im Abo-Tab kaufbar, aber kein Entdecken-Eintrag — das waere Badge-Spam.
    const ohneArea = ADDONS.filter((i) => !i.area).map((i) => i.key);
    expect(ohneArea.sort()).toEqual([
      "ue2_accounting_docpack_monthly", "ue2_branch_pack_monthly", "ue2_extra_mailbox_monthly",
      "ue2_phone_local_monthly", "ue2_phone_mobile_monthly", "ue2_volume_pack_monthly",
    ].sort());
  });
});

describe("consoleCatalog: Deep-Link", () => {
  it("zeigt auf den Abo-Tab und traegt den lookup_key als addon-Parameter", () => {
    const it = ADDONS.find((i) => i.key === "ue2_accounting_monthly")!;
    expect(addonDeepLink(it)).toBe("/einstellungen?tab=billing&addon=ue2_accounting_monthly");
  });
});

describe("consoleCatalog: Konsistenz mit dem M1-Vorschlagsmotor (src/lib/upsell.ts)", () => {
  /**
   * upsell.ts traegt seine Preise als fertige Anzeige-Strings ("29 EUR / Monat")
   * und bleibt bewusst eine reine, netzfreie Regel — es soll NICHT den Katalog
   * mit den lucide-Symbolen importieren. Also wird die Konsistenz hier auf
   * Test-Ebene erzwungen: wer einen Preis im Katalog aendert und upsell.ts
   * vergisst, faellt hier durch statt dem Kunden zwei Zahlen zu zeigen.
   */
  it("die Vorschlags-Karten nennen dieselben Preise wie der Katalog", async () => {
    const { evaluateUpsell, DRAFTS_WEEK_MIN } = await import("./upsell");
    const faelle = [
      evaluateUpsell({ hasTenant: true, complianceItems: [{ subtype: "legal_signal", severity: "red", count: 1 }], draftsCreatedWeek: 0, dismissed: [] }),
      evaluateUpsell({ hasTenant: true, complianceItems: [], draftsCreatedWeek: DRAFTS_WEEK_MIN, dismissed: [] }),
    ].filter((s): s is NonNullable<typeof s> => s !== null);

    expect(faelle.length).toBe(2);
    for (const s of faelle) {
      const it = allConsoleItems().find((i) => i.key === s.addonLookupKey);
      expect(it, `upsell.ts schlaegt ${s.addonLookupKey} vor, den der Katalog nicht kennt`).toBeDefined();
      // Zahl aus "29 EUR / Monat" ziehen und gegen den Katalog halten.
      const zahl = Number(String(s.priceLabel).match(/[\d.,]+/)?.[0]?.replace(/\./g, "").replace(",", "."));
      expect(zahl, `Preis von ${s.addonLookupKey} weicht ab: upsell.ts sagt „${s.priceLabel}“`).toBe(it!.price_eur);
      expect(s.addonLabel).toBe(it!.label);
    }
  });
});

describe("consoleCatalog: kundensichtbare Texte", () => {
  const felder = (it: ConsoleItem) => [it.label, it.desc, it.benefit ?? "", it.unit, ...(it.in_bundles ?? [])];

  it("echte Umlaute, keine ue/ae/oe/ss-Umschrift", () => {
    // Gesucht wird die Umschrift in den Wortstaemmen, die im Deutschen fast immer
    // einen Umlaut tragen. Case-insensitiv, damit „Uebersicht“ und „Loest“ am
    // Wortanfang nicht durchrutschen. Unschaedliche Buchstabenfolgen wie in
    // „neue“, „Paket“ oder „Adresse“ bleiben damit erlaubt.
    const UMSCHRIFT = /(uebe|ueber|uebri|aender|aehnl|oeffn|muess|koenn|fuer|waehl|waehr|groess|hoeh|naech|spaet|zusaetz|benoetig|moegl|laeuf|traeg|haelt|faell|verfueg|zurueck|gespraech|entwuerf|schluess|dsgvo-fruehwarn|fruehwarn)/i;
    for (const it of allConsoleItems()) {
      for (const t of felder(it)) {
        const treffer = t.match(UMSCHRIFT);
        expect(treffer, `${it.key}: ASCII-Umschrift „${treffer?.[0]}“ in „${t}“`).toBeNull();
      }
    }
  });

  it("keine Em-Dashes und keine En-Dashes in kundensichtbaren Texten", () => {
    for (const it of allConsoleItems()) {
      for (const t of felder(it)) {
        expect(t.includes("—"), `${it.key}: Em-Dash in „${t}“`).toBe(false);
        expect(t.includes("–"), `${it.key}: En-Dash in „${t}“`).toBe(false);
      }
    }
  });

  it("deutsche Anfuehrungszeichen, keine ASCII-Quotes", () => {
    for (const it of allConsoleItems()) {
      for (const t of felder(it)) expect(t.includes('"'), `${it.key}: ASCII-Quote in „${t}“`).toBe(false);
    }
  });
});
