import { useState } from "react";
import { Clock, FolderOpen, CalendarPlus, PhoneCall } from "lucide-react";
import { EmployeeLayout } from "@/components/layout/EmployeeLayout";
import FaelleTab from "@/components/FaelleTab";
import TerminBlock from "@/components/TerminBlock";
import { AnrufVerlaufTab } from "@/components/AnrufVerlaufTab";
import Zeiterfassung from "@/pages/Zeiterfassung";

/**
 * Schnitt B4a (11.08.2026) — die Arbeitsflaeche des Mitarbeiters.
 *
 * Vorher rendete EmployeeSwitch fest die Zeiterfassung, egal welcher Pfad
 * aufgerufen wurde. Fuer einen Vertriebler war das eine Sackgasse: seine Faelle
 * lagen seit dem 11.08. in der Konsole, er kam nur nie an sie heran.
 *
 * Leon-Entscheid 11.08.: volle Arbeitsflaeche. Faelle, Termin anlegen,
 * Anrufverlauf und Zeiterfassung in einer Oberflaeche, damit niemand zwischen
 * Konsole und Co-Pilot wechseln muss.
 *
 * Bewusst KEIN Router: das Mitarbeiter-Frontend faengt jeden Pfad ab (siehe
 * EmployeeSwitch in App.tsx), eigene Routen waeren also nur Schein. Der zuletzt
 * gewaehlte Bereich ueberlebt das Neuladen, damit ein Vertriebler nach jedem
 * Wechsel nicht wieder bei den Zeiten landet.
 *
 * Alle vier Bausteine sind bestehende, eigenstaendige Komponenten ohne
 * Eigenschaften — sie werden hier NUR eingehaengt, nicht nachgebaut
 * (Umzugsplan §3: wiederverwenden statt nachbauen). Was ein Mitarbeiter darin
 * sehen darf, entscheidet weiterhin das Backend: die Fall-Route liefert einem
 * Vertriebler nur seine eigenen Faelle, und `sicht: 'alle'` aendert daran
 * nichts.
 */

const BEREICHE = [
  { key: "faelle", label: "Fälle", icon: FolderOpen },
  { key: "termin", label: "Termin", icon: CalendarPlus },
  { key: "anrufe", label: "Anrufe", icon: PhoneCall },
  { key: "zeiten", label: "Zeiten", icon: Clock },
] as const;

type BereichKey = (typeof BEREICHE)[number]["key"];

const SPEICHER = "ue_employee_bereich";

function gemerkterBereich(): BereichKey {
  if (typeof window === "undefined") return "faelle";
  const v = window.localStorage.getItem(SPEICHER);
  return BEREICHE.some((b) => b.key === v) ? (v as BereichKey) : "faelle";
}

export function EmployeeWorkspace({ displayName }: { displayName?: string | null }) {
  const [bereich, setBereich] = useState<BereichKey>(gemerkterBereich);

  const waehle = (key: BereichKey) => {
    setBereich(key);
    try { window.localStorage.setItem(SPEICHER, key); } catch { /* privater Modus: dann eben nicht */ }
  };

  const aktiv = BEREICHE.find((b) => b.key === bereich) ?? BEREICHE[0];

  const nav = (
    <nav className="max-w-6xl mx-auto px-2 flex items-stretch gap-1 overflow-x-auto">
      {BEREICHE.map((b) => {
        const Icon = b.icon;
        const an = b.key === bereich;
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => waehle(b.key)}
            aria-current={an ? "page" : undefined}
            className={
              "flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors " +
              (an
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {b.label}
          </button>
        );
      })}
    </nav>
  );

  const aufkleber = (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center gap-1 shrink-0">
      <aktiv.icon className="w-3 h-3" /> {aktiv.label}
    </span>
  );

  return (
    <EmployeeLayout displayName={displayName} bereich={aufkleber} nav={nav}>
      {bereich === "faelle" && <FaelleTab />}
      {bereich === "termin" && <TerminBlock />}
      {bereich === "anrufe" && <AnrufVerlaufTab />}
      {bereich === "zeiten" && <Zeiterfassung />}
    </EmployeeLayout>
  );
}

export default EmployeeWorkspace;
