import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

/**
 * Redesign 07.07.2026: Globale Suche (Cmd-K) in der Topbar.
 * V1 bewusst client-seitig: Seiten, Signale-Bereiche und Einstellungs-Tabs.
 * Kein Backend-Call, keine neuen Endpunkte.
 */
type Entry = { label: string; to: string; group: string; keywords?: string };

const ENTRIES: Entry[] = [
  { label: "Heute", to: "/", group: "Arbeit", keywords: "uebersicht dashboard start briefing" },
  { label: "Freigaben", to: "/review", group: "Arbeit", keywords: "review queue entwurf draft freigeben" },
  { label: "Verlauf", to: "/audit", group: "Arbeit", keywords: "audit trail historie undo entscheidungen" },
  { label: "Forderungen", to: "/forderungen", group: "Arbeit", keywords: "zahlungserinnerung mahnung dunning" },
  { label: "Angebote", to: "/angebote", group: "Arbeit", keywords: "offer angebot dokument" },
  { label: "Rechnungen", to: "/rechnungen", group: "Arbeit", keywords: "invoice zugferd rechnung" },
  { label: "Gesundheit (Signale)", to: "/signale", group: "Signale", keywords: "health index score kpi" },
  { label: "Frühwarnung", to: "/fruehwarnung", group: "Signale", keywords: "risk shield compliance radar alerts warnung" },
  { label: "Chancen", to: "/chancen", group: "Signale", keywords: "foerderung foerder-radar zuschuss upsell" },
  { label: "Jana fragen", to: "/signale?sec=jana", group: "Signale", keywords: "chat assistent erklaeren warum" },
  { label: "Förder-Radar", to: "/signale?sec=foerder", group: "Signale", keywords: "foerderung zuschuss programme" },
  { label: "Playbooks", to: "/playbooks", group: "System", keywords: "regeln pack branchen paket" },
  { label: "Datenquellen", to: "/datenquellen", group: "System", keywords: "quellen verbinden bank stripe shopify coverage" },
  { label: "Voice & Co-Pilot", to: "/voice", group: "System", keywords: "jana telefon anrufe vertriebler copilot" },
  { label: "Onboarding & Demos", to: "/onboarding", group: "System", keywords: "tour demo lernen" },
  { label: "Einstellungen · Allgemein", to: "/einstellungen", group: "Einstellungen", keywords: "postfach mailbox mfa konto" },
  { label: "Einstellungen · Unternehmenswissen", to: "/einstellungen?tab=knowledge", group: "Einstellungen", keywords: "wissensbasis dokumente" },
  { label: "Einstellungen · Jana-Wissen", to: "/einstellungen?tab=jana-wissen", group: "Einstellungen", keywords: "regeln briefing wizard" },
  { label: "Einstellungen · Excel Live-Sync", to: "/einstellungen?tab=spreadsheet", group: "Einstellungen", keywords: "spreadsheet tabelle xlsx" },
  { label: "Einstellungen · Integrationen", to: "/einstellungen?tab=integrations", group: "Einstellungen", keywords: "hubspot microsoft telegram dhl onedrive" },
  { label: "Einstellungen · Email-Autopilot", to: "/einstellungen?tab=email-autopilot", group: "Einstellungen", keywords: "stufen reife shadow assisted autonomous" },
  { label: "Einstellungen · Autopilot Audit", to: "/einstellungen?tab=email-autopilot-audit", group: "Einstellungen", keywords: "audit stichproben pruefen" },
  { label: "Einstellungen · Jana-Autopilot (Voice)", to: "/einstellungen?tab=autopilot", group: "Einstellungen", keywords: "voice anrufzeiten telefon" },
  { label: "Einstellungen · Abo & Zusatz", to: "/einstellungen?tab=billing", group: "Einstellungen", keywords: "billing plan add-on upgrade" },
  { label: "Einstellungen · KI-Transparenz", to: "/einstellungen?tab=ki-transparenz", group: "Einstellungen", keywords: "zero export audit log llm" },
];

const GROUPS = ["Arbeit", "Signale", "System", "Einstellungen"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ue:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ue:cmdk", onOpen);
    };
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Suchen: Seite, Bereich, Einstellung …" />
      <CommandList>
        <CommandEmpty>Nichts gefunden.</CommandEmpty>
        {GROUPS.map((g) => (
          <CommandGroup key={g} heading={g}>
            {ENTRIES.filter((e) => e.group === g).map((e) => (
              <CommandItem
                key={e.to + e.label}
                value={`${e.label} ${e.keywords ?? ""}`}
                onSelect={() => go(e.to)}
              >
                {e.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
