// jana-chat/product_knowledge.test.ts — Node-Test, netz- und Deno-frei.
// Lauf: node --experimental-strip-types --test product_knowledge.test.ts
//
// Zweck: die Preise sind gegen die LIVE-Stripe-Preise verifiziert (05.08.2026).
// Dieser Test pinnt sie ABSICHTLICH — wer einen Preis aendert, muss ihn hier
// zweimal anfassen und merkt dabei, dass Server, Website, Konsole und Jana
// zusammen gezogen werden muessen. Preis-Drift war der teuerste Fehler an dieser
// Stelle: die Konsole hat vier Monate lang Produkte verkauft, die Jana nicht
// kannte, und Jana hat einen Full-Stack-Inhalt aufgezaehlt, der falsch war.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  PRODUCT_CATALOG, allItems, allowedEurNumbers, bundleListValue, buildProductPrompt,
  buyDeepLinkFor, catalogKeys, classifyChatIntent, detectBuyIntent, fmtEur,
  matchFeatureSuggestions, normalizeTenantCtx, ownsItem, renderProductContext,
  renderTenantContext, scanUnverifiedPrices, validateProductAnswer, BOOKING_PATH, BUY_DEEPLINK,
  type ProductItem, type TenantCtx,
} from "./product_knowledge.ts";

const byKey = (k: string): ProductItem => {
  const it = allItems().find((i) => i.key === k);
  assert.ok(it, `Katalog kennt [${k}] nicht`);
  return it!;
};

// ── Preis-Pinnung ────────────────────────────────────────────────────────────
const ERWARTET: Record<string, number | null> = {
  starter: 49, pro: 99,
  voice: 199, copilot: 39, erp_sync: 79, autopilot: 99, branchen_pack: 29,
  zusatz_postfach: 35, compliance_radar: 49, volumen_paket: 99,
  webchat: 49, accounting: 34, accounting_time: 5, beleg_paket: 19,
  bundle_hv: 235, bundle_hv_voice: 380, bundle_fullstack: 499, bundle_team: 799,
  nummer_lokal: 2.99, nummer_mobil: 30,
  signale: null, risk_shield: null, chancen: null, jana_konsole: null,
};

describe("Preise (gegen LIVE-Stripe verifiziert 05.08.2026)", () => {
  it("jede Katalog-Position hat genau den erwarteten Preis", () => {
    for (const it of allItems()) {
      assert.ok(it.key in ERWARTET, `unbekannte Position im Katalog: [${it.key}]`);
      assert.equal(it.price_eur, ERWARTET[it.key], `Preis von [${it.key}] weicht ab`);
    }
  });

  it("der Katalog enthaelt genau die erwarteten Positionen", () => {
    assert.deepEqual(allItems().map((i) => i.key).sort(), Object.keys(ERWARTET).sort());
  });

  it("Jahrespreise der Bundles sind Monatspreis mal 12 minus 20 Prozent", () => {
    for (const b of PRODUCT_CATALOG.bundles) {
      if (b.yearly_eur == null || b.price_eur == null) continue;
      const soll = Math.round(b.price_eur * 12 * 0.8 * 100) / 100;
      // bundle_hv/hv_voice tragen historisch gerundete Jahressummen.
      assert.ok(Math.abs(b.yearly_eur - soll) <= 15,
        `[${b.key}] Jahrespreis ${b.yearly_eur} passt nicht zu ${soll}`);
    }
  });

  it("keine doppelten Keys, keine doppelten lookup_keys", () => {
    const keys = allItems().map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length, "doppelter Katalog-Key");
    const lk = allItems().map((i) => i.lookup_key).filter(Boolean);
    assert.equal(new Set(lk).size, lk.length, "doppelter lookup_key");
  });

  it("🔴 jeder lookup_key traegt _monthly (sonst 404 price_not_found bei Stripe)", () => {
    for (const it of allItems()) {
      if (!it.lookup_key) continue;
      assert.ok(it.lookup_key.startsWith("ue2_"), `[${it.key}] lookup_key ohne ue2_-Prefix`);
      assert.ok(it.lookup_key.endsWith("_monthly"), `[${it.key}] lookup_key ohne _monthly-Suffix`);
    }
  });

  it("alles, was Geld kostet, ist zitierbar und hat einen Nutzen-Satz", () => {
    for (const it of allItems()) {
      assert.ok(it.benefit && it.benefit.length > 20, `[${it.key}] ohne brauchbaren benefit`);
    }
    assert.ok(catalogKeys().has("accounting"));
    assert.ok(catalogKeys().has("bundle_team"));
  });
});

