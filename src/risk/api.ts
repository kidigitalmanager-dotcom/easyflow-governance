// Datenschicht des Risk-Portals.
//
// Bis die Risk-API von Stream A live ist, liest jeder Screen aus den eingefrorenen
// Fixtures (02-Spezifikation/fixtures/). Umgeschaltet wird an genau einer Stelle:
// VITE_RISK_API_MODE=live. Die Signaturen bleiben identisch, kein Screen wird
// dafuer angefasst.
import type {
  RiskChange, RiskChangesResponse, RiskCompactRow, RiskGovernance, RiskMatchResult, RiskScore,
} from "./types";
import scoreFull from "./fixtures/score-single.json";
import scoreThin from "./fixtures/score-thin.json";
import batchCompact from "./fixtures/batch-compact-500.json";
import changesFixture from "./fixtures/changes-since.json";
import governanceFixture from "./fixtures/governance.json";
import matchFixture from "./fixtures/match-result.json";

export type RiskDataMode = "fixtures" | "live";
export const RISK_DATA_MODE: RiskDataMode =
  ((import.meta as any).env?.VITE_RISK_API_MODE as RiskDataMode) ?? "fixtures";
export const RISK_API_BASE =
  ((import.meta as any).env?.VITE_RISK_API_BASE as string) ?? "https://api.useeasy.ai/v1/risk";

/**
 * Gegenprobe zur Produktgrenze: ein underwriting_book-Mandant darf NIE
 * Instanz-Provenance sehen. Serverseitig ist das ein eigener Serialisierer -
 * hier steht die zweite Schranke, damit ein Contract-Bruch sofort auffaellt
 * statt still in die Oberflaeche zu laufen.
 */
const FORBIDDEN_PROVENANCE_KEYS = ["formula", "input", "evidence_refs", "evidence"] as const;

export function assertClassProvenanceOnly(score: RiskScore): RiskScore {
  const hits: string[] = [];
  for (const m of score.metrics ?? []) {
    const p = m.provenance as Record<string, unknown> | null;
    if (!p) continue;
    for (const k of FORBIDDEN_PROVENANCE_KEYS) {
      if (k in p) { hits.push(`${m.metric_key}.${k}`); delete (p as any)[k]; }
    }
  }
  if ((score as any).evidence_refs) { hits.push("evidence_refs"); delete (score as any).evidence_refs; }
  if (hits.length) {
    // Sichtbar machen, nicht verschweigen. Im Ernstfall gehoert das in ein Alert.
    console.error(
      "[risk] Contract-Bruch: Instanz-Provenance in einer underwriting_book-Antwort. " +
      "Entfernt: " + hits.join(", ")
    );
  }
  return score;
}

const latency = (ms = 180) => new Promise((r) => setTimeout(r, ms));

// ── deterministische Ableitung fuer Namen ohne eigenes Score-Fixture ──────────
// Die Fixtures liefern zwei vollstaendige Scores (acc_8f21, acc_1c04) und 500
// kompakte Zeilen. Fuer jeden anderen Namen wird der Detail-Score aus seiner
// kompakten Zeile abgeleitet - deterministisch, damit derselbe Name immer
// dieselben Werte zeigt. Sobald Stream A live ist, faellt dieser Block weg.
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

