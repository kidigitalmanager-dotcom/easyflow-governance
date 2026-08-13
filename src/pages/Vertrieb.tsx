// -----------------------------------------------------------------------------
// Vertrieb.tsx — die operative Arbeitsflaeche (12.08.2026, Leons Auftrag).
//
// Leon: *"meine console wird langsam extrem voll und muss besser strukturiert
// werden, weshalb ich dort lieber einen tab zum Telefonieren haette mit dem
// namen vertrieb woraus ich telefonieren kann und die daten dort auch zu
// finden sind, die leads, die faelle, die anrufe, Termine, skripte einwaende"*
// und, auf die Rueckfrage: *"das sollte nicht mit dem arbeitsfeld gemixed
// werden"*.
//
// 🔴 Diese Seite baut NICHTS nach. Faelle, Termin und Anrufe sind dieselben
// Komponenten wie unter System — nur auf mich gefiltert. Dieselbe Quelle,
// zwei Linsen. Wer eines davon hier neu schreibt, hat den Zweck der
// Entscheidung verfehlt (Umzugsplan §3).
//
// Was unter System bleibt und hier ABSICHTLICH fehlt: Rufnummern und
// Einladungen, DSGVO-Consent, KI-Agenten, Co-Pilot-Rollouts, das Hochladen
// und Zuweisen von Listen, die Skript-PFLEGE und die Sicht ueber ALLE
// Vertriebler. Das ist Verwaltung, und Verwaltung ist hier nicht zuhause.
// -----------------------------------------------------------------------------
import { useSearchParams } from "react-router-dom";
import { Headphones, ListChecks, FolderOpen, PhoneCall, CalendarPlus, BookOpenCheck, Users } from "lucide-react";
import { REITER, REITER_LABEL, reiterAus, type ReiterKey } from "@/lib/vertrieb";
import { useVertriebRep } from "@/hooks/use-vertrieb-rep";
import { PageHeader } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { TelefonReiter } from "@/components/vertrieb/TelefonReiter";
import { MeineLeadListen } from "@/components/vertrieb/MeineLeadListen";
import { MeineSkripte } from "@/components/vertrieb/MeineSkripte";
import FaelleTab from "@/components/FaelleTab";
import TerminBlock from "@/components/TerminBlock";
import SalesCallsAuditTab from "@/components/SalesCallsAuditTab";
import { cn } from "@/lib/utils";

const ICON: Record<ReiterKey, typeof Headphones> = {
  telefon: Headphones,
  leads: ListChecks,
  faelle: FolderOpen,
  calls: PhoneCall,
  termin: CalendarPlus,
  scripts: BookOpenCheck,
};

const UNTERTITEL: Record<ReiterKey, string> = {
  telefon: "Skript, Einwände und das Gespräch — alles auf einem Bild.",
  leads: "Die Listen, mit denen du telefonierst.",
  faelle: "Jeder Lead, an dem du gearbeitet hast: Status, Termin, Frist und der volle Verlauf.",
  calls: "Deine Gespräche mit Ergebnis, Dauer und Aufzeichnung.",
  termin: "Aus dem vereinbarten Zeitpunkt einen Kalendereintrag machen und die Einladung verschicken.",
  scripts: "Womit du telefonierst. Gepflegt wird zentral unter System.",
};

export default function Vertrieb() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = reiterAus(searchParams.get("tab"));
  const rep = useVertriebRep();

  const oeffne = (v: ReiterKey) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (v === "telefon") n.delete("tab"); else n.set("tab", v);
      return n;
    }, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Vertrieb"
        title={REITER_LABEL[tab]}
        subtitle={UNTERTITEL[tab]}
      />

      {/* ── Als wer arbeite ich? ─────────────────────────────────────────────
          🔴 Steht ganz oben und nicht versteckt in einem Menue: alles darunter
          haengt daran. Geraten wird nicht — die Zuordnung kommt aus der
          Konto-Adresse, und wenn die nicht passt, wird gefragt statt den
          ersten Vertriebler aus der Liste zu nehmen. */}
      {rep.fehler ? (
        <QueryErrorNotice
          label="Die Vertriebler konnten nicht geladen werden."
          onRetry={rep.neuLaden}
        />
      ) : rep.auswahl.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-muted/30 px-3 py-2">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">
            {rep.repId ? "Du arbeitest als" : "Als wen möchtest du arbeiten?"}
          </span>
          <select
            value={rep.repId ?? ""}
            onChange={(e) => rep.waehle(e.target.value || null)}
            className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
          >
            <option value="">bitte wählen</option>
            {rep.auswahl.map((r) => (
              <option key={r.rep_id} value={r.rep_id}>{r.name}</option>
            ))}
          </select>
          {rep.herkunft === "konto" && (
            <span className="text-[11px] text-muted-foreground">aus deiner Anmeldung erkannt</span>
          )}
          {rep.herkunft === "einziger" && (
            <span className="text-[11px] text-muted-foreground">der einzige aktive Vertriebler</span>
          )}
        </div>
      ) : !rep.laedt ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-500">
          Es ist kein aktiver Vertriebler angelegt. Das passiert unter System, Voice &amp; Co-Pilot, Vertriebler.
        </p>
      ) : null}

      {/* ── Reiter ───────────────────────────────────────────────────────── */}
      <nav className="flex items-stretch gap-1 overflow-x-auto border-b border-line-soft">
        {REITER.map((r) => {
          const Icon = ICON[r];
          const an = r === tab;
          return (
            <button
              key={r}
              type="button"
              onClick={() => oeffne(r)}
              aria-current={an ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                an ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {REITER_LABEL[r]}
            </button>
          );
        })}
      </nav>

      <div className="animate-fade-up space-y-4">
        {tab === "telefon" && <TelefonReiter clientId={rep.rep?.client_id ?? null} repName={rep.name} repId={rep.repId} />}
        {tab === "leads" && <MeineLeadListen repId={rep.repId} repName={rep.name} />}
        {/* Das Backend erzwingt bei den Faellen ohnehin die eigene Sicht —
            deshalb hier bewusst ohne zusaetzlichen Filter. */}
        {tab === "faelle" && <FaelleTab />}
        {tab === "calls" && <SalesCallsAuditTab festerRep={rep.repId ?? ""} />}
        {tab === "termin" && <TerminBlock />}
        {tab === "scripts" && <MeineSkripte clientId={rep.rep?.client_id ?? null} repName={rep.name} />}
      </div>
    </div>
  );
}
