// Cross-Check: der Client-Spiegel (offer-calc.ts) MUSS dieselben Zahlen liefern
// wie die Server-Engine (offer_generator.js). Gleiche bekannten Werte wie test_engine.js.
// Lauf: node --experimental-strip-types offer-calc.test.ts
import { computeOffer, computePosition, money2, fmtEUR } from "./offer-calc.ts";

let PASS = 0, FAIL = 0; const fails: string[] = [];
function eq(name: string, got: unknown, exp: unknown) {
  if (got === exp) PASS++; else { FAIL++; fails.push(name + " got " + JSON.stringify(got) + " exp " + JSON.stringify(exp)); }
}
function ok(name: string, cond: boolean) { if (cond) PASS++; else { FAIL++; fails.push(name); } }

// Rundung (float-sicher)
eq("money2 1.005", money2(1.005), 1.01);
eq("money2 2.675", money2(2.675), 2.68);
eq("money2 0.005", money2(0.005), 0.01);
eq("money2 3.192", money2(3.192), 3.19);

// 19% Einzel
let r = computeOffer([{ menge: 2, einzelpreis_netto: 45, mwst_satz: 19 }]);
eq("19% netto", r.totals.netto, 90);
eq("19% mwst_19", r.totals.mwst_19, 17.1);
eq("19% brutto", r.totals.brutto, 107.1);
eq("19% incomplete", r.incomplete, false);

// gemischt 7+19
r = computeOffer([{ menge: 1, einzelpreis_netto: 100, mwst_satz: 19 }, { menge: 1, einzelpreis_netto: 50, mwst_satz: 7 }]);
eq("mixed mwst_19", r.totals.mwst_19, 19);
eq("mixed mwst_7", r.totals.mwst_7, 3.5);
eq("mixed brutto", r.totals.brutto, 172.5);

// §13b Reverse-Charge
r = computeOffer([{ menge: 1, einzelpreis_netto: 100, mwst_satz: 19 }], { reverse_charge: true });
eq("§13b mwst 0", r.totals.mwst_gesamt, 0);
eq("§13b brutto=netto", r.totals.brutto, 100);
ok("§13b hinweis", r.totals.hinweise.some((h) => /§13b/.test(h)));

// §19 Kleinunternehmer
r = computeOffer([{ menge: 1, einzelpreis_netto: 100, mwst_satz: 19 }], { kleinunternehmer: true });
eq("§19 mwst 0", r.totals.mwst_gesamt, 0);
ok("§19 hinweis", r.totals.hinweise.some((h) => /§19/.test(h)));

// null-EP -> unvollstaendig, keine Fake-Summe
r = computeOffer([{ menge: 2, einzelpreis_netto: 45, mwst_satz: 19 }, { menge: 1, einzelpreis_netto: null, mwst_satz: 19 }]);
eq("incomplete flag", r.incomplete, true);
eq("incomplete netto (nur bepreist)", r.totals.netto, 90);
eq("incomplete pos2 netto null", r.positions[1].netto, null);
eq("incomplete pos2 needs_price", r.positions[1].needs_price, true);

// Rundungsdrift (Satz-Summe autoritativ)
r = computeOffer([{ menge: 1, einzelpreis_netto: 8.4, mwst_satz: 19 }, { menge: 1, einzelpreis_netto: 8.4, mwst_satz: 19 }]);
eq("drift mwst_19 3.19", r.totals.mwst_19, 3.19);
eq("drift brutto 19.99", r.totals.brutto, 19.99);

// Gesamt-Rabatt %
r = computeOffer([{ menge: 1, einzelpreis_netto: 60, mwst_satz: 19 }, { menge: 1, einzelpreis_netto: 40, mwst_satz: 19 }], { rabatt_gesamt_prozent: 10 });
eq("rabatt netto_nach_rabatt", r.totals.netto_nach_rabatt, 90);
eq("rabatt brutto", r.totals.brutto, 107.1);

// Skonto (informativ)
r = computeOffer([{ menge: 2, einzelpreis_netto: 45, mwst_satz: 19 }], { skonto_prozent: 2, skonto_tage: 14 });
eq("skonto brutto unveraendert", r.totals.brutto, 107.1);
eq("skonto betrag", r.totals.skonto_betrag, 2.14);

// dt-String menge/EP
const p = computePosition({ menge: "2,5", einzelpreis_netto: "45,50", mwst_satz: 19 });
eq("dt-string netto 113.75", p.netto, 113.75);

// invalid satz -> error
const pe = computePosition({ menge: 1, einzelpreis_netto: 10, mwst_satz: 10 });
ok("invalid satz error", !!(pe.errors && pe.errors.indexOf("invalid_mwst_satz") >= 0));

// fmtEUR
eq("fmtEUR", fmtEUR(107.1), "107,10 EUR");
eq("fmtEUR null", fmtEUR(null), "—");

console.log("\n=== offer-calc (Client-Spiegel) ===");
console.log("PASS " + PASS + "  FAIL " + FAIL);
if (FAIL) { console.log("FAILED:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("CLIENT-SPIEGEL == SERVER-ENGINE (bekannte Werte)");
