// ─────────────────────────────────────────────────────────────────────────────
// offer-calc.ts — Client-Spiegel der SERVER-Rechen-Engine (offer_generator.js).
// Reine Funktionen fuer die SOFORTIGE Live-Neuberechnung im Positions-Tisch.
// WICHTIG: die gespeicherten Werte kommen IMMER vom Server (autoritativ);
// dieser Spiegel dient nur der responsiven UX. Die Mathematik ist 1:1 identisch
// zur Lambda (USt pro Satz auf die Summe der Zeilen-Nettos, EN-16931-konform;
// null-Einzelpreis = unvollstaendig ohne Fake-Summe; §13b/§19 setzen USt 0).
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_MWST_SAETZE = [0, 7, 19] as const;
export const DEFAULT_MWST_SATZ = 19;

export type OfferPosition = {
  pos?: number | null;
  beschreibung?: string | null;
  menge?: number | string | null;
  einheit?: string | null;
  einzelpreis_netto?: number | string | null;
  mwst_satz?: number | null;
  rabatt_prozent?: number | null;
  price_source?: string | null;
  needs_confirmation?: boolean;
  preis_vorschlag?: number | null;
  // berechnet:
  netto?: number | null;
  mwst?: number | null;
  brutto?: number | null;
  needs_price?: boolean;
  errors?: string[];
};

export type OfferOpts = {
  reverse_charge?: boolean;
  kleinunternehmer?: boolean;
  rabatt_gesamt_prozent?: number | string | null;
  rabatt_gesamt_betrag?: number | string | null;
  skonto_prozent?: number | string | null;
  skonto_tage?: number | string | null;
};

export type OfferTotals = {
  netto: number;
  rabatt_gesamt_betrag: number;
  netto_nach_rabatt: number;
  mwst_7: number;
  mwst_19: number;
  mwst_gesamt: number;
  reverse_charge: boolean;
  kleinunternehmer: boolean;
  skonto_prozent: number;
  skonto_tage: number;
  skonto_betrag: number | null;
  skonto_brutto: number | null;
  brutto: number;
  incomplete: boolean;
  hinweise: string[];
};

export type OfferComputed = {
  positions: OfferPosition[];
  totals: OfferTotals;
  errors: string[];
  incomplete: boolean;
};

// Float-sichere kaufmaennische Rundung (halb weg von 0) auf 2 Dezimalen.
export function money2(n: unknown): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const s = x < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(x) * 100 + 1e-6)) / 100;
}

