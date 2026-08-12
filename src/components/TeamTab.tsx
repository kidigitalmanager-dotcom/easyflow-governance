// -----------------------------------------------------------------------------
// TeamTab (v4.203.0, Team-Umbau "ein Team für alle") — Mitarbeiter → Team.
//
// Reiter "Team": EINE Liste über beide Welten (governance.tenant_members =
// Zeiterfassung + Konsolen-Berechtigung, governance.copilot_vertriebler =
// Vertrieb), zusammengeführt über die kleingeschriebene E-Mail. Der Zugang
// steht ZWEITEILIG dran, weil B4b genau daran hängen blieb: BERECHTIGUNG
// (tenant_members, RDS) ist nicht KONTO (Supabase-Login) — der Weg war gebaut
// und nie gegangen worden. Je Vertriebler drei Schnellzugriffe (Nachtrag
// Leon 11.08.): Co-Pilot-Link, Anrufverlauf, zugeordnete Leads — alles
// Weiterleitungen auf Bestehendes, kein Neubau. Die Fachverwaltung der
// Vertriebler (Nummer, Skript, Deployment) bleibt unter Voice & Co-Pilot,
// hier wird nur verlinkt, nichts dupliziert (§3.4).
//
// Reiter "Vergütung & Sätze": Abrechnungs-/Lohnsatz je Mitglied und die
// Standard-Sätze (hierher gewandert, Leon: "dort, wo die Mitarbeiter aktuell
// stehen, gibt es dann nur noch Einstellungen für Zeiterfassung und Lohn bzw.
// ein Provisionsfenster"), plus NEU das freie Provisionsfeld je Vertriebler
// (POST /team/provision; leer erlaubt, keine Staffeln im ersten Schnitt;
// Staffeln kommen später als Zeilen über stufe_ab_cents).
//
// Entfernen-Regel (§4): Deaktivieren nimmt die BERECHTIGUNG, nicht das Konto —
// die Meldung sagt das ausdrücklich. Bundle-Marker: team-umbau-v1.
// -----------------------------------------------------------------------------
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTeamMembers, useUpsertTeamMember, useDeleteTeamMember, useUpdateTimeSettings, useSaveTeamProvision } from "@/hooks/use-api";
import type { TeamMember, TeamVertriebler, KontoStatus } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { toast } from "sonner";
import { Users, Plus, Loader2, UserX, UserCheck, ExternalLink, PhoneCall, FolderOpen, KeyRound } from "lucide-react";