// ── Was v23 nicht wusste ─────────────────────────────────────────────────────
describe("die Luecken aus v23 sind geschlossen", () => {
  it("Buchhaltung, Zeiterfassung, Beleg-Paket, Website-Chat und Team sind im Katalog", () => {
    for (const k of ["accounting", "accounting_time", "beleg_paket", "webchat", "bundle_team"]) {
      assert.ok(allItems().some((i) => i.key === k), `[${k}] fehlt`);
    }
  });

  it("🔴 Full-Stack nennt Buchhaltung, Zeiterfassung und Website-Chat (billing_catalog.js PLAN_ENTITLEMENTS.fullstack)", () => {
    const fs = byKey("bundle_fullstack");
    for (const wort of ["Buchhaltung", "Zeiterfassung", "Website-Chat", "Compliance-Radar"]) {
      assert.ok(fs.includes?.includes(wort), `Full-Stack verschweigt ${wort}`);
    }
    for (const k of ["accounting", "accounting_time", "webchat", "compliance_radar"]) {
      assert.ok(fs.includes_keys?.includes(k), `Full-Stack includes_keys ohne ${k}`);
    }
  });

  it("der Kapital-Layer steht als kostenfrei enthalten drin, nicht als Produkt", () => {
    const text = renderProductContext();
    assert.ok(text.includes("OHNE AUFPREIS IN JEDEM PAKET ENTHALTEN"));
    assert.ok(PRODUCT_CATALOG.facts.some((f) => f.includes("Kapital-Layer")));
    for (const k of ["signale", "risk_shield", "chancen", "jana_konsole"]) {
      assert.equal(byKey(k).price_eur, null, `[${k}] darf keinen Preis haben`);
      assert.equal(byKey(k).lookup_key, undefined, `[${k}] darf nicht kaufbar aussehen`);
    }
  });

  it("Buchhaltungs-Fragen landen auf der Produktstrecke, nicht bei den Signalen", () => {
    for (const frage of [
      "Was kostet die Buchhaltung?",
      "Könnt ihr auch Belege lesen?",
      "Habt ihr eine Zeiterfassung mit Lohn-Export?",
      "Gibt es einen Chat für meine Website?",
      "Was ist im Team-Paket drin?",
    ]) {
      assert.equal(classifyChatIntent(frage).product, true, `nicht als Produktfrage erkannt: ${frage}`);
    }
  });

  it("Problemschilderungen schlagen die neuen Produkte vor", () => {
    const s = (m: string) => matchFeatureSuggestions(m).map((i) => i.key);
    assert.ok(s("Ich tippe jede Rechnung selbst in DATEV ein").includes("accounting"));
    assert.ok(s("Meine Leute schreiben Stundenzettel auf Papier").includes("accounting_time"));
    assert.ok(s("Besucher schreiben mir über die Homepage, ein Live-Chat wäre gut").includes("webchat"));
  });
});

// ── Listenwert / Ersparnis ───────────────────────────────────────────────────
describe("Bundle-Listenwerte werden gerechnet, nicht gepflegt", () => {
  it("Full-Stack: 681 Euro Listenwert, 182 Euro Ersparnis (wie useeasy.ai/pricing)", () => {
    const lv = bundleListValue(byKey("bundle_fullstack"));
    assert.equal(lv, 681);
    assert.equal(lv! - 499, 182);
  });

  it("Business-Komplett Team bekommt bewusst KEINEN gerechneten Listenwert", () => {
    // Der Mehrwert sind unbegrenzte Postfaecher und Mengen, kein Produktkorb.
    assert.equal(bundleListValue(byKey("bundle_team")), null);
  });

  it("Listenwert und Ersparnis gelten als belegte Zahlen, nicht als erfunden", () => {
    const erlaubt = allowedEurNumbers();
    assert.ok(erlaubt.has(681), "681 Euro Listenwert wuerde als Halluzination gewertet");
    assert.ok(erlaubt.has(182), "182 Euro Ersparnis wuerde als Halluzination gewertet");
  });

  it("🔴 ein erfundener Preis wird weiterhin erkannt", () => {
    assert.deepEqual(scanUnverifiedPrices("Das kostet 777 Euro im Monat."), [777]);
    assert.deepEqual(scanUnverifiedPrices("Die Buchhaltung kostet 34 Euro."), []);
    assert.deepEqual(scanUnverifiedPrices("Das Team-Paket kostet 799 Euro."), []);
  });

  it("die alten festen Ersparnis-Zahlen sind weg (sie stammten aus einer alten Preisrunde)", () => {
    // 71/123/155 galten vor Buchhaltung und Webchat. Waeren sie noch erlaubt,
    // koennte Jana eine veraltete Ersparnis nennen, ohne dass es auffaellt.
    const erlaubt = allowedEurNumbers();
    assert.ok(!erlaubt.has(71) || bundleListValue(byKey("bundle_hv"))! - 235 === 71);
    assert.ok(!erlaubt.has(123));
  });
});

