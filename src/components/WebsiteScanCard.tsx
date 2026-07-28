import { useState } from "react";
import { toast } from "sonner";
import { Globe, Loader2, Check, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/ue/primitives";
import { useTenantSetupSelf, useSaveTenantSetupSelf } from "@/hooks/use-api";

// ---------------------------------------------------------------------------
// Website-Scan (Briefing C, Baustein 1 bis 5).
//
// Leon-Vorgabe 28.07.: der Scan laeuft beim Onboarding automatisch, darf aber
// nicht unsichtbar bleiben. Diese Karte ist die sichtbare Stelle. Sie zeigt
// genau einen von fuenf Zustaenden und sagt in jedem Fall, was als Naechstes
// passiert. Keine Fortschrittsbalken ohne Inhalt, keine erfundenen Zahlen:
// alles kommt aus tenant-setup.website_scan.
//
// Zwei Einbauorte: prominent in den Einstellungen (immer) und als Banner auf
// der Uebersicht (nur wenn der Kunde etwas tun soll, variant="banner").
// ---------------------------------------------------------------------------

const KAT_LABEL: Record<string, string> = {
  produkt: "Produkte und Leistungen",
  lieferung: "Versand und Lieferzeit",
  ruecknahme: "Rückgabe und Widerruf",
  zahlung: "Zahlungsarten",
  erreichbarkeit: "Erreichbarkeit und Zeiten",
  ansprechpartner: "Ansprechpartner",
  standort: "Standort und Liefergebiet",
  rechtliches: "Rechtliches und Garantien",
};
const katLabel = (k: string) => KAT_LABEL[k] ?? k;

function normalizeInput(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export default function WebsiteScanCard({ variant = "full" }: { variant?: "full" | "banner" }) {
  const { data, isLoading, isError } = useTenantSetupSelf();
  const save = useSaveTenantSetupSelf();
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);

  const scan = data?.website_scan;
  // Die anzuzeigende Adresse: was der Kunde hinterlegt hat, sonst die, die der
  // letzte Crawl tatsaechlich gelesen hat. Postfaecher bei gmail/gmx/web.de
  // leiten keine Adresse ab - ohne diesen Rueckgriff staende hier nichts.
  const shownUrl = scan?.website_url ?? scan?.last_crawl?.url ?? null;

  // Kein Backend-Feld (aeltere api-router-Version) oder Query kaputt: lieber gar
  // nichts zeigen als etwas Falsches behaupten.
  if (isError || (!isLoading && !scan)) return null;

  if (isLoading) {
    return variant === "banner" ? null : (
      <SectionCard title="Ihre Website" bodyClassName="p-4">
        <Skeleton className="h-16 w-full" />
      </SectionCard>
    );
  }
  if (!scan) return null;

  const submit = () => {
    const value = normalizeInput(url);
    if (!value) { toast.error("Bitte die Adresse Ihrer Website eintragen."); return; }
    save.mutate(
      { website: { website_url: value } },
      {
        onSuccess: () => {
          setEditing(false);
          setUrl("");
          toast.success("Adresse gespeichert. Wir lesen Ihre Website jetzt. Das dauert ein bis zwei Minuten.");
        },
        onError: (e: Error) => toast.error(e.message || "Speichern fehlgeschlagen"),
      },
    );
  };

  const inputRow = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="ihre-firma.de"
        className="h-9 max-w-xs text-[13px]"
        autoFocus={editing}
      />
      <Button size="sm" onClick={submit} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Website lesen
      </Button>
      {editing && (
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setUrl(""); }}>
          Abbrechen
        </Button>
      )}
    </div>
  );

  // ── Der Zustand, den der Kunde sehen soll ────────────────────────────────
  let tone: "action" | "running" | "ok" | "problem" = "ok";
  let headline = "";
  let body: React.ReactNode = null;

  if (!scan.available) {
    // Migration v1.44 fehlt: ehrlich benennen statt eine leere Karte zeigen.
    tone = "problem";
    headline = "Website-Erkennung noch nicht freigeschaltet";
    body = <p className="text-[12.5px] text-muted-foreground">Diese Funktion wird gerade für Ihr Konto vorbereitet. Sie müssen nichts tun.</p>;
  } else if (scan.state === "missing") {
    tone = "action";
    headline = "Wir kennen Ihre Website noch nicht";
    body = (
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted-foreground">
          Aus Ihrer Website lesen wir einmalig heraus, was Ihr Betrieb anbietet, wie Sie liefern und wann Sie
          erreichbar sind. Jede Angabe legen wir Ihnen einzeln zur Bestätigung vor, nichts wird automatisch verwendet.
        </p>
        {inputRow}
      </div>
    );
  } else if (scan.state === "running" || scan.state === "not_scanned") {
    tone = "running";
    headline = "Wir lesen gerade Ihre Website";
    body = (
      <p className="text-[12.5px] text-muted-foreground">
        {shownUrl}. Das dauert ein bis zwei Minuten. Danach finden Sie die gefundenen Angaben unter
        „Jana-Wissen“.
      </p>
    );
  } else if (scan.state === "failed") {
    tone = "problem";
    headline = "Wir konnten Ihre Website nicht lesen";
    body = (
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted-foreground">
          {scan.last_crawl?.error === "robots.txt disallows crawling"
            ? `${shownUrl} erlaubt kein automatisches Lesen. Sie können die Angaben stattdessen unter „Jana-Wissen“ in Ruhe selbst eintragen.`
            : `Unter ${shownUrl} war kein lesbarer Text zu finden. Das passiert bei Seiten, die ihren Inhalt erst im Browser aufbauen. Prüfen Sie die Adresse oder tragen Sie die Angaben unter „Jana-Wissen“ selbst ein.`}
        </p>
        {editing ? inputRow : (
          <Button size="sm" variant="outline" onClick={() => { setEditing(true); setUrl(shownUrl ?? ""); }}>
            Andere Adresse eintragen
          </Button>
        )}
      </div>
    );
  } else if (scan.state === "review_pending") {
    tone = "action";
    headline = `${scan.facts.proposed} Angaben auf Ihrer Website gefunden`;
    body = (
      <div className="space-y-3">
        <p className="text-[12.5px] text-muted-foreground">
          Wir haben {shownUrl} gelesen. Jede Angabe ist mit dem Satz belegt, auf dem sie beruht. Bitte
          einmal durchsehen und bestätigen, erst dann verwendet Jana sie.
        </p>
        {scan.categories_missing.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            Nicht auf Ihrer Website gefunden: {scan.categories_missing.map(katLabel).join(", ")}. Diese Punkte
            fragen wir Sie kurz selbst.
          </p>
        )}
        <Button size="sm" asChild>
          <Link to="/einstellungen?tab=jana-wissen">
            Angaben durchsehen <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    );
  } else {
    tone = "ok";
    headline = "Ihre Website ist eingelesen";
    body = (
      <div className="space-y-2">
        <p className="text-[12.5px] text-muted-foreground">
          {[
            shownUrl,
            scan.facts.confirmed > 0 ? `${scan.facts.confirmed} bestätigte Angaben` : null,
            scan.last_crawl?.chunks ? `${scan.last_crawl.chunks} Textabschnitte gelesen` : null,
          ].filter(Boolean).join(", ")}.
        </p>
        {scan.categories_missing.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">
            Offen geblieben: {scan.categories_missing.map(katLabel).join(", ")}.
          </p>
        )}
        {editing ? inputRow : (
          <Button size="sm" variant="ghost" className="px-0 text-[12px]" onClick={() => { setEditing(true); setUrl(shownUrl ?? ""); }}>
            Andere Adresse verwenden
          </Button>
        )}
      </div>
    );
  }

  const Icon = tone === "running" ? Loader2 : tone === "problem" ? AlertTriangle : tone === "ok" ? Check : Globe;
  const iconCls =
    tone === "running" ? "h-4 w-4 animate-spin text-muted-foreground"
    : tone === "problem" ? "h-4 w-4 text-amber"
    : tone === "ok" ? "h-4 w-4 text-emerald-light"
    : "h-4 w-4 text-primary";

  // Banner auf der Uebersicht: nur zeigen, wenn der Kunde wirklich etwas tun soll.
  if (variant === "banner") {
    if (tone !== "action" && tone !== "problem") return null;
    return (
      <div className="animate-fade-up rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`${iconCls} mt-0.5 shrink-0`} />
          <div className="min-w-0 space-y-2">
            <p className="text-[13px] font-medium text-foreground">{headline}</p>
            {body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Icon className={iconCls} />
          Ihre Website
        </span>
      }
      subtitle="Was Jana über Ihren Betrieb aus Ihrer eigenen Website weiß: belegt, nie automatisch übernommen."
      bodyClassName="p-4 space-y-2"
    >
      <p className="text-[13px] font-medium text-foreground">{headline}</p>
      {body}
    </SectionCard>
  );
}
