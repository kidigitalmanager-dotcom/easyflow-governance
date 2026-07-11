// Copy + step/milestone metadata for the V6 Jana-Onboarding-Coach.
// Pure data (no React, no lucide) -> icons + rendering live in the components.
// Explanations are STATIC (0 LLM cost, instant); every step names its Beleg (KPI + Quelle)
// and "Frag Jana dazu" opens the real jana-chat for follow-ups.
import type { MilestoneId } from "@/lib/onboarding";

// Which Signale sub-section a tour step needs active. Matches Signale.tsx SectionKey.
export type TourSection = "signale" | "quellen" | "freigabe" | "jana";

export type TourStep = {
  key: string;
  section?: TourSection;  // (Signale-Demo) welcher /signale-Unterbereich aktiv sein muss
  route?: string;         // Zielroute, die der Runner VOR dem Step ansteuert (Szenario-Runner)
  target?: string;        // data-tour="..." element to spotlight/scroll to
  title: string;
  body: string;           // Jana's static explanation (honest, plain German)
  source?: string;        // short Beleg/Quelle line ("jede Zahl belegt")
  janaStarter?: string;   // question shown on the "Frag Jana dazu" affordance
};

// The guided tour: KPI-by-KPI through /signale, each number explained on first sight.
export const TOUR_STEPS: TourStep[] = [
  {
    key: "welcome",
    section: "signale",
    target: "header",
    title: "Willkommen bei deinen Signalen",
    body: "Ich bin Jana. Ich fasse deine Frühwarn-Signale zusammen und erkläre dir jede Zahl. Diese kurze Tour zeigt dir in unter einer Minute, was du hier siehst. Du kannst jederzeit überspringen.",
    source: "Alle Werte sind aggregierte 0-100-Kennzahlen, PII-frei, EU/Frankfurt.",
  },
  {
    key: "health",
    section: "signale",
    target: "health",
    title: "Der Health-Score",
    body: "Dein Health-Score fasst alle Kategorien zu einer Zahl von 0 bis 100 zusammen. 100 heißt gesund, unter 50 kritisch. Er ist kein Urteil, sondern eine Momentaufnahme aus deinen verbundenen Quellen.",
    source: "Beleg: Health-Score plus Datenstand-Badge (Stand-Monat).",
    janaStarter: "Wie setzt sich mein Health-Score zusammen?",
  },
  {
    key: "honesty",
    section: "signale",
    target: "health",
    title: "Ehrlich statt geraten",
    body: "Neben dem Score stehen Datenstand, Coverage und Signal-Basis. Ist die Historie noch dünn, zeigt UseEasy 'Historie im Aufbau' statt einer Ampel - lieber ehrlich als geraten. Demo-Werte sind als 'Illustrativ' markiert.",
    source: "Beleg: Coverage-, Datenstand- und Signal-Basis-Badge.",
  },
  {
    key: "timeline",
    section: "signale",
    target: "timeline",
    title: "Der Verlauf",
    body: "Die Zeitreihe zeigt, wohin die Reise geht. Wichtiger als der einzelne Wert ist der Trend: fällt der Score über mehrere Monate, meldet sich UseEasy früh - oft Monate bevor es kritisch wird.",
    source: "Beleg: Health-Verlauf (0-100) mit Rot-Schwelle bei 50.",
    janaStarter: "Warum hat sich mein Score verändert?",
  },
  {
    key: "categories",
    section: "signale",
    target: "categories",
    title: "Die Hauptkategorien",
    body: "Der Score zerlegt sich in Hauptkategorien, zum Beispiel Kommunikation, Finanzen oder Risiko. Klick eine an, um die einzelnen KPIs dahinter zu sehen. So erkennst du sofort, welcher Bereich den Score zieht.",
    source: "Beleg: gewichtete Kategorie-Scores aus deinen KPIs.",
  },
  {
    key: "kpis",
    section: "signale",
    target: "categories",
    title: "Jede Zahl ist belegt",
    body: "In der KPI-Tabelle steht bei jedem echten Wert ein 'Warum dieser Wert?'. Ein Klick zeigt Wert, Ein-Satz-Grund und Quelle, dazu den technischen Beleg. Nichts ist eine Blackbox. KPIs ohne verbundene Quelle sind ehrlich als 'nicht verbunden' markiert.",
    source: "Beleg: Provenance je KPI (Methode, Quelle, Eingaben).",
    janaStarter: "Welche meiner Datenquellen ist gerade am schwächsten?",
  },
  {
    key: "weekly",
    section: "signale",
    target: "weekly",
    title: "Deine Top-Prioritäten",
    body: "Oben stehen deine Top-3 dieser Woche - deterministisch aus den offenen Warnsignalen, jede mit einer konkreten Handlung und Beleg. Kein KI-Raten, sondern ein klarer nächster Schritt.",
    source: "Beleg: Wochen-Prioritäten (KPI, Wert und Quelle je Zeile).",
    janaStarter: "Was sind meine Top-3-Prioritäten diese Woche?",
  },
  {
    key: "quellen",
    section: "quellen",
    target: "quellen",
    title: "Mehr Quellen, stärkere Signale",
    body: "Je mehr Quellen du verbindest (Stripe, Bank, HubSpot und mehr), desto belastbarer die Signale. Es verlassen nur aggregierte 0-100-Werte das System, nie Rohdaten. Gruppe aufklappen, Quelle wählen, verbinden.",
    source: "Beleg: aktive Quellen erkennst du am grünen 'aktiv'-Chip.",
  },
  {
    key: "consent",
    section: "freigabe",
    target: "freigabe",
    title: "Deine Daten, deine Freigabe",
    body: "Deine eigenen Signale siehst du immer, auch ohne Freigabe. Erst wenn du die einmalige Datenfreigabe setzt, erscheint dein Profil (nur die 0-100-Werte) auf der Investorenseite. Jederzeit widerrufbar.",
    source: "Beleg: Freigabe ist optional und jederzeit widerrufbar.",
  },
  {
    key: "jana",
    section: "jana",
    target: "jana",
    title: "Ich bleibe erreichbar",
    body: "Das war es. Unter 'Jana fragen' kannst du mir jederzeit Fragen zu deinen Zahlen stellen. Ich antworte belegt mit KPI und Quelle und schlage nie eigenmächtig etwas vor. Viel Erfolg!",
    source: "Beleg: jede Antwort mit KPI und Quelle, read-only.",
    janaStarter: "Welche Signale sind veraltet?",
  },
];

