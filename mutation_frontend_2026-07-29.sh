#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Mutations-Gegenprobe fuer die fuenf Frontend-Befunde vom 29.07.2026.
#
# Jede Mutation baut GENAU den Fehler wieder ein, den der jeweilige Test
# verhindern soll. Bleibt die Suite danach gruen, ist der Test wertlos —
# gruen allein beweist nichts.
#
# Aufruf:  bash mutation_frontend_2026-07-29.sh
# Laeuft auf einer Kopie; das Arbeitsverzeichnis bleibt unberuehrt.
# ---------------------------------------------------------------------------
set -u
REPO="$(cd "$(dirname "$0")" && pwd)"
WORK="/tmp/fe-mut"
PASSED=0; BROKEN=0

run_mut () {
  local name="$1"; local suite="$2"; shift 2
  rm -rf "$WORK"
  mkdir -p "$WORK"
  # node_modules per Symlink, damit die Kopie in Sekunden statt Minuten steht
  ( cd "$REPO" && tar --exclude=node_modules --exclude=.git --exclude=dist -cf - . ) | ( cd "$WORK" && tar -xf - )
  ln -s "$REPO/node_modules" "$WORK/node_modules"

  ( cd "$WORK" && "$@" >/dev/null 2>&1 )

  local out rc
  out="$( cd "$WORK" && npx vitest run "$suite" 2>&1 )"; rc=$?
  if [ "$rc" != "0" ]; then
    local n
    n="$(echo "$out" | grep -oE '[0-9]+ failed' | head -1)"
    printf "  ROT   %-62s (%s)\n" "$name" "${n:-Fehler}"
    echo "$out" | grep -E '^\s+×' | sed 's/^/          /' | head -3
    PASSED=$((PASSED+1))
  else
    printf "  GRUEN %-62s <-- TEST IST WERTLOS\n" "$name"
    BROKEN=$((BROKEN+1))
  fi
}

echo "== Mutations-Gegenprobe Frontend 29.07.2026 =="

# --- Befund 5: Postfach-Zaehler -------------------------------------------
run_mut "M1 Zaehler zeigt das Limit wieder roh (die -1 kommt zurueck)" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/const mailboxUnlimited = isUnlimitedLimit\(plan\?\.mailbox_limit, plan\?\.mailbox_unlimited\);/const mailboxUnlimited = false;/s' src/pages/Einstellungen.tsx

run_mut "M2 Unbegrenzt-Erkennung nur ueber das Flag, Sentinel -1 ignoriert" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/  return flag === true \|\| limit === UNLIMITED_LIMIT \|\| limit === null;/  return flag === true;/s' src/lib/api-client.ts

