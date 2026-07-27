/**
 * Klick-Durchlauf durch die gesamte Console ohne echtes Backend.
 *
 * Zweck: Render-Fehler finden, die tsc nicht sieht. Die Session wird gefaelscht
 * (Supabase-Token im localStorage), alle Aufrufe an api.useeasy.ai und an
 * Supabase werden abgefangen und mit Mustern beantwortet. Zusaetzlich laeuft
 * jede Route ein zweites Mal mit lauter Serverfehlern, damit auch die
 * Fehlerzustaende gerendert werden.
 *
 * Aufruf:  node e2e-smoke.mjs            (nutzt dist/, vorher `npx vite build`)
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = 4174;
const DIST = "dist";
const SUPA_KEY = "sb-trxsbknlwyysnlpgahav-auth-token";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2",
};

// ── statischer Server mit SPA-Fallback ──────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let p = join(DIST, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(p) || p.endsWith("/")) p = join(DIST, "index.html");
  try {
    const buf = await readFile(p);
    res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404).end("nope");
  }
});
await new Promise((r) => server.listen(PORT, r));

// ── Antwort-Muster ──────────────────────────────────────────────────────────
const now = new Date().toISOString();
const ME = {
  ok: true,
  user: { email: "admin@useeasy.ai", tenant_id: "admin_useeasy", is_super_admin: true },
  tenant: { tenant_id: "admin_useeasy", tenant_name: "UseEasy Test", status: "active", gmail_enabled: false, outlook_enabled: true },
  plan: { name: "Starter", mailbox_limit: 1, active_mailboxes: 1, email_limit: 2000, emails_used: 1480, draft_limit: 500, drafts_used: 12 },
  setup: { complete: true, status: "ready" },
  core_labels: [{ core_key: "billing_payment", display: "Rechnung & Zahlung" }],
  mailbox_health: [],
};
const DOCS = {
  ok: true,
  items: [
    { id: 1, doc_type: "ar_invoice", status: "open", counterpart_name: "Muster GmbH", amount_gross: 1200,
      issue_date: "2026-07-02", due_date: "2026-07-16", paid_at: null, overdue: true, mahnstufe: 1, needs_confirmation: false, has_pdf: true },
    { id: 2, doc_type: "ar_invoice", status: "paid", counterpart_name: "Zweite AG", amount_gross: 800,
      issue_date: "2026-06-03", due_date: "2026-06-17", paid_at: "2026-06-20", overdue: false, needs_confirmation: false, has_pdf: true },
  ],
};
const MEMORY_ENTITIES = {
  ok: true,
  entities: [
    { entity_hash: "h1", entity_email: "a@kunde.de", display_name: "Kunde A", next_deadline_at: new Date(Date.now() + 3 * 86400000).toISOString(), open_commitments: 2, threads_open: 1 },
    { entity_hash: "h2", entity_email: "b@kunde.de", display_name: "Kunde B", next_deadline_at: new Date(Date.now() - 5 * 86400000).toISOString(), open_commitments: 1, threads_open: 1 },
    { entity_hash: "h3", entity_email: "c@kunde.de", display_name: "Kunde C", next_deadline_at: new Date(Date.now() + 9 * 86400000).toISOString(), open_commitments: 0, threads_open: 0 },
  ],
};

function mockFor(url) {
  const u = url.split("?")[0];
  if (u.endsWith("/dashboard/me")) return ME;
  if (u.endsWith("/dashboard/stats")) return { ok: true, emails_week: 42, emails_today: 5, drafts_created_week: 9, resolved_week: 4, shadow_would_send_today: 1, shadow_hold_today: 0, queued_today: 0 };
  if (u.endsWith("/dashboard/documents")) return DOCS;
  // Diese beiden liefern ein ARRAY, kein Huellobjekt (api-client: RecentEmail[] / AuditLogEntry[]).
  if (u.endsWith("/dashboard/emails/recent")) return [
    { event_id: "e1", subject: "Rechnung 2026-0815", sender_email: "kunde@firma.de", priority: "P1",
      category: "billing_payment", confidence: 0.92, created_at: now, has_draft: true, draft_id: "e1:draft:1",
      draft_body: "Guten Tag, vielen Dank fuer Ihre Nachricht.", status: "pending",
      response_type: "reply", label_reason: "Regel E_billing_invoice", autopilot_mode: "shadow" },
  ];
  if (u.endsWith("/dashboard/audit")) return [
    { event_id: "e1", subject: "Rechnung 2026-0815", sender_email: "kunde@firma.de", priority: "P1",
      category: "billing_payment", confidence: 0.92, created_at: now, action_type: "label",
      status: "done", decision_path: "pack_engine_auto_close", playbook_name: "ecom_core_v1" },
  ];
  if (u.includes("/documents/ap")) return { ok: true, items: [], receivables: { total: 5000, due_horizon: 1200, overdue: 300 }, payables: { total: 2000, due_horizon: 500, overdue: 0 }, ampel: "gruen", settings: {} };
  if (u.endsWith("/memory/entities")) return MEMORY_ENTITIES;
  if (u.endsWith("/memory/episodes")) return { ok: true, episodes: [] };
  if (u.includes("/autopilot/policy")) return { ok: true, policy: {}, maturity: [] };
  if (u.includes("/documents/invoices")) return { ok: true, items: [] };
  if (u.includes("/documents/requests")) return { ok: true, items: [] };
  if (u.includes("/documents/offers/approved")) return { ok: true, items: [] };
  if (u.includes("/documents/billing-profile")) return { ok: true, profile: null };
  if (u.includes("/improve-suggestions")) return { ok: true, suggestion: null };
  if (u.includes("/team/members")) return { ok: true, members: [], settings: { default_hourly_rate_cents: null } };
  return { ok: true, items: [], entities: [], members: [], rows: [], data: [], suggestions: [] };
}

// ── Routen ──────────────────────────────────────────────────────────────────
const ROUTES = [
  "/", "/review", "/audit",
  "/buchhaltung", "/forderungen", "/forderungen?tab=rechnungen", "/rechnungen",
  "/verbindlichkeiten", "/angebote",
  "/mitarbeiter", "/zeiterfassung",
  "/signale?sec=signale", "/signale?sec=risk_shield", "/fruehwarnung", "/chancen",
  "/playbooks", "/datenquellen", "/voice", "/einstellungen", "/onboarding",
  "/admin",
];

// Der Sandbox-Chromium ist vorinstalliert; playwright wuerde sonst eine andere
// Build-Nummer nachladen wollen (kein Netz noetig, wir zeigen direkt darauf).
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const problems = [];

async function run(label, { failApi }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 800 } });

  await ctx.addInitScript(([key, session]) => {
    localStorage.setItem(key, JSON.stringify(session));
  }, [SUPA_KEY, {
    access_token: "test.token.value", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r",
    user: { id: "u1", aud: "authenticated", role: "authenticated", email: "admin@useeasy.ai", app_metadata: {}, user_metadata: {}, created_at: now },
  }]);

  // Supabase-Auth bedienen, sonst wirft der Client die Session weg.
  await ctx.route("**trxsbknlwyysnlpgahav.supabase.co/**", (route) => {
    const u = route.request().url();
    if (u.includes("/auth/v1/user")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u1", email: "admin@useeasy.ai", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: now }) });
    }
    if (u.includes("/auth/v1/factors") || u.includes("/aal")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ all: [], totp: [] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  // Alles Externe abwuergen (Schriften, CDN) - sonst wartet der Browser auf Netz.
  await ctx.route("**://*.googleapis.com/**", (r) => r.abort());
  await ctx.route("**://*.gstatic.com/**", (r) => r.abort());
  await ctx.route("**://cdnjs.cloudflare.com/**", (r) => r.abort());

  // Capital-Supabase + api.useeasy.ai
  await ctx.route("**vunhcexnwbvxrwecymiy.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await ctx.route("**://api.useeasy.ai/**", (route) => {
    if (failApi) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "kaputt" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFor(route.request().url())) });
  });

  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${label} | ${page.url()} | PAGEERROR ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Netzwerk-/Mock-Rauschen ist erwartet und kein Render-Fehler.
    if (/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d/i.test(t)) return;
    problems.push(`${label} | ${page.url()} | CONSOLE ${t.slice(0, 220)}`);
  });

  for (const r of ROUTES) {
    await page.goto(`http://localhost:${PORT}${r}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const bodyLen = (await page.locator("body").innerText().catch(() => "")).trim().length;
    if (bodyLen < 20) problems.push(`${label} | ${r} | LEERE SEITE (${bodyLen} Zeichen Text)`);
    // Auffangnetz-Meldung = Render-Fehler auf der Seite
    if (await page.getByText(/Diese Ansicht konnte nicht|ist etwas schiefgelaufen/i).count().catch(() => 0)) {
      problems.push(`${label} | ${r} | RouteErrorBoundary ausgeloest`);
    }
  }
  await ctx.close();
}

await run("daten", { failApi: false });
await run("fehler", { failApi: true });

// Zusatz: kurzes Fenster, damit ein Wegscrollen der Navigation auffiele
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(([key, s]) => localStorage.setItem(key, JSON.stringify(s)), [SUPA_KEY, {
  access_token: "t", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "r", user: { id: "u1", aud: "authenticated", role: "authenticated", email: "admin@useeasy.ai", app_metadata: {}, user_metadata: {}, created_at: now },
}]);
await ctx.route("**trxsbknlwyysnlpgahav.supabase.co/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u1", email: "admin@useeasy.ai", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: now }) }));
await ctx.route("**://api.useeasy.ai/**", (r) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFor(r.request().url())) }));
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/einstellungen`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
const nav = page.locator('nav[aria-label="Bereiche"]');
const areaButtons = await nav.locator("button").count();
const box = await nav.boundingBox();
console.log(`\nBereichs-Leiste bei 1280x720: ${areaButtons} Schaltflaechen, Hoehe ${box ? Math.round(box.height) : "?"} px`);
// Sind alle Bereiche im sichtbaren Bereich?
let allVisible = true;
for (const label of ["Arbeit", "Geld", "Mitarbeiter", "Signale", "System"]) {
  const b = nav.locator(`button[aria-label="${label}"]`);
  const vb = await b.boundingBox().catch(() => null);
  const ok = !!vb && vb.y + vb.height <= 720;
  if (!ok) { allVisible = false; problems.push(`layout | 1280x720 | Bereich "${label}" nicht sichtbar`); }
  console.log(`  ${label}: ${ok ? "sichtbar" : "ABGESCHNITTEN"}`);
}
await ctx.close();

await browser.close();
server.close();

console.log("\n" + "=".repeat(64));
if (problems.length === 0) {
  console.log(`ALLE ${ROUTES.length} ROUTEN SAUBER (mit Daten und mit Serverfehlern).`);
  console.log(allVisible ? "Alle Bereiche der Seitenleiste sind bei 1280x720 sichtbar." : "");
  process.exit(0);
}
console.log(`${problems.length} PROBLEME:\n`);
for (const p of problems.slice(0, 60)) console.log(" - " + p);
process.exit(1);