// ── Buchungsstand ────────────────────────────────────────────────────────────
describe("tenant_context: GEBUCHT / NICHT GEBUCHT", () => {
  const STARTER_NUR = { plan: "starter", active_mailboxes: 1, entitlements: { base_plan: "starter", voice_enabled: false, webchat_enabled: false, accounting_enabled: false, time_tracking_enabled: false, compliance_radar: false, autopilot_mailboxes: 0, erp_data_sources: 0, copilot_seats: 0, branch_packs: 0, extra_mailboxes: 0, volume_packs: 0, phone_local: 0, phone_mobile: 0, doc_packs: 0 } };
  const ALLES = { plan: "fullstack", active_mailboxes: 2, entitlements: { base_plan: "fullstack", voice_enabled: true, webchat_enabled: true, accounting_enabled: true, time_tracking_enabled: true, compliance_radar: true, autopilot_mailboxes: 1, erp_data_sources: 1, copilot_seats: 3, branch_packs: 1, extra_mailboxes: 1, volume_packs: 1, phone_local: 1, phone_mobile: 1, doc_packs: 1 } };

  it("die Flags kommen durch die Normalisierung", () => {
    const tc = normalizeTenantCtx(STARTER_NUR);
    assert.ok(tc?.ent, "entitlements verworfen");
    assert.equal(tc!.ent!.voice_enabled, false);
    assert.equal(tc!.ent!.base_plan, "starter");
  });

  it("fremde Felder werden verworfen und landen NICHT im Prompt", () => {
    const tc = normalizeTenantCtx({ plan: "starter", entitlements: { voice_enabled: true, email: "kunde@example.com", geheim: "x" } });
    assert.equal(tc!.ent!.email, undefined);
    assert.equal(tc!.ent!.geheim, undefined);
    assert.ok(!renderTenantContext(tc).includes("example.com"));
  });

  it("Muell und Fehlwerte kippen nicht um", () => {
    assert.equal(normalizeTenantCtx(null), null);
    assert.equal(normalizeTenantCtx("nope" as unknown), null);
    assert.equal(normalizeTenantCtx({}), null);
    const tc = normalizeTenantCtx({ entitlements: { copilot_seats: "keine Zahl", autopilot_mailboxes: -5 } });
    assert.equal(tc!.ent!.copilot_seats, 0);
    assert.equal(tc!.ent!.autopilot_mailboxes, 0);
  });

  it("Starter: Voice steht unter NICHT GEBUCHT, nichts unter GEBUCHT", () => {
    const t = renderTenantContext(normalizeTenantCtx(STARTER_NUR));
    assert.ok(t.includes("NICHT GEBUCHT"));
    assert.ok(t.includes("[voice]"));
    assert.ok(!t.includes("GEBUCHT (hat der Kunde bereits"));
  });

  it("🔴 Full-Stack: alles gebucht, also NICHTS vorzuschlagen", () => {
    const t = renderTenantContext(normalizeTenantCtx(ALLES));
    assert.ok(t.includes("GEBUCHT (hat der Kunde bereits"));
    assert.ok(!t.includes("NICHT GEBUCHT"));
    assert.ok(t.includes("Es gibt nichts vorzuschlagen"));
  });

  it("ohne Buchungsstand bleibt es beim alten Verhalten (kein Block, keine Behauptung)", () => {
    const t = renderTenantContext(normalizeTenantCtx({ plan: "starter", active_mailboxes: 1 }));
    assert.ok(t.includes("aktueller Plan: starter"));
    assert.ok(!t.includes("GEBUCHT"));
  });

  it("ownsItem: unbekannt bleibt unbekannt und wird nicht zu „hat nicht“", () => {
    assert.equal(ownsItem(byKey("voice"), null), null);
    assert.equal(ownsItem(byKey("voice"), { plan: "starter" } as TenantCtx), null);
    assert.equal(ownsItem(byKey("voice"), normalizeTenantCtx(ALLES)), true);
    assert.equal(ownsItem(byKey("voice"), normalizeTenantCtx(STARTER_NUR)), false);
  });

  it("der Prompt traegt den Buchungsstand und die Regel dazu", () => {
    const p = buildProductPrompt("Was würde mir noch helfen?", { tenantCtx: normalizeTenantCtx(STARTER_NUR) });
    assert.ok(p.includes("NICHT GEBUCHT"));
    assert.ok(p.includes("Vorschlagen darfst du ausschliesslich Positionen aus NICHT GEBUCHT"));
    assert.ok(p.includes("Schreibe echte Umlaute"));
  });
});

