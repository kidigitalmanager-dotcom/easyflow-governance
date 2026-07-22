// -----------------------------------------------------------------------------
// TeamTab (v4.132.0) — Einstellungen → Team: Mitarbeiter anlegen (E-Mail, Name,
// Stundensatz), aktiv/inaktiv, Tenant-Default-Stundensatz. Der Mitarbeiter
// registriert sich mit GENAU dieser E-Mail unter app.useeasy.ai (bestehender
// Login) und sieht dann AUSSCHLIESSLICH den Zeiterfassungs-Bereich.
// -----------------------------------------------------------------------------
import { useState } from "react";
import { useTeamMembers, useUpsertTeamMember, useDeleteTeamMember, useUpdateTimeSettings } from "@/hooks/use-api";
import type { TeamMember } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Users, Plus, Loader2, UserX, UserCheck, Info } from "lucide-react";

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

export function TeamTab() {
  const team = useTeamMembers(true);
  const upsert = useUpsertTeamMember();
  const remove = useDeleteTeamMember();
  const saveSettings = useUpdateTimeSettings();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [defaultRate, setDefaultRate] = useState<string | null>(null);

  const members = team.data?.members || [];
  const backendMissing = team.isError; // 403/404 vor Deploy/Migration
  const effDefaultRate = defaultRate != null ? defaultRate : centsToEuroStr(team.data?.settings?.default_hourly_rate_cents ?? null);

  async function addMember() {
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) { toast.error("Bitte eine gültige E-Mail-Adresse angeben."); return; }
    const rc = rate.trim() ? euroStrToCents(rate) : null;
    if (rate.trim() && rc == null) { toast.error("Stundensatz ungültig (z. B. 65,00)."); return; }
    try {
      const res = await upsert.mutateAsync({ email: em, display_name: name.trim() || undefined, hourly_rate_cents: rc });
      if (!res.ok) { toast.error("Anlegen fehlgeschlagen: " + (res.error || "")); return; }
      toast.success(`${name.trim() || em} angelegt. Login: mit dieser E-Mail unter app.useeasy.ai registrieren.`);
      setEmail(""); setName(""); setRate("");
    } catch { toast.error("Anlegen fehlgeschlagen."); }
  }
  async function toggleActive(m: TeamMember) {
    try {
      if (m.active) {
        const res = await remove.mutateAsync({ email: m.email });
        if (!res.ok) { toast.error("Deaktivieren fehlgeschlagen."); return; }
        toast.success(`${m.display_name || m.email} deaktiviert — Login ist gesperrt, Zeiteinträge bleiben erhalten.`);
      } else {
        const res = await upsert.mutateAsync({ email: m.email, hourly_rate_cents: m.hourly_rate_cents, role: m.role, active: true });
        if (!res.ok) { toast.error("Aktivieren fehlgeschlagen."); return; }
        toast.success(`${m.display_name || m.email} wieder aktiv.`);
      }
    } catch { toast.error("Änderung fehlgeschlagen."); }
  }
  async function saveMemberRate(m: TeamMember, v: string) {
    const rc = v.trim() ? euroStrToCents(v) : null;
    if (v.trim() && rc == null) { toast.error("Stundensatz ungültig."); return; }
    if (rc === m.hourly_rate_cents) return;
    try {
      await upsert.mutateAsync({ email: m.email, hourly_rate_cents: rc, role: m.role, active: m.active });
      toast.success("Stundensatz gespeichert (gilt für NEUE Einträge; bestehende behalten ihren Satz).");
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }
  async function saveDefaultRate() {
    const rc = (effDefaultRate || "").trim() ? euroStrToCents(effDefaultRate) : null;
    if ((effDefaultRate || "").trim() && rc == null) { toast.error("Satz ungültig."); return; }
    try {
      const res = await saveSettings.mutateAsync({ default_hourly_rate_cents: rc });
      if (!res.ok) { toast.error("Speichern fehlgeschlagen."); return; }
      toast.success("Standard-Stundensatz gespeichert.");
      setDefaultRate(null);
    } catch { toast.error("Speichern fehlgeschlagen."); }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Team &amp; Mitarbeiter-Logins</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Lege deine Mitarbeiter mit E-Mail und Stundensatz an. Jeder Mitarbeiter registriert sich mit <b>genau dieser E-Mail</b> unter{" "}
          <span className="font-mono text-xs">app.useeasy.ai</span> und sieht dann ausschließlich die Zeiterfassung — keine Postfächer, keine Einstellungen.
        </p>

        {backendMissing && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-400/10 p-3 text-sm text-amber-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Team-Verwaltung ist auf dem Server noch nicht aktiv (Deploy v4.132.0 + Migration ausstehend).</span>
          </div>
        )}

        {/* Anlegen */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_auto] items-end">
          <div><Label className="text-xs">E-Mail *</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mitarbeiter@firma.de" className="h-9" /></div>
          <div><Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Max Geselle" className="h-9" /></div>
          <div><Label className="text-xs">Satz €/Std</Label>
            <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="65,00" className="h-9" /></div>
          <Button onClick={addMember} disabled={upsert.isPending} className="h-9">
            {upsert.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Anlegen
          </Button>
        </div>

        {/* Liste */}
        <div className="space-y-2">
          {team.isLoading && <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>}
          {!team.isLoading && !backendMissing && members.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Noch keine Mitarbeiter angelegt.</p>
          )}
          {members.map((m) => (
            <div key={m.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${m.active ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{m.display_name || m.email}</span>
                  {m.role === "owner" && <Badge variant="secondary" className="text-[10px]">Team-Owner</Badge>}
                  {!m.active && <Badge variant="outline" className="text-[10px]">deaktiviert</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-24">
                  <Input defaultValue={centsToEuroStr(m.hourly_rate_cents)} placeholder="Satz €" className="h-8 text-right text-xs"
                    onBlur={(e) => saveMemberRate(m, e.target.value)} title="Stundensatz €/Std — gilt für neue Einträge" />
                </div>
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => toggleActive(m)}
                  title={m.active ? "Deaktivieren (Login sperren)" : "Wieder aktivieren"}>
                  {m.active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-primary" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default-Satz */}
      <div className="glass-card p-6 space-y-3">
        <h2 className="text-base font-semibold">Standard-Stundensatz</h2>
        <p className="text-sm text-muted-foreground">
          Gilt für Mitarbeiter ohne eigenen Satz (Schnappschuss beim Erfassen — spätere Änderungen verfälschen alte Einträge nicht).
          Ohne jeden Satz bleibt der Preis bei der Übernahme offen („Preis bitte eintragen").
        </p>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">Satz €/Std</Label>
            <Input value={effDefaultRate} onChange={(e) => setDefaultRate(e.target.value)} placeholder="z. B. 60,00" className="h-9 w-32" /></div>
          <Button onClick={saveDefaultRate} disabled={saveSettings.isPending} className="h-9" variant="outline">
            {saveSettings.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Speichern
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Datenschutz: Zeitdaten deiner Beschäftigten bleiben in der EU (Frankfurt), Mitarbeiter sehen nur die eigenen Einträge, Export nur durch dich.
        </p>
      </div>
    </div>
  );
}