// Milestone action: either a route link or an in-page action the coach handles.
export type MilestoneAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "start_tour"; label: string }
  | { kind: "section"; section: TourSection; label: string };

export type MilestoneMeta = {
  id: MilestoneId;
  label: string;
  descDone: string;
  descTodo: string;
  action: MilestoneAction;
};

export const MILESTONE_META: Record<MilestoneId, MilestoneMeta> = {
  mailbox: {
    id: "mailbox",
    label: "Postfach verbunden",
    descDone: "Dein Postfach ist verbunden - UseEasy verarbeitet eingehende E-Mails.",
    descTodo: "Verbinde dein Postfach (Gmail oder Outlook), damit UseEasy loslegen kann.",
    action: { kind: "link", href: "/einstellungen?tab=integrations", label: "Postfach verbinden" },
  },
  first_classification: {
    id: "first_classification",
    label: "Erste E-Mail klassifiziert",
    descDone: "UseEasy hat deine erste E-Mail eingeordnet und gelabelt.",
    descTodo: "Sobald die erste E-Mail eingeht, siehst du sie hier klassifiziert.",
    action: { kind: "link", href: "/review", label: "Zur Review Queue" },
  },
  signal_explained: {
    id: "signal_explained",
    label: "Erstes Signal erklärt bekommen",
    descDone: "Du hast dir mindestens eine Kennzahl von Jana erklären lassen.",
    descTodo: "Lass dir in einer kurzen Tour jede Zahl erklären, in unter einer Minute.",
    action: { kind: "start_tour", label: "Tour starten" },
  },
  draft_approved: {
    id: "draft_approved",
    label: "Ersten Entwurf freigegeben",
    descDone: "Du hast deinen ersten Antwort-Entwurf freigegeben - der Aha-Moment.",
    descTodo: "Gib deinen ersten Antwort-Entwurf frei (senden entscheidest immer du).",
    action: { kind: "link", href: "/review", label: "Entwürfe ansehen" },
  },
  consent: {
    id: "consent",
    label: "Datenfreigabe gesetzt",
    descDone: "Deine Freigabe ist gesetzt - dein Profil kann für Investoren sichtbar sein.",
    descTodo: "Optional: Freigabe setzen, um die Investoren-Sicht zu nutzen (jederzeit widerrufbar).",
    action: { kind: "section", section: "freigabe", label: "Freigabe einrichten" },
  },
  weekly: {
    id: "weekly",
    label: "Wochen-Prioritäten gesehen",
    descDone: "Du hast deine Top-Prioritäten dieser Woche angesehen.",
    descTodo: "Sieh dir deine Top-3-Prioritäten dieser Woche an.",
    action: { kind: "section", section: "signale", label: "Prioritäten ansehen" },
  },
};