// ── Deep-Link ────────────────────────────────────────────────────────────────
describe("deep_link", () => {
  it("genau ein Produkt: Link zeigt auf dessen Kachel", () => {
    assert.deepEqual(buyDeepLinkFor([byKey("accounting")]), {
      label: "Buchhaltung ansehen",
      path: "/einstellungen?tab=billing&addon=ue2_accounting_monthly",
    });
  });
  it("mehrere oder keine Produkte: allgemeiner Link, nichts geraten", () => {
    assert.deepEqual(buyDeepLinkFor([]), BUY_DEEPLINK);
    assert.deepEqual(buyDeepLinkFor([byKey("accounting"), byKey("voice")]), BUY_DEEPLINK);
    assert.equal(BUY_DEEPLINK.path, BOOKING_PATH);
  });
  it("Positionen ohne lookup_key erzeugen keinen Kachel-Link", () => {
    assert.deepEqual(buyDeepLinkFor([byKey("signale")]), BUY_DEEPLINK);
  });
  it("Kaufabsicht wird weiterhin erkannt", () => {
    assert.equal(detectBuyIntent("Ich will die Buchhaltung dazubuchen"), true);
    assert.equal(detectBuyIntent("Was kostet die Buchhaltung?"), false);
  });
});

// ── unveraendertes Verhalten ─────────────────────────────────────────────────
describe("was gleich bleiben muss", () => {
  it("die Zitat-Pruefung verwirft unbekannte Keys weiterhin", () => {
    const v = validateProductAnswer(JSON.stringify({
      answer: "Die Buchhaltung kostet 34 Euro.",
      citations: [{ type: "product", key: "accounting" }, { type: "product", key: "gibt_es_nicht" }],
      used_data: true, confidence: 0.9,
    }));
    assert.equal(v.citations.length, 1);
    assert.equal(v.citations[0].key, "accounting");
    assert.equal(v.citations[0].price_eur, 34);
    assert.equal(v.dropped_citations, 1);
    assert.deepEqual(v.unverified_prices, []);
  });

  it("ein erfundener Preis kappt die Konfidenz", () => {
    const v = validateProductAnswer(JSON.stringify({
      answer: "Kostet 777 Euro.", citations: [], used_data: true, confidence: 0.95,
    }));
    assert.deepEqual(v.unverified_prices, [777]);
    assert.ok(v.confidence! <= 0.4);
  });

  it("fmtEur bleibt deutsch", () => {
    assert.equal(fmtEur(34), "34 Euro");
    assert.equal(fmtEur(2.99), "2,99 Euro");
    assert.equal(fmtEur(7670.40), "7.670,40 Euro");
  });

  it("der Katalog-Block nennt jeden Preis genau einmal als Zahl", () => {
    const text = renderProductContext();
    for (const it of allItems()) {
      if (it.price_eur == null) continue;
      assert.ok(text.includes(`[${it.key}]`), `[${it.key}] fehlt im gerenderten Katalog`);
    }
  });
});
