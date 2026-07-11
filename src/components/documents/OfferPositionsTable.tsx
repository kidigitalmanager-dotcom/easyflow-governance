// ─────────────────────────────────────────────────────────────────────────────
// OfferPositionsTable.tsx — editierbarer Positions-Tisch mit SOFORTIGER
// Live-Neuberechnung (offer-calc, Spiegel der Server-Engine). "Preis eintragen"-
// Feld fuer individuelle Positionen, §13b/§19-Schalter, Gesamt-Rabatt, Skonto.
// Der Server rechnet beim Speichern IMMER neu (autoritativ) — dies ist nur die UX.
// ─────────────────────────────────────────────────────────────────────────────
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle, Info } from "lucide-react";
import { computeOffer, fmtEUR, type OfferPosition, type OfferOpts } from "@/lib/offer-calc";

export type OfferDraftState = {
  positions: OfferPosition[];
  opts: OfferOpts;
  subject: string;
  cover_text: string;
  valid_until: string;
  doc_number: string;
  counterpart_name: string;
  counterpart_email: string;
};

function isoToDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "");
}
function deToIso(v: string): string {
  const s = (v || "").trim();
  const m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return s; // schon ISO oder leer
}

export function OfferPositionsTable({
  state, onChange, readOnly = false,
}: {
  state: OfferDraftState;
  onChange: (s: OfferDraftState) => void;
  readOnly?: boolean;
}) {
  const { positions, opts } = state;
  const computed = computeOffer(positions, opts);
  const zeroVat = !!opts.reverse_charge || !!opts.kleinunternehmer;

  const set = (patch: Partial<OfferDraftState>) => onChange({ ...state, ...patch });
  const setOpts = (patch: Partial<OfferOpts>) => set({ opts: { ...opts, ...patch } });
  const updatePos = (i: number, patch: Partial<OfferPosition>) => {
    const next = positions.map((p, j) => (j === i ? { ...p, ...patch } : p));
    set({ positions: next });
  };
  const addPos = () =>
    set({ positions: [...positions, { beschreibung: "", menge: 1, einheit: "Stk", einzelpreis_netto: null, mwst_satz: 19, rabatt_prozent: 0, price_source: "manual" }] });
  const removePos = (i: number) => set({ positions: positions.filter((_, j) => j !== i) });

  return (
    <div className="space-y-4">
      {/* Positions-Tisch */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-[220px]">Beschreibung</TableHead>
              <TableHead className="w-20">Menge</TableHead>
              <TableHead className="w-24">Einheit</TableHead>
              <TableHead className="w-32">Einzelpreis (netto)</TableHead>
              <TableHead className="w-24">MwSt</TableHead>
              <TableHead className="w-20">Rabatt %</TableHead>
              <TableHead className="w-28 text-right">Netto</TableHead>
              {!readOnly && <TableHead className="w-10"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.length === 0 && (
              <TableRow>
                <TableCell colSpan={readOnly ? 8 : 9} className="text-center text-sm text-muted-foreground py-6">
                  Noch keine Positionen. {readOnly ? "" : "Fügen Sie eine Position hinzu oder generieren Sie aus einer Anfrage."}
                </TableCell>
              </TableRow>
            )}
            {positions.map((p, i) => {
              const c = computed.positions[i] || {};
              const needsPrice = c.needs_price === true;
              const hasErr = Array.isArray(c.errors) && c.errors.length > 0;
              return (
                <TableRow key={i} className={hasErr ? "bg-destructive/5" : undefined}>
                  <TableCell className="text-xs text-muted-foreground">{c.pos ?? i + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={(p.beschreibung as string) ?? ""}
                      disabled={readOnly}
                      onChange={(e) => updatePos(i, { beschreibung: e.target.value })}
                      placeholder="Leistung / Artikel"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={p.menge == null ? "" : String(p.menge)}
                      disabled={readOnly}
                      inputMode="decimal"
                      onChange={(e) => updatePos(i, { menge: e.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={(p.einheit as string) ?? ""}
                      disabled={readOnly}
                      onChange={(e) => updatePos(i, { einheit: e.target.value })}
                      placeholder="Stk"
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <Input
                        value={p.einzelpreis_netto == null ? "" : String(p.einzelpreis_netto)}
                        disabled={readOnly}
                        inputMode="decimal"
                        onChange={(e) => updatePos(i, { einzelpreis_netto: e.target.value === "" ? null : e.target.value })}
                        placeholder={needsPrice ? "Preis eintragen" : "0,00"}
                        className={"h-8 " + (needsPrice ? "border-amber-400 bg-amber-50 placeholder:text-amber-600" : "")}
                        title={needsPrice && p.preis_vorschlag != null ? `Unverbindlicher Vorschlag: ${fmtEUR(p.preis_vorschlag as number)}` : undefined}
                      />
                      {needsPrice && p.preis_vorschlag != null && (
                        <span className="mt-0.5 block text-[10px] text-amber-600">Vorschlag: {fmtEUR(p.preis_vorschlag as number)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <select
                      value={zeroVat ? 0 : (p.mwst_satz ?? 19)}
                      disabled={readOnly || zeroVat}
                      onChange={(e) => updatePos(i, { mwst_satz: Number(e.target.value) })}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                    >
                      <option value={0}>0%</option>
                      <option value={7}>7%</option>
                      <option value={19}>19%</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={p.rabatt_prozent == null ? "" : String(p.rabatt_prozent)}
                      disabled={readOnly}
                      inputMode="decimal"
                      onChange={(e) => updatePos(i, { rabatt_prozent: e.target.value === "" ? 0 : Number(e.target.value) })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {c.netto == null ? <span className="text-amber-600">—</span> : fmtEUR(c.netto)}
                    {p.price_source === "price_list" && <Badge variant="secondary" className="ml-1 text-[9px]">Liste</Badge>}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePos(i)} title="Position entfernen">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addPos}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Position hinzufügen
        </Button>
      )}

      {/* Steuer- / Rabatt- / Skonto-Steuerung */}
      {!readOnly && (
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-sm">§13b Reverse-Charge</Label>
              <p className="text-[11px] text-muted-foreground">Bauleistung an Unternehmer → USt = 0</p>
            </div>
            <Switch checked={!!opts.reverse_charge} onCheckedChange={(v) => setOpts({ reverse_charge: v })} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-sm">§19 Kleinunternehmer</Label>
              <p className="text-[11px] text-muted-foreground">Keine Umsatzsteuer (aus Ihren Regeln)</p>
            </div>
            <Switch checked={!!opts.kleinunternehmer} onCheckedChange={(v) => setOpts({ kleinunternehmer: v })} />
          </div>
          <div>
            <Label className="text-xs">Gesamt-Rabatt (%)</Label>
            <Input value={opts.rabatt_gesamt_prozent == null ? "" : String(opts.rabatt_gesamt_prozent)} inputMode="decimal"
              onChange={(e) => setOpts({ rabatt_gesamt_prozent: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Skonto (%)</Label>
              <Input value={opts.skonto_prozent == null ? "" : String(opts.skonto_prozent)} inputMode="decimal"
                onChange={(e) => setOpts({ skonto_prozent: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" />
            </div>
            <div>
              <Label className="text-xs">Skonto-Tage</Label>
              <Input value={opts.skonto_tage == null ? "" : String(opts.skonto_tage)} inputMode="numeric"
                onChange={(e) => setOpts({ skonto_tage: e.target.value === "" ? null : Number(e.target.value) })} className="h-8" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Gültig bis</Label>
            <Input value={isoToDe(state.valid_until)} placeholder="TT.MM.JJJJ"
              onChange={(e) => set({ valid_until: deToIso(e.target.value) })} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Angebots-Nr. (optional)</Label>
            <Input value={state.doc_number} onChange={(e) => set({ doc_number: e.target.value })} className="h-8" />
          </div>
        </div>
      )}

      {/* Summen */}
      <div className="ml-auto max-w-sm space-y-1 rounded-lg border p-4 text-sm">
        <Row label="Zwischensumme (netto)" value={fmtEUR(computed.totals.netto)} />
        {computed.totals.rabatt_gesamt_betrag > 0 && <Row label="Gesamt-Rabatt" value={"− " + fmtEUR(computed.totals.rabatt_gesamt_betrag)} />}
        {computed.totals.mwst_7 > 0 && <Row label="zzgl. 7% MwSt" value={fmtEUR(computed.totals.mwst_7)} />}
        {computed.totals.mwst_19 > 0 && <Row label="zzgl. 19% MwSt" value={fmtEUR(computed.totals.mwst_19)} />}
        {zeroVat && <Row label="Umsatzsteuer" value="0,00 EUR" muted />}
        <div className="border-t pt-1">
          <Row label="Gesamt (brutto)" value={fmtEUR(computed.totals.brutto)} bold />
        </div>
        {computed.totals.skonto_betrag != null && (
          <Row label={`abzgl. ${computed.totals.skonto_prozent}% Skonto`} value={fmtEUR(computed.totals.skonto_brutto)} muted />
        )}
      </div>

      {/* Unvollstaendig-Banner */}
      {computed.incomplete && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Mindestens eine Position hat noch keinen Preis. Tragen Sie die offenen Preise ein — vorher lässt sich das Angebot nicht freigeben.</span>
        </div>
      )}
      {computed.errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {computed.errors.join(" · ")}
        </div>
      )}
      {computed.totals.hinweise.length > 0 && (
        <div className="space-y-1">
          {computed.totals.hinweise.map((h, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" />{h}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-semibold" : "") + (muted ? " text-muted-foreground" : "")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
