// -----------------------------------------------------------------------------
// BillingProfileForm.tsx (Phase 2a) - Verkaeufer-Stammdaten (tenant_billing_profile).
// Pflicht fuer eine finalisierbare Rechnung (Paragraph 14 UStG): Firma, Anschrift,
// USt-IdNr ODER Steuernummer. IBAN/BIC/Bank sind Zahlungshinweise. KEIN LLM.
// -----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { useBillingProfile, useUpdateBillingProfile } from "@/hooks/use-api";
import type { BillingProfile } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const EMPTY: BillingProfile = {
  company_name: "", address_line1: "", address_line2: "", postal_code: "", city: "", country_code: "DE",
  vat_id: "", tax_number: "", iban: "", bic: "", bank_name: "", contact_email: "", contact_phone: "",
  contact_web: "", logo_url: "", invoice_prefix: "RE", default_payment_terms_days: 14, kleinunternehmer: false,
};

export function BillingProfileForm({ onSaved }: { onSaved?: () => void }) {
  const q = useBillingProfile();
  const upd = useUpdateBillingProfile();
  const [form, setForm] = useState<BillingProfile>(EMPTY);
  const [loadedKey, setLoadedKey] = useState<string>("");

  useEffect(() => {
    if (q.data && loadedKey !== "loaded") {
      const p = q.data.profile;
      setForm(p ? { ...EMPTY, ...p, country_code: p.country_code || "DE", invoice_prefix: p.invoice_prefix || "RE", default_payment_terms_days: p.default_payment_terms_days ?? 14, kleinunternehmer: !!p.kleinunternehmer } : EMPTY);
      setLoadedKey("loaded");
    }
  }, [q.data, loadedKey]);

  const set = (patch: Partial<BillingProfile>) => setForm((f) => ({ ...f, ...patch }));
  const complete = !!(form.company_name && form.address_line1 && form.postal_code && form.city && (form.vat_id || form.tax_number));

  async function save() {
    try {
      await upd.mutateAsync(form);
      toast.success("Stammdaten gespeichert.");
      onSaved?.();
    } catch {
      toast.error("Speichern fehlgeschlagen.");
    }
  }

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-4">
      <div className={"flex items-start gap-2 rounded-lg border p-3 text-sm " + (complete ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800")}>
        {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{complete
          ? "Stammdaten vollständig - Rechnungen können finalisiert werden."
          : "Pflichtangaben (§14 UStG) fehlen noch: Firma, Anschrift und USt-IdNr oder Steuernummer. Ohne diese lässt sich keine Rechnung finalisieren."}</span>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Firma & Anschrift</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label className="text-xs">Firmenname *</Label>
            <Input value={form.company_name ?? ""} onChange={(e) => set({ company_name: e.target.value })} className="h-8" /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Straße + Nr. *</Label>
            <Input value={form.address_line1 ?? ""} onChange={(e) => set({ address_line1: e.target.value })} className="h-8" /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Adresszusatz</Label>
            <Input value={form.address_line2 ?? ""} onChange={(e) => set({ address_line2: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">PLZ *</Label>
            <Input value={form.postal_code ?? ""} onChange={(e) => set({ postal_code: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">Ort *</Label>
            <Input value={form.city ?? ""} onChange={(e) => set({ city: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">Land</Label>
            <Input value={form.country_code ?? "DE"} onChange={(e) => set({ country_code: e.target.value.toUpperCase().slice(0, 2) })} className="h-8" placeholder="DE" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Steuer</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">USt-IdNr</Label>
            <Input value={form.vat_id ?? ""} onChange={(e) => set({ vat_id: e.target.value })} className="h-8" placeholder="DE123456789" /></div>
          <div><Label className="text-xs">Steuernummer (Alternative)</Label>
            <Input value={form.tax_number ?? ""} onChange={(e) => set({ tax_number: e.target.value })} className="h-8" placeholder="12/345/67890" /></div>
          <div className="sm:col-span-2 flex items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <Label className="text-sm">§19 Kleinunternehmer</Label>
              <p className="text-[11px] text-muted-foreground">Rechnungen werden ohne Umsatzsteuer ausgewiesen (pro Rechnung überschreibbar).</p>
            </div>
            <Switch checked={!!form.kleinunternehmer} onCheckedChange={(v) => set({ kleinunternehmer: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Bankverbindung & Rechnungsnummer</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Bank</Label>
            <Input value={form.bank_name ?? ""} onChange={(e) => set({ bank_name: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">IBAN</Label>
            <Input value={form.iban ?? ""} onChange={(e) => set({ iban: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">BIC</Label>
            <Input value={form.bic ?? ""} onChange={(e) => set({ bic: e.target.value })} className="h-8" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Rechnungs-Präfix</Label>
              <Input value={form.invoice_prefix ?? "RE"} onChange={(e) => set({ invoice_prefix: e.target.value })} className="h-8" placeholder="RE" /></div>
            <div><Label className="text-xs">Zahlungsziel (Tage)</Label>
              <Input value={form.default_payment_terms_days == null ? "" : String(form.default_payment_terms_days)} inputMode="numeric"
                onChange={(e) => set({ default_payment_terms_days: e.target.value === "" ? null : (parseInt(e.target.value, 10) || 0) })} className="h-8" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Kontakt (optional, für die Rechnung)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">E-Mail</Label>
            <Input value={form.contact_email ?? ""} onChange={(e) => set({ contact_email: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">Telefon</Label>
            <Input value={form.contact_phone ?? ""} onChange={(e) => set({ contact_phone: e.target.value })} className="h-8" /></div>
          <div><Label className="text-xs">Web</Label>
            <Input value={form.contact_web ?? ""} onChange={(e) => set({ contact_web: e.target.value })} className="h-8" /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={upd.isPending}>
          {upd.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Stammdaten speichern
        </Button>
      </div>
    </div>
  );
}