function centsToEuroStr(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}
function euroStrToCents(v: string): number | null {
  const s = (v || "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function pctToStr(pct: number | null): string {
  return pct == null ? "" : String(pct).replace(".", ",");
}

/** Eine Zeile der EINEN Liste: Mitglied, Vertriebler oder beides. */
type Zeile = {
  key: string;
  name: string;
  email: string | null;
  member: TeamMember | null;
  vertrieb: TeamVertriebler | null;
};

function KontoBadge({ konto }: { konto: KontoStatus | undefined }) {
  if (konto === "vorhanden") {
    return <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30" title="Supabase-Login-Konto existiert.">Konto ✓</Badge>;
  }
  if (konto === "fehlt") {
    return <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30" title="Noch kein Login-Konto — die Person registriert sich selbst mit genau dieser E-Mail unter app.useeasy.ai (Kachel „Mitarbeiter“).">Konto fehlt</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground" title="Konto-Status konnte nicht abgefragt werden.">Konto unbekannt</Badge>;
}

function RolleBadges({ z }: { z: Zeile }) {
  return (
    <>
      {z.member && <Badge variant="secondary" className="text-[10px]" title="Kann Zeiten erfassen und die Konsole öffnen (Berechtigung über tenant_members).">Zeiterfassung</Badge>}
      {z.vertrieb && <Badge variant="secondary" className="text-[10px]" title="Vertriebler mit Co-Pilot (Telefonie).">Vertrieb</Badge>}
      {z.member?.role === "owner" && <Badge variant="secondary" className="text-[10px]">Team-Owner</Badge>}
    </>
  );
}

export function TeamTab() {
  const team = useTeamMembers(true);
  const upsert = useUpsertTeamMember();
  const remove = useDeleteTeamMember();
  const saveSettings = useUpdateTimeSettings();
  const saveProvision = useSaveTeamProvision();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [defaultRate, setDefaultRate] = useState<string | null>(null);
  const [defaultCost, setDefaultCost] = useState<string | null>(null);

  const members = team.data?.members || [];
  const vertrieb = team.data?.vertrieb || [];
  const provisionVerfuegbar = team.data?.provision_verfuegbar === true;
  const kontoQuelle = team.data?.konto_quelle;
  const loadFailed = team.isError;

  // ── Die EINE Liste: members + vertrieb per E-Mail zusammenführen ──────────
  const vertriebByEmail = new Map<string, TeamVertriebler>();
  for (const v of vertrieb) { if (v.email) vertriebByEmail.set(v.email.toLowerCase(), v); }
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const zeilen: Zeile[] = [
    ...members.map((m) => ({
      key: `m-${m.id}`,
      name: m.display_name || m.email,
      email: m.email,
      member: m,
      vertrieb: vertriebByEmail.get(m.email.toLowerCase()) ?? null,
    })),
    ...vertrieb
      .filter((v) => !v.email || !memberEmails.has(v.email.toLowerCase()))
      .map((v) => ({ key: `v-${v.rep_id}`, name: v.name, email: v.email, member: null, vertrieb: v })),
  ];
  zeilen.sort((a, b) => {
    const aktivA = a.member ? a.member.active : a.vertrieb?.aktiv !== false;
    const aktivB = b.member ? b.member.active : b.vertrieb?.aktiv !== false;
    if (aktivA !== aktivB) return aktivA ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });

  const effDefaultRate = defaultRate != null ? defaultRate : centsToEuroStr(team.data?.settings?.default_hourly_rate_cents ?? null);
  const effDefaultCost = defaultCost != null ? defaultCost : centsToEuroStr(team.data?.settings?.default_cost_rate_cents ?? null);

  async function addMember() {
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) { toast.error("Bitte eine gültige E-Mail-Adresse angeben."); return; }
    if (memberEmails.has(em)) { toast.info("Diese E-Mail ist schon berechtigt — die Zeile steht unten in der Liste."); return; }
    try {
      const res = await upsert.mutateAsync({ email: em, display_name: name.trim() || undefined });
      if (!res.ok) { toast.error("Anlegen fehlgeschlagen: " + (res.error || "")); return; }
      toast.success(`${name.trim() || em} berechtigt. Konto: die Person registriert sich selbst mit genau dieser E-Mail unter app.useeasy.ai (Kachel „Mitarbeiter“).`);
      setEmail(""); setName("");
    } catch { toast.error("Anlegen fehlgeschlagen."); }
  }

  async function zugangGeben(v: TeamVertriebler) {
    if (!v.email) { toast.error(`Am Vertriebler-Eintrag „${v.name}“ fehlt die E-Mail — unter Voice & Co-Pilot ergänzen, dann klappt der Zugang.`); return; }
    const em = v.email.toLowerCase();
    if (memberEmails.has(em)) return;
    try {
      const res = await upsert.mutateAsync({ email: em, display_name: v.name || undefined });
      if (!res.ok) { toast.error("Zugang anlegen fehlgeschlagen: " + (res.error || "")); return; }
      toast.success(`Berechtigung für ${v.name} angelegt. Konto: registriert sich selbst mit ${em} unter app.useeasy.ai (Kachel „Mitarbeiter“).`);
    } catch { toast.error("Zugang anlegen fehlgeschlagen."); }
  }

  async function toggleActive(m: TeamMember) {
    try {
      if (m.active) {
        const res = await remove.mutateAsync({ email: m.email });
        if (!res.ok) { toast.error("Deaktivieren fehlgeschlagen."); return; }
        toast.success(`${m.display_name || m.email}: Berechtigung deaktiviert — die Konsole ist zu. Das Login-Konto und alle Zeiteinträge bleiben bestehen.`);
      } else {
        const res = await upsert.mutateAsync({ email: m.email, hourly_rate_cents: m.hourly_rate_cents, cost_rate_cents: m.cost_rate_cents, role: m.role, active: true });
        if (!res.ok) { toast.error("Aktivieren fehlgeschlagen."); return; }
        toast.success(`${m.display_name || m.email} wieder berechtigt.`);
      }
    } catch { toast.error("Änderung fehlgeschlagen."); }
  }

  async function saveMemberRate(m: TeamMember, v: string) {
    const rc = v.trim() ? euroStrToCents(v) : null;
    if (v.trim() && rc == null) { toast.error("Abrechnungssatz ungültig."); return; }
    if (rc === m.hourly_rate_cents) return;
    try {
      await upsert.mutateAsync({ email: m.email, hourly_rate_cents: rc, cost_rate_cents: m.cost_rate_cents, role: m.role, active: m.active });
      toast.success("Abrechnungssatz gespeichert (gilt für NEUE Einträge; bestehende behalten ihren Satz).");
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }
  async function saveMemberCost(m: TeamMember, v: string) {
    const cc = v.trim() ? euroStrToCents(v) : null;
    if (v.trim() && cc == null) { toast.error("Lohnsatz ungültig."); return; }
    if (cc === (m.cost_rate_cents ?? null)) return;
    try {
      await upsert.mutateAsync({ email: m.email, hourly_rate_cents: m.hourly_rate_cents, cost_rate_cents: cc, role: m.role, active: m.active });
      toast.success("Lohnsatz gespeichert (gilt für NEUE Einträge; bestehende behalten ihren Satz).");
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }
  async function saveDefaultRate() {
    const rc = (effDefaultRate || "").trim() ? euroStrToCents(effDefaultRate) : null;
    if ((effDefaultRate || "").trim() && rc == null) { toast.error("Abrechnungssatz ungültig."); return; }
    const cc = (effDefaultCost || "").trim() ? euroStrToCents(effDefaultCost) : null;
    if ((effDefaultCost || "").trim() && cc == null) { toast.error("Lohnsatz ungültig."); return; }
    try {
      const res = await saveSettings.mutateAsync({ default_hourly_rate_cents: rc, default_cost_rate_cents: cc });
      if (!res.ok) { toast.error("Speichern fehlgeschlagen."); return; }
      toast.success("Standard-Sätze gespeichert.");
      setDefaultRate(null); setDefaultCost(null);
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }

  async function saveProvisionPct(v: TeamVertriebler, value: string) {
    const s = value.trim().replace(",", ".");
    let pct: number | null = null;
    if (s !== "") {
      pct = Number(s);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.error("Provision: 0 bis 100 Prozent, leer ist erlaubt."); return; }
      pct = Math.round(pct * 100) / 100;
    }
    if (pct === (v.provision_pct ?? null)) return;
    try {
      const res = await saveProvision.mutateAsync({ rep_id: v.rep_id, provision_pct: pct });
      if (!res.ok) { toast.error(res.hinweis || res.error || "Provision speichern fehlgeschlagen."); return; }
      toast.success(pct == null ? `Provision für ${v.name} entfernt.` : `Provision für ${v.name}: ${pctToStr(pct)} % gespeichert.`);
    } catch (e) {
      const payload = (e && typeof e === "object" && "payload" in e)
        ? (e as { payload?: { hinweis?: string; error?: string } }).payload : undefined;
      toast.error(payload?.hinweis || (payload?.error === "provision_migration_missing"
        ? "Migration fehlt: MIGRATION-TEAM-UMBAU-PROVISION.sql ausführen."
        : "Provision speichern fehlgeschlagen."));
    }
  }

  const vertriebSorted = [...vertrieb].sort((a, b) => {
    if ((a.aktiv !== false) !== (b.aktiv !== false)) return a.aktiv !== false ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });

  return (
    <div className="space-y-6" data-team-umbau="team-umbau-v1">
      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="verguetung">Vergütung &amp; Sätze</TabsTrigger>
        </TabsList>

        {/* ══ Reiter 1: Team — die EINE Liste ══════════════════════════════ */}
        <TabsContent value="team" className="mt-4 space-y-6">
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold">Team — ein Team für alle</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Alle Mitarbeiter an einem Ort: Zeiterfassung und Vertrieb, mit Rolle, E-Mail und Zugang.
              Der Zugang hat zwei Teile: die <b>Berechtigung</b> (legst du hier an) und das <b>Konto</b> —
              jede Person registriert sich selbst mit <b>genau ihrer E-Mail</b> unter{" "}
              <span className="font-mono text-xs">app.useeasy.ai</span> (Kachel „Mitarbeiter“, E-Mail + Passwort).
              Zeiterfassungs-Mitarbeiter sehen ihre Zeiterfassung; Vertriebler sehen ihre Arbeitsfläche
              mit Fällen, Terminen, Anrufen und Zeiten.
            </p>
            {kontoQuelle && kontoQuelle !== "supabase" && !team.isLoading && (
              <p className="text-xs text-amber-500">
                Der Konto-Status ist gerade nicht abrufbar — die Spalte zeigt „unbekannt“. Die Liste selbst ist vollständig.
              </p>
            )}

            {loadFailed && (
              <QueryErrorNotice
                label="Die Team-Liste konnte nicht geladen werden."
                onRetry={() => team.refetch()}
                retrying={team.isFetching}
              />
            )}

            {/* Anlegen: nur E-Mail + Name — Geld steht im Reiter Vergütung. */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-end">
              <div><Label className="text-xs">E-Mail *</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mitarbeiter@firma.de" className="h-9" /></div>
              <div><Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Max Geselle" className="h-9" /></div>
              <Button onClick={addMember} disabled={upsert.isPending} className="h-9">
                {upsert.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Anlegen
              </Button>
            </div>

            {/* Die eine Liste */}
            <div className="space-y-2">
              {team.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
              {!team.isLoading && !loadFailed && zeilen.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  Noch niemand im Team. Lege oben die erste Person an; sie registriert sich danach
                  selbst mit derselben E-Mail unter app.useeasy.ai.
                </p>
              )}
              {zeilen.map((z) => {
                const aktiv = z.member ? z.member.active : z.vertrieb?.aktiv !== false;
                const konto: KontoStatus | undefined = z.member?.konto ?? z.vertrieb?.konto;
                const berechtigt = z.member ? z.member.active : z.vertrieb?.berechtigung === true;
                return (
                  <div key={z.key} className={`rounded-lg border p-3 space-y-2 ${aktiv ? "" : "opacity-60"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{z.name}</span>
                          <RolleBadges z={z} />
                          {!aktiv && <Badge variant="outline" className="text-[10px]">inaktiv</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {z.email || "keine E-Mail hinterlegt — unter Voice & Co-Pilot ergänzen"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {berechtigt
                          ? <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30" title="tenant_members-Zeile aktiv — die Konsole lässt dieses Team-Mitglied rein.">berechtigt</Badge>
                          : z.vertrieb && (
                            <Button size="sm" variant="outline" className="h-8" disabled={upsert.isPending}
                              onClick={() => { void zugangGeben(z.vertrieb as TeamVertriebler); }}
                              title="Legt die Berechtigung (tenant_members) an. Das Login-Konto erstellt die Person selbst.">
                              <KeyRound className="mr-1 h-3.5 w-3.5" /> Zugang geben
                            </Button>
                          )}
                        <KontoBadge konto={konto} />
                        {z.member && (
                          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { void toggleActive(z.member as TeamMember); }}
                            title={z.member.active
                              ? "Berechtigung deaktivieren — sperrt den Konsolen-Zugang. Das Login-Konto bleibt bestehen."
                              : "Berechtigung wieder aktivieren"}>
                            {z.member.active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-primary" />}
                          </Button>
                        )}
                      </div>
                    </div>
                    {z.vertrieb && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
                        <span className="text-[11px] text-muted-foreground">Schnellzugriffe:</span>
                        {z.vertrieb.copilot_link && (
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]">
                            <a href={z.vertrieb.copilot_link} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1 h-3 w-3" /> Co-Pilot öffnen
                            </a>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]">
                          <Link to={`/voice?tab=calls&rep=${encodeURIComponent(z.vertrieb.rep_id)}`}>
                            <PhoneCall className="mr-1 h-3 w-3" /> Anrufverlauf
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]">
                          <Link to={`/voice?tab=faelle&rep=${encodeURIComponent(z.vertrieb.rep_id)}`}>
                            <FolderOpen className="mr-1 h-3 w-3" /> Zugeordnete Leads
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Vertriebler anlegen und Fachverwaltung (Rufnummer, Skript, Deployment):{" "}
              <Link to="/voice?tab=copilot" className="text-primary underline-offset-2 hover:underline">Voice &amp; Co-Pilot</Link>.
              Der Team-Tab verlinkt nur dorthin, verwaltet wird dort.
            </p>
          </div>
        </TabsContent>

        {/* ══ Reiter 2: Vergütung & Sätze ══════════════════════════════════ */}
        <TabsContent value="verguetung" className="mt-4 space-y-6">
          <div className="glass-card p-6 space-y-3">
            <h2 className="text-base font-semibold">Sätze je Mitglied</h2>
            <p className="text-sm text-muted-foreground">
              <b>Abrechnung</b> = was der Kunde für die Stunden zahlt (Kundenrechnung). <b>Lohn</b> = was du
              dem Mitarbeiter zahlst (Mitarbeiter-Abrechnung). Beide getrennt, beide optional — sie gelten
              für neue Einträge, bestehende behalten ihren Satz (Schnappschuss-Prinzip).
            </p>
            <div className="space-y-2">
              {team.isLoading && <Skeleton className="h-12 w-full" />}
              {members.map((m) => (
                <div key={m.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${m.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <span className="font-medium text-sm truncate">{m.display_name || m.email}</span>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-24">
                      <Input defaultValue={centsToEuroStr(m.hourly_rate_cents)} placeholder="Abr. €" className="h-8 text-right text-xs"
                        onBlur={(e) => { void saveMemberRate(m, e.target.value); }} title="Abrechnungssatz €/Std (Kunde) — gilt für neue Einträge" />
                    </div>
                    <div className="w-24">
                      <Input defaultValue={centsToEuroStr(m.cost_rate_cents ?? null)} placeholder="Lohn €" className="h-8 text-right text-xs"
                        onBlur={(e) => { void saveMemberCost(m, e.target.value); }} title="Lohnsatz €/Std (was du zahlst) — gilt für neue Einträge" />
                    </div>
                  </div>
                </div>
              ))}
              {!team.isLoading && members.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">Noch keine Mitglieder — im Reiter „Team“ anlegen.</p>
              )}
            </div>
          </div>

          <div className="glass-card p-6 space-y-3">
            <h2 className="text-base font-semibold">Standard-Sätze</h2>
            <p className="text-sm text-muted-foreground">
              Gelten für Mitglieder ohne eigenen Satz (Schnappschuss beim Erfassen — spätere Änderungen
              verfälschen alte Einträge nicht). Ohne jeden Satz bleibt der Preis offen („Preis bitte eintragen“).
            </p>
            <div className="flex items-end gap-2 flex-wrap">
              <div><Label className="text-xs">Abrechnung €/Std (Kunde)</Label>
                <Input value={effDefaultRate} onChange={(e) => setDefaultRate(e.target.value)} placeholder="z. B. 60,00" className="h-9 w-32" /></div>
              <div><Label className="text-xs">Lohn €/Std (Mitarbeiter)</Label>
                <Input value={effDefaultCost} onChange={(e) => setDefaultCost(e.target.value)} placeholder="z. B. 20,00" className="h-9 w-32" /></div>
              <Button onClick={saveDefaultRate} disabled={saveSettings.isPending} className="h-9" variant="outline">
                {saveSettings.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Speichern
              </Button>
            </div>
          </div>

          <div className="glass-card p-6 space-y-3">
            <h2 className="text-base font-semibold">Provision je Vertriebler</h2>
            <p className="text-sm text-muted-foreground">
              Ein freies Prozent-Feld je Vertriebler — du trägst die Zahl selbst ein, leer ist erlaubt.
              Hier steht immer der <b>aktuelle</b> Satz; künftige Provisionsabrechnungen kopieren ihn beim
              Entstehen des Anspruchs, spätere Änderungen verfälschen alte Ansprüche also nicht.
            </p>
            {!team.isLoading && team.data && !provisionVerfuegbar && (
              <p className="text-xs text-amber-500">
                Die Provisions-Tabelle fehlt noch in der Datenbank — einmal{" "}
                <span className="font-mono">MIGRATION-TEAM-UMBAU-PROVISION.sql</span> ausführen, dann sind die Felder frei.
              </p>
            )}
            <div className="space-y-2">
              {team.isLoading && <Skeleton className="h-12 w-full" />}
              {vertriebSorted.map((v) => (
                <div key={v.rep_id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${v.aktiv !== false ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{v.name}</span>
                      {v.aktiv === false && <Badge variant="outline" className="text-[10px]">inaktiv</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{v.email || v.rep_id}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input key={`${v.rep_id}-${v.provision_pct ?? "leer"}`} defaultValue={pctToStr(v.provision_pct)} placeholder="—"
                      disabled={!provisionVerfuegbar || saveProvision.isPending}
                      className="h-8 w-20 text-right text-xs"
                      onBlur={(e) => { void saveProvisionPct(v, e.target.value); }}
                      title="Provision in Prozent (0 bis 100), leer erlaubt — speichert beim Verlassen des Feldes" />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
              {!team.isLoading && vertriebSorted.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  Keine Vertriebler gefunden — anlegen unter{" "}
                  <Link to="/voice?tab=copilot" className="text-primary underline-offset-2 hover:underline">Voice &amp; Co-Pilot</Link>.
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Datenschutz: Zeitdaten deiner Beschäftigten bleiben in der EU (Frankfurt), Mitarbeiter sehen nur
            die eigenen Einträge, Export nur durch dich.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