function numQty(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[0-9]*\.?[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  if (/,-$/.test(s)) s = s.replace(/,-$/, ",00");
  const hasComma = s.indexOf(",") >= 0;
  const hasDot = s.indexOf(".") >= 0;
  if (hasComma) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasDot) {
    const parts = s.split(".");
    if (!(parts.length === 2 && parts[1].length === 2)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pct(v: unknown, max = 100): number | null {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : numQty(v);
  if (n == null || !Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function taxRegime(opts: OfferOpts) {
  const reverse_charge = !!opts.reverse_charge;
  const kleinunternehmer = !!opts.kleinunternehmer;
  return { reverse_charge, kleinunternehmer, zero_vat: reverse_charge || kleinunternehmer };
}

export function computePosition(raw: OfferPosition, ctx?: { regime?: ReturnType<typeof taxRegime> }): OfferPosition {
  const regime = ctx?.regime || taxRegime({});
  const errors: string[] = [];
  const out: OfferPosition = {
    pos: raw?.pos != null ? raw.pos : null,
    beschreibung: raw?.beschreibung != null ? String(raw.beschreibung).slice(0, 2000) : null,
    einheit: (raw?.einheit != null && String(raw.einheit).trim()) ? String(raw.einheit).slice(0, 40) : "Stk",
    price_source: raw?.price_source || null,
    needs_confirmation: !!raw?.needs_confirmation,
  };
  if (raw?.preis_vorschlag != null) {
    const pv = numMoney(raw.preis_vorschlag);
    if (pv != null && pv >= 0) out.preis_vorschlag = money2(pv);
  }

  const menge = numQty(raw?.menge);
  if (menge == null || menge < 0) errors.push("invalid_menge");
  out.menge = menge != null && menge >= 0 ? menge : null;

  const epRaw = raw ? raw.einzelpreis_netto : null;
  const needsPrice = epRaw == null || epRaw === "";
  let ep: number | null = null;
  if (!needsPrice) {
    ep = numMoney(epRaw);
    if (ep == null || ep < 0) { errors.push("invalid_ep"); ep = null; }
  }
  out.einzelpreis_netto = ep;
  out.needs_price = needsPrice;
  if (needsPrice && !out.price_source) out.price_source = "pending";

  let satz: number;
  if (regime.zero_vat) satz = 0;
  else {
    const sRaw = raw?.mwst_satz != null ? Number(raw.mwst_satz) : DEFAULT_MWST_SATZ;
    if ((VALID_MWST_SAETZE as readonly number[]).indexOf(sRaw) < 0) { errors.push("invalid_mwst_satz"); satz = DEFAULT_MWST_SATZ; }
    else satz = sRaw;
  }
  out.mwst_satz = satz;

  const rab = pct(raw?.rabatt_prozent, 100);
  if (rab == null) errors.push("invalid_rabatt");
  out.rabatt_prozent = rab == null ? 0 : rab;

  const computable = out.menge != null && out.einzelpreis_netto != null && errors.length === 0;
  if (computable) {
    const netto = money2((out.menge as number) * (out.einzelpreis_netto as number) * (1 - (out.rabatt_prozent as number) / 100));
    out.netto = netto;
    out.mwst = money2((netto as number) * satz / 100);
    out.brutto = money2((netto as number) + (out.mwst as number));
  } else {
    out.netto = null; out.mwst = null; out.brutto = null;
  }
  if (errors.length) out.errors = errors;
  return out;
}

export function computeOffer(rawPositions: OfferPosition[], opts?: OfferOpts): OfferComputed {
  const o = opts || {};
  const regime = taxRegime(o);
  const positions: OfferPosition[] = [];
  const errors: string[] = [];
  let idx = 0;
  for (const rp of Array.isArray(rawPositions) ? rawPositions : []) {
    idx++;
    const p = computePosition(rp, { regime });
    if (p.pos == null) p.pos = idx;
    positions.push(p);
    if (p.errors) for (const e of p.errors) errors.push("pos " + p.pos + ": " + e);
  }
  const incomplete = positions.some((p) => p.netto == null);

  const baseBySatz: Record<string, number> = {};
  let nettoSum = 0;
  for (const p of positions) {
    if (p.netto == null) continue;
    const key = String(p.mwst_satz);
    baseBySatz[key] = money2((baseBySatz[key] || 0) + p.netto) as number;
    nettoSum = money2(nettoSum + p.netto) as number;
  }

  let rabattGesamtBetrag = 0;
  const rgBetrag = numMoney(o.rabatt_gesamt_betrag);
  const rgProzent = pct(o.rabatt_gesamt_prozent, 100);
  if (o.rabatt_gesamt_prozent != null && rgProzent == null) errors.push("invalid_rabatt_gesamt");
  if (rgBetrag != null && rgBetrag > 0 && nettoSum > 0) rabattGesamtBetrag = money2(Math.min(rgBetrag, nettoSum)) as number;
  else if (rgProzent && rgProzent > 0 && nettoSum > 0) rabattGesamtBetrag = money2((nettoSum * rgProzent) / 100) as number;
  const rabattFaktor = nettoSum > 0 && rabattGesamtBetrag > 0 ? 1 - rabattGesamtBetrag / nettoSum : 1;

  let mwst7 = 0, mwst19 = 0, nettoNachRabatt = 0;
  for (const key of Object.keys(baseBySatz)) {
    const base = money2(baseBySatz[key] * rabattFaktor) as number;
    nettoNachRabatt = money2(nettoNachRabatt + base) as number;
    const satz = Number(key);
    if (satz === 7) mwst7 = money2(mwst7 + (money2(base * 0.07) as number)) as number;
    else if (satz === 19) mwst19 = money2(mwst19 + (money2(base * 0.19) as number)) as number;
  }
  const mwstGesamt = money2(mwst7 + mwst19) as number;
  const brutto = money2(nettoNachRabatt + mwstGesamt) as number;

  const skontoProzent = pct(o.skonto_prozent, 100);
  if (o.skonto_prozent != null && skontoProzent == null) errors.push("invalid_skonto");
  let skontoBetrag: number | null = null, skontoBrutto: number | null = null;
  if (skontoProzent && skontoProzent > 0) {
    skontoBetrag = money2((brutto * skontoProzent) / 100);
    skontoBrutto = money2(brutto - (skontoBetrag as number));
  }
  const skontoTage = o.skonto_tage != null ? parseInt(String(o.skonto_tage), 10) || 0 : 0;

  const totals: OfferTotals = {
    netto: nettoSum,
    rabatt_gesamt_betrag: rabattGesamtBetrag || 0,
    netto_nach_rabatt: nettoNachRabatt,
    mwst_7: mwst7,
    mwst_19: mwst19,
    mwst_gesamt: mwstGesamt,
    reverse_charge: regime.reverse_charge,
    kleinunternehmer: regime.kleinunternehmer,
    skonto_prozent: skontoProzent && skontoProzent > 0 ? skontoProzent : 0,
    skonto_tage: skontoTage,
    skonto_betrag: skontoBetrag,
    skonto_brutto: skontoBrutto,
    brutto,
    incomplete,
    hinweise: buildTaxHinweise(regime, { skontoProzent, skontoBetrag, skontoTage }),
  };
  return { positions, totals, errors, incomplete };
}

function buildTaxHinweise(
  regime: { reverse_charge: boolean; kleinunternehmer: boolean },
  extra: { skontoProzent: number | null; skontoBetrag: number | null; skontoTage: number },
): string[] {
  const h: string[] = [];
  if (regime.kleinunternehmer) h.push("Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).");
  else if (regime.reverse_charge) h.push("Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge) gemäß §13b UStG. Die Umsatzsteuer ist vom Leistungsempfänger abzuführen.");
  if (extra.skontoProzent && extra.skontoProzent > 0 && extra.skontoBetrag != null) {
    const tage = extra.skontoTage || 0;
    h.push("Bei Zahlung innerhalb von " + (tage || "…") + " Tagen gewähren wir " + extra.skontoProzent + "% Skonto (" + fmtEUR(extra.skontoBetrag) + ").");
  }
  return h;
}

// ── Anzeige-Helfer ────────────────────────────────────────────────────────────
export function fmtEUR(n: number | string | null | undefined, currency = "EUR"): string {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
}
export function fmtDateDe(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? m[3] + "." + m[2] + "." + m[1] : String(iso);
}