// Order in which milestones are shown (matches computeMilestones order).
export const MILESTONE_ORDER: MilestoneId[] = [
  "mailbox", "first_classification", "signal_explained", "draft_approved", "consent", "weekly",
];

export const COPY = {
  welcomeTitle: "Willkommen bei UseEasy",
  welcomeBody:
    "Schön, dass du da bist. Ich bin Jana und führe dich durch deine Signale - ich erkläre dir jede Zahl beim ersten Mal und bleibe danach für Rückfragen da.",
  welcomeCta: "Tour starten (unter 1 Minute)",
  welcomeSkip: "Später",
  checklistTitle: "Erste Schritte",
  checklistDone: "Alle ersten Schritte erledigt",
  checklistDoneBody: "Stark! Du kennst deine Signale jetzt. Ich bleibe für Rückfragen erreichbar.",
  restartTour: "Tour erneut starten",
  firstValueDraftTitle: "Dein erster freigegebener Entwurf",
  firstValueDraftBody: "Das hat UseEasy gerade für dich vorbereitet - du hast nur freigegeben. Genau dafür ist es da.",
  firstValueSignalTitle: "Das hat Jana gerade für dich erkannt",
  firstValueSignalBody: "UseEasy hat ein Frühwarn-Signal erkannt und belegt, oft Wochen bevor es kritisch wird. Genau das ist der Nutzen.",
  nudgeMailboxTitle: "Postfach noch nicht verbunden",
  nudgeMailboxBody: "Verbinde Gmail oder Outlook, damit UseEasy eingehende E-Mails klassifizieren und Entwürfe erstellen kann.",
  nudgeConsentTitle: "Investoren-Sicht freischalten?",
  nudgeConsentBody: "Setz deine einmalige Datenfreigabe, um dein Profil (nur 0-100-Werte) für die Investorenseite zu nutzen. Jederzeit widerrufbar.",
  badgesIntroTitle: "Was bedeuten die Badges?",
  badgesIntroBody:
    "Rund um den Score stehen kleine Badges: 'Datenstand' zeigt, wie frisch die Quellen sind, 'Coverage' wie vollständig, 'Signal-Basis' wie belastbar. Bei dünner Historie steht ehrlich 'Historie im Aufbau'.",
  // Onboarding-Bereich (Demo-Katalog)
  onboardingTitle: "Onboarding",
  onboardingSubtitle:
    "Kurze, geführte Durchläufe mit Jana. Starte jeden jederzeit erneut, wenn du etwas nachschlagen willst. Fragen kannst du Jana ohnehin immer.",
  onboardingRestartHint: "Schon einmal gesehen? Du kannst jeden Durchlauf beliebig oft wiederholen.",
  onboardingCatalogDone: "Alle Durchläufe abgeschlossen",
  demoStart: "Starten",
  demoRestart: "Nochmal ansehen",
  demoDoneChip: "Erledigt",
};

// ── Demo-Katalog: wiederholbare, kuratierte Jana-Durchläufe ──────────────────────
// Statt Onboarding-Videos: der Kunde spielt jeden Ablauf per Knopfdruck erneut ab.
// Jeder Step ist STATISCH (kein Builder, kein LLM), "Frag Jana dazu" öffnet den echten
// Chat mit vorbefülltem Prompt. Schritte navigieren per route (Szenario-Runner) und
// spotlighten data-tour-Anker; fehlt ein Anker, wird der Step übersprungen.

// /signale-Sektion -> Route mit ?sec=, die Signale.tsx honoriert.
const SIGNALE_ROUTE: Record<TourSection, string> = {
  signale: "/signale?sec=signale",
  quellen: "/signale?sec=quellen",
  freigabe: "/signale?sec=freigabe",
  jana: "/signale?sec=jana",
};

// Die bestehende /signale-Tour als Demo: dieselben Steps, nur mit Route je Sektion.
const SIGNALE_STEPS: TourStep[] = TOUR_STEPS.map((s) => ({
  ...s,
  route: s.route ?? (s.section ? SIGNALE_ROUTE[s.section] : undefined),
}));