function deriveScoreFromCompact(row: RiskCompactRow): RiskScore {
  const rnd = seeded(row.account_id);
  const tpl = scoreFull as unknown as RiskScore;
  const base = row.health_score ?? 60;
  const jitter = (spread: number) => Math.max(0, Math.min(100, Math.round(base + (rnd() - 0.5) * spread)));

  const metrics = tpl.metrics.map((m) => ({
    ...m,
    value: jitter(28),
    band: undefined as never, // unten gesetzt
    confidence: row.confidence,
    coverage: row.coverage,
  })) as RiskScore["metrics"];
  for (const m of metrics) m.band = m.value == null ? "unbekannt" : m.value >= 70 ? "gesund" : m.value >= 50 ? "beobachten" : "kritisch";

  const trend = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, Math.min(100, Math.round(base + (rnd() - 0.45) * 10 - (11 - i) * 0.2)))
  );
  trend[11] = base;

  const top = row.top_reason;
  const reason_codes: RiskScore["reason_codes"] = top
    ? [{
        metric_key: top.metric_key, short_code: top.short_code, name: top.name,
        value: metrics.find((m) => m.metric_key === top.metric_key)?.value ?? null,
        contribution: top.contribution,
        direction: top.contribution >= 0 ? "up" : "down",
        label: top.label,
        trend_6m: trend.slice(6),
      }]
    : [];
  for (const m of metrics.slice(0, 3)) {
    if (reason_codes.some((r) => r.metric_key === m.metric_key)) continue;
    const contribution = Number(((rnd() - 0.5) * 9).toFixed(1));
    reason_codes.push({
      metric_key: m.metric_key, short_code: m.short_code, name: m.name, value: m.value,
      contribution, direction: contribution >= 0 ? "up" : "down",
      label: contribution >= 0 ? `${m.name} stuetzt den Score` : `${m.name} belastet den Score`,
      trend_6m: trend.slice(6),
    });
  }
  reason_codes.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const gap = Math.max(0, 70 - base);
  const lever = reason_codes.find((r) => r.contribution < 0) ?? reason_codes[0];
  // Wie viele Punkte muesste diese eine Kennzahl zulegen, damit der Gesamtscore
  // die Luecke schliesst? Ueber ihr Gewicht. Und: die Skala endet bei 100.
  // Ein Satz wie "muss um 88 Punkte steigen, von 51 auf 139" ist falsch, nicht
  // nur unschoen - er macht die Gegenprobe als Beleg wertlos.
  const leverWeight = metrics.find((m) => m.metric_key === lever?.metric_key)?.weight ?? 0.12;
  const needed = gap > 0 ? Math.ceil(gap / Math.max(leverWeight, 0.05)) : 0;
  const current = lever?.value ?? null;
  const reachable = gap > 0 && lever != null && current != null && current + needed <= 100;
  return assertClassProvenanceOnly({
    ...tpl,
    account_id: row.account_id,
    name: row.name,
    legal_form: row.legal_form,
    vertical: row.vertical,
    quality_tier: row.quality_tier,
    connected_sources: row.connected_sources,
    health_score: row.health_score,
    band: row.band,
    confidence: row.confidence,
    coverage: row.coverage,
    trend_12m: trend,
    categories: tpl.categories.map((c) => ({
      ...c,
      score: row.categories?.[c.key] ?? c.score,
      confidence: row.confidence,
      coverage: row.coverage,
    })),
    reason_codes: reason_codes.slice(0, 5),
    counterfactual: gap === 0
      ? { target_band: "gesund", target_score: 70, gap: 0, levers: [],
          text: "Dieser Name liegt bereits im Band gesund." }
      : reachable
      ? {
          target_band: "gesund", target_score: 70, gap,
          levers: [{
            metric_key: lever!.metric_key, name: lever!.name,
            current, required: current! + needed, delta: needed,
            text: `${lever!.name} muss um ${needed} Punkte steigen`,
          }],
          text: `Bei einer Verbesserung von ${lever!.name} um ${needed} Punkte bei sonst gleichen Werten erreicht dieser Name Band gesund (70).`,
        }
      : {
          target_band: "gesund", target_score: 70, gap, levers: [],
          text: "Keine einzelne Kennzahl kann diese Luecke innerhalb ihrer Skala schliessen. " +
                "Das Band gesund ist nur ueber mehrere Kennzahlen gleichzeitig erreichbar.",
        },
    metrics,
    history_note: row.history_note,
  } as RiskScore);
}

// ── oeffentliche Datenzugriffe ───────────────────────────────────────────────