run_mut "M3 Ueber-Limit-Warnung ohne Unbegrenzt-Schutz" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/\{!mailboxUnlimited && mailboxLimit > 0 && activeMailboxes > mailboxLimit && \(/{mailboxLimit > 0 \&\& activeMailboxes > mailboxLimit \&\& (/s' src/pages/Einstellungen.tsx

# --- Befund 4: Deep-Link ---------------------------------------------------
run_mut "M4 Tabs wieder unkontrolliert (defaultValue statt value)" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/<Tabs value=\{tab\} onValueChange=\{handleTabChange\}/<Tabs defaultValue={tab}/s' src/pages/Einstellungen.tsx

run_mut "M5 URL-Wechsel wird nicht mehr nachgezogen (Effekt entfernt)" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/    setTab\(tabFromParam\(rawTab\)\);\n    setApSection\(apSectionFromParam\(rawTab\)\);/    \/* mutiert *\//s' src/pages/Einstellungen.tsx

run_mut "M6 jana-wissen faellt aus der Liste der bekannten Tabs" \
  "src/pages/EinstellungenTabsUndLimit.test.tsx" \
  perl -0pi -e 's/"general", "email-autopilot", "autopilot", "jana-wissen", "knowledge",/"general", "email-autopilot", "autopilot", "knowledge",/s' src/pages/Einstellungen.tsx

# --- Befund 1: Jana Voice --------------------------------------------------
# M7 zeigt auf die ECHTE Kette (api-fehler-rumpf.test.ts). Die erste Fassung
# zeigte auf den Komponenten-Test — der baute den ApiError selbst und blieb
# deshalb gruen. Genau dafuer ist diese Gegenprobe da.
run_mut "M7 apiFetch verwirft den Fehler-Rumpf wieder" \
  "src/lib/api-fehler-rumpf.test.ts" \
  perl -0pi -e 's/    throw new ApiError\(res\.status, `API Fehler \$\{res\.status\}`, payload\);/    throw new ApiError(res.status, `API Fehler \${res.status}`);/s' src/lib/api-client.ts

run_mut "M8 ApiError traegt den Rumpf nicht mehr" \
  "src/lib/api-fehler-rumpf.test.ts" \
  perl -0pi -e 's/    this\.payload = payload;/    this.payload = undefined;/s' src/lib/api-client.ts

run_mut "M9 404 erzeugt keinen Leer-Entwurf mehr" \
  "src/components/JanaVoicePolicyEmpty.test.tsx" \
  perl -0pi -e 's/    if \(p\.error !== "policy_not_found"\) return;/    if (true) return;/s' src/components/JanaAutopilotTab.tsx

run_mut "M10 jeder 404 wird verschluckt, auch der vom Gateway" \
  "src/components/JanaVoicePolicyEmpty.test.tsx" \
  perl -0pi -e 's/    \(error\.payload as \{ error\?: string \} \| undefined\)\?\.error === "policy_not_found";/    true;/s' src/components/JanaAutopilotTab.tsx

run_mut "M11 Sperrliste kommt wieder aus der lokalen Kopie statt vom Server" \
  "src/components/JanaVoicePolicyEmpty.test.tsx" \
  perl -0pi -e 's/        hard_blocked_intents: Array\.isArray\(p\.hard_blocked_intents\)\n          \? \(p\.hard_blocked_intents as string\[\]\)\n          : base\.hard_blocked_intents,/        hard_blocked_intents: base.hard_blocked_intents,/s' src/components/JanaAutopilotTab.tsx

# --- Befund 2: Audit-Trail -------------------------------------------------
run_mut "M12 Gruende wieder als rohes JSON" \
  "src/components/AutopilotAuditLesbar.test.tsx" \
  perl -0pi -e 's/            \{d\?\.erklaerung \?\? "Für diese Entscheidung liegt noch keine Erklärung in der Console vor\."\}/            {JSON.stringify(row.reasons, null, 2)}/s' src/components/EmailAutopilotAuditView.tsx

run_mut "M13 Entwurfs-UUID steht wieder ungefragt in der Zeile" \
  "src/components/AutopilotAuditLesbar.test.tsx" \
  perl -0pi -e 's/          <p className="text-\[13px\] leading-relaxed">/          <p className="text-[13px] leading-relaxed">{row.draft_id}/s' src/components/EmailAutopilotAuditView.tsx

run_mut "M14 Probelauf verliert seinen Grund (slice(1) fuer alle)" \
  "src/components/AutopilotAuditLesbar.test.tsx" \
  perl -0pi -e 's/  const weitere = istProbelauf \? gruende : gruende\.slice\(1\);/  const weitere = gruende.slice(1);/s' src/components/EmailAutopilotAuditView.tsx

run_mut "M15 unbekannter Code bekommt eine erfundene Erklaerung" \
  "src/components/AutopilotAuditLesbar.test.tsx" \
  perl -0pi -e 's/            \{d\?\.erklaerung \?\? "Für diese Entscheidung liegt noch keine Erklärung in der Console vor\."\}/            {d?.erklaerung ?? "Alles in Ordnung."}/s' src/components/EmailAutopilotAuditView.tsx

run_mut "M16 eine Entscheidung faellt aus der Uebersetzungstabelle" \
  "src/components/AutopilotAuditLesbar.test.tsx" \
  perl -0pi -e 's/  held_high_edit_rate: \{\n    label: "Entwürfe werden zu oft geändert",/  held_high_edit_rate_MUTIERT: {\n    label: "Entwürfe werden zu oft geändert",/s' src/components/EmailAutopilotAuditView.tsx

# --- Befund 3: Design ------------------------------------------------------
run_mut "M17 cremige Hell-Flaeche kehrt in die Vorschlags-Karte zurueck" \
  "src/lib/theme-klassen.test.ts" \
  perl -0pi -e 's/border border-amber\/25 bg-amber-surface\/70 p-4 pl-5/border bg-amber-50\/50 p-4 pl-5/s' src/components/JanaKnowledgeTab.tsx

run_mut "M18 tote dark:-Variante kehrt zurueck" \
  "src/lib/theme-klassen.test.ts" \
  perl -0pi -e 's/border border-amber\/25 bg-amber-surface\/70 p-3 pl-4/border bg-card dark:bg-amber-950\/20 p-3 pl-4/s' src/components/JanaKnowledgeProposalCard.tsx

run_mut "M19 dunkle Schriftfarbe auf dunklem Grund" \
  "src/lib/theme-klassen.test.ts" \
  perl -0pi -e 's/border border-amber\/30 bg-amber-surface p-3 text-sm text-amber/border border-amber\/30 bg-amber-surface p-3 text-sm text-amber-800/s' src/components/documents/InvoicePositionsTable.tsx

echo ""
echo "== Ergebnis: $PASSED von $((PASSED+BROKEN)) Mutationen wurden ROT =="
rm -rf "$WORK"
[ "$BROKEN" = "0" ] || exit 1
