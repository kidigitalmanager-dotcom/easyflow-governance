import { useState } from "react";
import {
  useVoiceReps,
  useVoiceRepUpdate,
  useVoiceRepDelete,
  useVoiceRepInvite,
  useNumberSearch,
  useNumberBuy,
} from "@/hooks/use-api";
import type { VoiceRep, CallerIdStatus, TwilioAvailableNumber } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Phone, PhoneOff, Pencil, CheckCircle2, Clock, XCircle,
  Loader2, PhoneCall, RotateCcw, Info, UserPlus, Copy, ShoppingCart, Search,
} from "lucide-react";
import { toast } from "sonner";

const CALLER_ID_META: Record<CallerIdStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  validated:  { label: "Verifiziert",     cls: "text-green-500 bg-green-500/10 border-green-500/20",  Icon: CheckCircle2 },
  pending:    { label: "Ausstehend",      cls: "text-amber-400 bg-amber-400/10 border-amber-400/20",  Icon: Clock },
  unverified: { label: "Nicht verifiziert", cls: "text-red-400 bg-red-400/10 border-red-400/20",      Icon: XCircle },
};

function CallerIdBadge({ status }: { status: CallerIdStatus }) {
  const meta = CALLER_ID_META[status] ?? CALLER_ID_META.pending;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

const REP_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface RepFormState {
  rep_id: string;
  name: string;
  email: string;
  twilio_number: string;
  caller_id_status: CallerIdStatus;
}

const EMPTY_FORM: RepFormState = {
  rep_id: "", name: "", email: "", twilio_number: "", caller_id_status: "pending",
};

export default function VoiceRepsTab() {
  const { data, isLoading, error } = useVoiceReps();
  const updateMut = useVoiceRepUpdate();
  const deleteMut = useVoiceRepDelete();
  const inviteMut = useVoiceRepInvite();
  const searchMut = useNumberSearch();
  const buyMut = useNumberBuy();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VoiceRep | null>(null);
  const [form, setForm] = useState<RepFormState>(EMPTY_FORM);

  // ── Invite ──
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRepId, setInviteRepId] = useState("");
  const [inviteRepIdTouched, setInviteRepIdTouched] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteVariant, setInviteVariant] = useState<"jana" | "cold-only">("jana");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // ── Nummer kaufen ──
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyRep, setBuyRep] = useState<VoiceRep | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<TwilioAvailableNumber[] | null>(null);
  const [price, setPrice] = useState<{ amount: string | null; unit: string | null }>({ amount: null, unit: null });
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

  const reps = data?.reps ?? [];
  const effectiveRepId = inviteRepIdTouched ? inviteRepId : slugify(inviteName);

  const openEdit = (rep: VoiceRep) => {
    setEditing(rep);
    setForm({
      rep_id: rep.rep_id,
      name: rep.name,
      email: rep.email ?? "",
      twilio_number: rep.twilio_number ?? "",
      caller_id_status: rep.caller_id_status,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    try {
      if (!editing) return;
      await updateMut.mutateAsync({
        repId: editing.rep_id,
        payload: {
          name: form.name.trim(),
          email: form.email.trim() || null,
          twilio_number: form.twilio_number.trim() || null,
          caller_id_status: form.caller_id_status,
        },
      });
      toast.success(`${form.name} aktualisiert`);
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  };

  const toggleActive = async (rep: VoiceRep) => {
    try {
      await updateMut.mutateAsync({ repId: rep.rep_id, payload: { active: !rep.active } });
      toast.success(rep.active ? `${rep.name} deaktiviert` : `${rep.name} reaktiviert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };

  const removeRep = async (rep: VoiceRep) => {
    try {
      await deleteMut.mutateAsync(rep.rep_id);
      toast.success(`${rep.name} deaktiviert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deaktivieren fehlgeschlagen");
    }
  };

  // ── Invite handlers ──
  const openInvite = () => {
    setInviteRepId(""); setInviteRepIdTouched(false); setInviteName("");
    setInviteEmail(""); setInviteVariant("jana"); setInviteUrl(null);
    setInviteOpen(true);
  };

  const submitInvite = async () => {
    const repId = effectiveRepId;
    if (!REP_ID_RE.test(repId)) {
      toast.error("Ungültige Kennung (nur Kleinbuchstaben, Ziffern, Bindestriche; 2–63 Zeichen)");
      return;
    }
    if (inviteName.trim().length < 2) { toast.error("Name zu kurz"); return; }
    try {
      const res = await inviteMut.mutateAsync({
        rep_id: repId,
        display_name: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
        variant: inviteVariant,
      });
      if (!res.ok) { toast.error(res.error || "Einladen fehlgeschlagen"); return; }
      setInviteUrl(res.deployed_url ?? null);
      toast.success(res.already_existed ? `${inviteName} war bereits angelegt — neu bereitgestellt` : `${inviteName} eingeladen`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Einladen fehlgeschlagen");
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Kopiert"); }
    catch { toast.error("Kopieren fehlgeschlagen"); }
  };

  // ── Nummer kaufen handlers ──
  const openBuy = (rep: VoiceRep) => {
    setBuyRep(rep); setAreaCode(""); setResults(null);
    setPrice({ amount: null, unit: null }); setSelectedNumber(null);
    setBuyOpen(true);
  };

  const runSearch = async () => {
    try {
      const res = await searchMut.mutateAsync({
        country: "DE", type: "local", areaCode: areaCode.trim() || undefined, limit: 20,
      });
      if (!res.ok) { toast.error(res.message || res.error || "Suche fehlgeschlagen"); return; }
      setResults(res.numbers);
      setPrice({ amount: res.monthly_price, unit: res.price_unit });
      setSelectedNumber(null);
      if (res.numbers.length === 0) toast.info("Keine Nummern gefunden — anderen Vorwahlbereich probieren");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suche fehlgeschlagen");
    }
  };

  const priceLabel = price.amount != null
    ? `${price.amount} ${price.unit ?? ""}`.trim() + " / Monat"
    : "Preis unbekannt";

  const confirmBuy = async () => {
    if (!buyRep || !selectedNumber) return;
    try {
      const res = await buyMut.mutateAsync({ rep_id: buyRep.rep_id, phone_number: selectedNumber, country: "DE" });
      if (!res.ok) {
        toast.error(res.twilio_message || res.error || "Kauf fehlgeschlagen");
        return;
      }
      toast.success(`${selectedNumber} gekauft und ${buyRep.name} als Caller-ID zugewiesen`);
      setBuyOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kauf fehlgeschlagen");
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Vertriebler &amp; Telefonnummern</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lade Vertriebler ein (Co-Pilot-Zugang wird automatisch bereitgestellt) und kaufe pro
              Vertriebler direkt eine Rufnummer als Caller-ID.
            </p>
          </div>
          <Button onClick={openInvite} className="gap-1.5 shrink-0">
            <UserPlus className="w-3.5 h-3.5" />
            Vertriebler einladen
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-400">Vertriebler konnten nicht geladen werden.</p>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : reps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <PhoneCall className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Noch keine Vertriebler angelegt</p>
            <p className="text-xs text-muted-foreground/70">
              {data?.note === "voice_tables_not_migrated"
                ? "Voice-Tabellen sind noch nicht migriert (migration_v1.13)."
                : "Klicke auf „Vertriebler einladen“, um den ersten anzulegen."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reps.map((rep) => (
              <div key={rep.rep_id} className="flex items-center gap-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${rep.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{rep.name}</p>
                    {!rep.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">inaktiv</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {rep.twilio_number ?? "keine Nummer zugewiesen"}
                    {rep.email && <span className="text-muted-foreground/60"> · {rep.email}</span>}
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <CallerIdBadge status={rep.caller_id_status} />
                  <p className="text-[11px] text-muted-foreground">
                    {rep.call_count} Anruf{rep.call_count === 1 ? "" : "e"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="sm" onClick={() => openBuy(rep)}
                    title={rep.twilio_number ? "Andere Nummer kaufen" : "Nummer kaufen"}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(rep)} title="Bearbeiten">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {rep.active ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" title="Deaktivieren">
                          <PhoneOff className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{rep.name} deaktivieren?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Der Vertriebler kann keine Anrufe mehr tätigen. Bestehende Anrufe bleiben
                            in der Audit-Historie erhalten. Reaktivieren ist jederzeit möglich.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeRep(rep)}>Deaktivieren</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(rep)} title="Reaktivieren">
                      <RotateCcw className="w-3.5 h-3.5 text-green-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Vertriebler einladen ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vertriebler einladen</DialogTitle>
            <DialogDescription>
              Legt den Co-Pilot-Zugang automatisch an. Der Link wird einmalig angezeigt — kopiere ihn
              und schicke ihn dem Vertriebler.
            </DialogDescription>
          </DialogHeader>

          {inviteUrl === null ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Kennung (Slug)</label>
                <input
                  value={effectiveRepId}
                  onChange={(e) => { setInviteRepIdTouched(true); setInviteRepId(e.target.value.toLowerCase()); }}
                  placeholder="z. B. leon-vertrieb"
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Kleinbuchstaben, Ziffern, Bindestriche. Wird automatisch aus dem Namen erzeugt.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">E-Mail (optional)</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@firma.de"
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Skript-Variante</label>
                <select
                  value={inviteVariant}
                  onChange={(e) => setInviteVariant(e.target.value as "jana" | "cold-only")}
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                >
                  <option value="jana">Mit Jana (Warm-Transfer)</option>
                  <option value="cold-only">Nur Kaltakquise</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-xs text-green-500 bg-green-500/10 border border-green-500/20 rounded-md px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Vertriebler bereitgestellt. Kopiere den Zugangslink jetzt — er wird nicht erneut angezeigt.</span>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Co-Pilot-Zugang</label>
                <div className="flex gap-2">
                  <input
                    readOnly value={inviteUrl}
                    className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button variant="outline" size="sm" onClick={() => copy(inviteUrl)} className="shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {inviteUrl === null ? (
              <>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>Abbrechen</Button>
                <Button onClick={submitInvite} disabled={inviteMut.isPending || inviteName.trim().length < 2}>
                  {inviteMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Einladen
                </Button>
              </>
            ) : (
              <Button onClick={() => setInviteOpen(false)}>Fertig</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Nummer kaufen ── */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nummer kaufen{buyRep ? ` für ${buyRep.name}` : ""}</DialogTitle>
            <DialogDescription>
              Deutsche Ortsrufnummer suchen, Preis prüfen und mit Bestätigung kaufen. Die Nummer wird
              automatisch als Caller-ID des Vertrieblers gesetzt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <label className="text-sm font-medium">Vorwahl (optional)</label>
                <input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="z. B. 30 (Berlin), 89 (München)"
                  className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <Button variant="outline" onClick={runSearch} disabled={searchMut.isPending} className="gap-1.5">
                {searchMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Suchen
              </Button>
            </div>

            {results && results.length > 0 && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{results.length} Nummern verfügbar</span>
                  <span className="font-medium">{priceLabel}</span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-border border border-border rounded-md">
                  {results.map((n) => (
                    <button
                      key={n.phone_number}
                      type="button"
                      onClick={() => setSelectedNumber(n.phone_number)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm ${selectedNumber === n.phone_number ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    >
                      <span className="font-mono">{n.friendly_name || n.phone_number}</span>
                      <span className="text-xs text-muted-foreground">{n.locality ?? ""}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {results && results.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Nummern gefunden — anderen Vorwahlbereich probieren.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuyOpen(false)}>Abbrechen</Button>
            <Button
              onClick={confirmBuy}
              disabled={buyMut.isPending || !selectedNumber}
              title={selectedNumber ? `${selectedNumber} kaufen (${priceLabel})` : "Erst eine Nummer wählen"}
            >
              {buyMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {selectedNumber ? `Kaufen · ${selectedNumber} (${priceLabel})` : "Kaufen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bearbeiten ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `${editing.name} bearbeiten` : "Vertriebler bearbeiten"}</DialogTitle>
            <DialogDescription>
              Name, E-Mail, Twilio-Nummer und Caller-ID-Status anpassen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Vor- und Nachname"
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">E-Mail (optional)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@firma.de"
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Twilio-Nummer (E.164, optional)</label>
              <input
                value={form.twilio_number}
                onChange={(e) => setForm((f) => ({ ...f, twilio_number: e.target.value }))}
                placeholder="+4930123456"
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Caller-ID-Status</label>
              <select
                value={form.caller_id_status}
                onChange={(e) => setForm((f) => ({ ...f, caller_id_status: e.target.value as CallerIdStatus }))}
                className="w-full bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
              >
                <option value="validated">Verifiziert</option>
                <option value="pending">Ausstehend</option>
                <option value="unverified">Nicht verifiziert</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={submit} disabled={updateMut.isPending || !form.name.trim()}>
              {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Rufnummern werden direkt hier gekauft und automatisch als Caller-ID gesetzt. Neue
          Vertriebler lädst du über „Vertriebler einladen“ ein — der Co-Pilot-Zugang wird sofort
          bereitgestellt.
        </span>
      </div>
    </div>
  );
}