export async function fetchScore(accountId: string): Promise<RiskScore> {
  if (RISK_DATA_MODE === "live") {
    const res = await fetch(`${RISK_API_BASE}/entities/${accountId}/score`);
    if (!res.ok) throw new Error(`Score konnte nicht geladen werden (HTTP ${res.status})`);
    return assertClassProvenanceOnly(await res.json());
  }
  await latency();
  if (accountId === (scoreFull as any).account_id) return assertClassProvenanceOnly(scoreFull as unknown as RiskScore);
  if (accountId === (scoreThin as any).account_id) return assertClassProvenanceOnly(scoreThin as unknown as RiskScore);
  const row = (batchCompact as any).results.find((r: RiskCompactRow) => r.account_id === accountId);
  if (!row) throw new Error(`Kein Name mit der Kennung ${accountId} im Bestand.`);
  // Die beiden Fixtures widersprechen sich: batch-compact fuehrt den Monatsstand,
  // changes-since eine spaetere Bewegung (bei 114 von 120 Namen abweichend).
  // Der juengere Stand gewinnt, sonst zeigt die Liste 76 und das Detail 86.
  // Gemeldet an Chat A als Fund B-6.
  const latest = ((changesFixture as any).changes as RiskChange[])
    .filter((c) => c.account_id === accountId)
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1))[0];
  const reconciled: RiskCompactRow = latest
    ? { ...row, health_score: latest.score_after, band: latest.band_after, confidence: latest.confidence ?? row.confidence }
    : row;
  return deriveScoreFromCompact(reconciled);
}

export async function fetchEntities(opts: { limit?: number; offset?: number } = {}): Promise<{ rows: RiskCompactRow[]; total: number }> {
  if (RISK_DATA_MODE === "live") {
    const q = new URLSearchParams({ limit: String(opts.limit ?? 100), offset: String(opts.offset ?? 0) });
    const res = await fetch(`${RISK_API_BASE}/entities?${q}`);
    if (!res.ok) throw new Error(`Bestand konnte nicht geladen werden (HTTP ${res.status})`);
    return res.json();
  }
  await latency();
  const all = (batchCompact as any).results as RiskCompactRow[];
  const off = opts.offset ?? 0;
  return { rows: all.slice(off, off + (opts.limit ?? all.length)), total: all.length };
}

export async function fetchChanges(): Promise<RiskChangesResponse> {
  if (RISK_DATA_MODE === "live") {
    const res = await fetch(`${RISK_API_BASE}/changes`);
    if (!res.ok) throw new Error(`Veraenderungen konnten nicht geladen werden (HTTP ${res.status})`);
    return res.json();
  }
  await latency();
  return changesFixture as unknown as RiskChangesResponse;
}

export async function fetchGovernance(): Promise<RiskGovernance> {
  if (RISK_DATA_MODE === "live") {
    const res = await fetch(`${RISK_API_BASE}/governance`);
    if (!res.ok) throw new Error(`Governance konnte nicht geladen werden (HTTP ${res.status})`);
    return res.json();
  }
  await latency();
  return governanceFixture as unknown as RiskGovernance;
}

export async function fetchMatchResult(): Promise<RiskMatchResult> {
  if (RISK_DATA_MODE === "live") {
    const res = await fetch(`${RISK_API_BASE}/portfolio/match/latest`);
    if (!res.ok) throw new Error(`Abgleich konnte nicht geladen werden (HTTP ${res.status})`);
    return res.json();
  }
  await latency();
  return matchFixture as unknown as RiskMatchResult;
}

/** Zwei Namen mit vollstaendigem Fixture - Einstieg fuer die Vorfuehrung. */
export const DEMO_ACCOUNTS = [
  { id: (scoreFull as any).account_id as string, name: (scoreFull as any).name as string, hint: "Qualitaetsstufe Voll" },
  { id: (scoreThin as any).account_id as string, name: (scoreThin as any).name as string, hint: "Qualitaetsstufe Basis, duenne Historie" },
];
