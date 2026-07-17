import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useRecentEmails, useAuditLog } from "@/hooks/use-api";
import { humanizeCategory, prettyRedaction } from "@/data/humanize";

/**
 * Redesign 07.07.2026: Globale Suche (Cmd-K) in der Topbar.
 * Client-seitig: Seiten, Signale-Bereiche, Einstellungs-Tabs — plus E-Mail-Suche
 * (Follow-up) über die vorhandenen Fenster /emails/recent (Freigaben) und /audit
 * (Verlauf): Betreff, Absender/Postfach, Kategorie. Der Mail-BODY ist bewusst nicht
 * durchsuchbar (wird aus PII-Gruenden nicht persistiert) — dafuer waere ein eigener
 * api-router-Endpunkt noetig. Treffer springen zu /review?item= bzw. /audit?item=&q=.
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

const NEEDS_ACTION = new Set(["pending", "needs_review", "pending_review"]);

function EmailSearchResults({ q, onGo }: { q: string; onGo: (to: string) => void }) {
  const { data: emails, isLoading: l1 } = useRecentEmails();
  const { data: audit, isLoading: l2 } = useAuditLog();
  const needle = q.toLowerCase();

  const review = (emails ?? [])
    .filter((e) => e.has_draft || NEEDS_ACTION.has(e.status))
    .filter((e) => `${e.subject} ${e.sender} ${humanizeCategory(e.action_type)}`.toLowerCase().includes(needle))
    .slice(0, 5);
  const reviewIds = new Set(review.map((r) => r.id));
  const hist = (audit ?? [])
    .filter((a) => !reviewIds.has(a.id))
    .filter((a) => `${a.subject} ${a.mailbox} ${humanizeCategory(a.category)}`.toLowerCase().includes(needle))
    .slice(0, 6);

  if (l1 || l2) {
    return (
      <CommandGroup heading="E-Mails">
        <CommandItem value={`laden ${q}`} disabled>Durchsuche E-Mails …</CommandItem>
      </CommandGroup>
    );
  }
  if (review.length === 0 && hist.length === 0) return null;

  return (
    <CommandGroup heading="E-Mails (Betreff · Absender · Kategorie)">
      {review.map((e) => (
        <CommandItem
          key={`r-${e.id}`}
          value={`email ${e.subject} ${e.sender} ${q}`}
          onSelect={() => onGo(`/review?item=${encodeURIComponent(e.id)}`)}
        >
          <div className="flex flex-col min-w-0">
            <span className="truncate">{prettyRedaction(e.subject)}</span>
            <span className="text-[10px] text-muted-foreground truncate">{e.sender} · wartet auf Freigabe</span>
          </div>
        </CommandItem>
      ))}
      {hist.map((a) => (
        <CommandItem
          key={`a-${a.id}`}
          value={`email ${a.subject} ${a.mailbox} ${q}`}
          onSelect={() => onGo(`/audit?item=${encodeURIComponent(a.id)}&q=${encodeURIComponent(q)}`)}
        >
          <div className="flex flex-col min-w-0">
            <span className="truncate">{prettyRedaction(a.subject)}</span>
            <span className="text-[10px] text-muted-foreground truncate">{a.mailbox} · Verlauf · {a.timestamp}</span>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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
    setQ("");
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Suchen: E-Mail, Seite, Bereich, Einstellung …" />
      <CommandList>
        <CommandEmpty>Nichts gefunden.</CommandEmpty>
        {q.trim().length >= 2 && <EmailSearchResults q={q.trim()} onGo={go} />}
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