export type Demo = {
  slug: string;
  title: string;
  summary: string;      // ein Satz auf der Katalog-Karte
  durationMin: number;  // grobe Dauer-Angabe (2-4 Min)
  icon: string;         // lucide-Icon-Name -> Auflösung in der Katalog-Komponente
  steps: TourStep[];
};

export const DEMOS: Demo[] = [
  {
    slug: "signale-verstehen",
    title: "Deine Signale verstehen",
    summary: "Jede Zahl auf deiner Signale-Seite, Schritt für Schritt von Jana erklärt.",
    durationMin: 2,
    icon: "Activity",
    steps: SIGNALE_STEPS,
  },
  {
    slug: "review-freigeben",
    title: "Posteingang & Review-Queue: Entwürfe freigeben",
    summary: "So findest du vorbereitete Antworten und gibst sie in einem Klick frei.",
    durationMin: 3,
    icon: "ListChecks",
    steps: [
      {
        key: "rv-overview",
        route: "/",
        target: "ueb-queue",
        title: "Was auf dich wartet",
        body: "Auf der Übersicht siehst du unter 'Wartet auf Freigabe', welche E-Mails UseEasy schon für dich vorbereitet hat. Nichts davon wird ohne dich gesendet.",
        source: "Beleg: Anzahl offener Entwürfe je Priorität.",
        janaStarter: "Wie viele Entwürfe warten gerade auf meine Freigabe?",
      },
      {
        key: "rv-queue",
        route: "/review",
        target: "review-header",
        title: "Die Review-Queue",
        body: "Hier sammeln sich alle Vorgänge, die deine Aufmerksamkeit brauchen. Pro E-Mail siehst du Kategorie, Priorität und - sobald vorhanden - den vorgeschlagenen Antwort-Entwurf.",
        source: "Beleg: 'X mit Entwurf, Y warten auf Generierung'.",
      },
      {
        key: "rv-verdict",
        route: "/review",
        target: "review-verdict",
        title: "Freigeben, bearbeiten, verwerfen",
        body: "Du legst den Entwurf mit 'In Postfach' in deinen Entwürfe-Ordner, passt ihn mit 'Bearbeiten' an oder verwirfst ihn. Gesendet wird immer erst durch dich - UseEasy erstellt nur den Entwurf.",
        source: "Beleg: Entwurf landet im Postfach-Entwürfe-Ordner, kein Auto-Versand.",
        janaStarter: "Was passiert genau, wenn ich einen Entwurf freigebe?",
      },
    ],
  },
  {
    slug: "kategorien-korrigieren",
    title: "Kategorien korrigieren - so lernt Jana",
    summary: "Falsch einsortiert? In einem Klick korrigieren, und Jana lernt daraus.",
    durationMin: 3,
    icon: "Tag",
    steps: [
      {
        key: "kk-audit",
        route: "/audit",
        target: "audit-header",
        title: "Der Audit-Trail",
        body: "Jede Entscheidung von UseEasy ist hier dokumentiert - vollständig nachvollziehbar. Klick einen Eintrag an, um Details, Begründung und das gesetzte Label zu sehen.",
        source: "Beleg: pro Eintrag Kategorie, Konfidenz und 'Warum dieses Label?'.",
      },
      {
        key: "kk-correct",
        route: "/audit",
        target: "audit-filter",
        title: "Label in einem Klick korrigieren",
        body: "Öffnest du einen Eintrag, erscheint rechts 'Postfach-Label korrigieren'. Wähle die richtige Kategorie - UseEasy ersetzt das Label direkt im Postfach und merkt sich die Korrektur.",
        source: "Beleg: jede Korrektur fließt in Janas Lern-Korpus.",
        janaStarter: "Wie lernt Jana aus meinen Label-Korrekturen?",
      },
      {
        key: "kk-proposal",
        route: "/einstellungen?tab=jana-wissen",
        target: "jana-wissen-tab",
        title: "Jana schlägt selbst Regeln vor",
        body: "Häufen sich ähnliche Korrekturen, schlägt Jana dir unter 'Jana-Wissen' eine dauerhafte Regel vor. Du bestätigst mit 'Stimmt' oder lehnst ab - so wird die Einordnung mit der Zeit treffsicherer.",
        source: "Beleg: Vorschläge bleiben Vorschläge, bis du sie bestätigst.",
        janaStarter: "Welche Regeln schlägt Jana mir gerade vor?",
      },
    ],
  },
  {
    slug: "excel-livesync",
    title: "Excel Live-Sync verbinden",
    summary: "Verknüpfe eine Excel-Liste, die UseEasy bei passenden E-Mails automatisch pflegt.",
    durationMin: 3,
    icon: "FileSpreadsheet",
    steps: [
      {
        key: "xl-tab",
        route: "/einstellungen?tab=excel",
        target: "excel-tab",
        title: "Excel Live-Sync",
        body: "Verbinde eine Excel-Liste per Upload oder direkt aus OneDrive/SharePoint. UseEasy erkennt die Spalten automatisch und gleicht passende Zeilen ab, sobald eine E-Mail eingeht - etwa Termine oder Wartungsstatus.",
        source: "Beleg: Auto-Mapping der Spalten + Audit-Trail je Änderung.",
        janaStarter: "Wie richte ich Excel Live-Sync ein?",
      },
      {
        key: "xl-safe",
        title: "Immer nachvollziehbar und sicher",
        body: "Jede automatische Änderung landet im Audit-Trail und lässt sich zurücknehmen. Vor riskanten Dateien - etwa mit Pivot-Tabellen oder Diagrammen - warnt UseEasy dich vorab, bevor etwas verloren geht.",
        source: "Beleg: Style-Risk-Prüfung + Revert je Änderung.",
      },
    ],
  },
  {
    slug: "jana-wissen",
    title: "Jana briefen: das Wissensmodell",
    summary: "Hinterlege dein Unternehmenswissen, damit Jana treffender einordnet und schreibt.",
    durationMin: 3,
    icon: "Brain",
    steps: [
      {
        key: "jw-tab",
        route: "/einstellungen?tab=jana-wissen",
        target: "jana-wissen-tab",
        title: "Jana briefen",
        body: "Hier hinterlegst du dein Unternehmenswissen: Produkte, Prozesse, SLAs, Team und Schreibstil. Jana nutzt es für treffendere Einordnung und passendere Entwürfe.",
        source: "Beleg: bestätigtes Wissen fließt direkt in Einordnung und Entwürfe.",
        janaStarter: "Was weiß Jana schon über mein Unternehmen?",
      },
      {
        key: "jw-confirm",
        title: "Bestätigen statt tippen",
        body: "Vieles lernt Jana von selbst und legt dir Vorschläge vor. Du bestätigst mit einem Klick ('Stimmt') oder lehnst ab ('Stimmt nicht'). Eigene Fakten kannst du jederzeit als Vorlage ergänzen - keinen technischen Editor nötig.",
        source: "Beleg: nichts wird ohne deine Bestätigung angewendet.",
      },
    ],
  },
  {
    slug: "autopilot-stufen",
    title: "Autopilot-Stufen: Schatten, Assistiert, Autonom",
    summary: "Wie UseEasy in drei sicheren Stufen von 'beobachten' zu 'selbst senden' reift.",
    durationMin: 4,
    icon: "Bot",
    steps: [
      {
        key: "ap-tab",
        route: "/einstellungen?tab=email-autopilot",
        target: "email-autopilot-tab",
        title: "Die drei Autopilot-Stufen",
        body: "UseEasy lernt in Stufen: Schatten (beobachtet nur), Assistiert (bereitet vor, du gibst frei) und Autonom (sendet selbst, in engen Grenzen). Du steuerst das pro Kategorie.",
        source: "Beleg: Reife-Gate mit Stichprobe, Abweichungs- und Edit-Quote je Kategorie.",
        janaStarter: "Wann darf der Autopilot autonom senden?",
      },
      {
        key: "ap-safe",
        title: "Sicher per Bauart",
        body: "Rechnungen, Verträge und Beschwerden sendet UseEasy nie automatisch. Und eine Kategorie wird erst dann autonom, wenn die Qualität über hunderte Beispiele hinweg stabil ist. Aus Compliance-Gründen bleibst du immer in Kontrolle.",
        source: "Beleg: harte Sperren für heikle Kategorien, kein Auto-Send ohne Reife-Gate.",
      },
    ],
  },
];

export const DEMO_ORDER: string[] = DEMOS.map((d) => d.slug);
export function getDemo(slug: string): Demo | undefined {
  return DEMOS.find((d) => d.slug === slug);
}
