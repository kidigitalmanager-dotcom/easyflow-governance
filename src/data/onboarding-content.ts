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
  /**
   * Zusatzleistung, die dieser Durchlauf voraussetzt (Upsell-Schnitt 06.08.2026).
   *
   * Wert = lookup_key aus `src/lib/consoleCatalog.ts`, damit es keine zweite
   * Produkt-Wahrheit gibt. Die Katalog-Komponente prueft damit gegen die
   * Entitlements und setzt einen Hinweis plus den Link auf die Kachel.
   *
   * Der Durchlauf wird bewusst NICHT versteckt: Leons Auftrag ist, dauerhaft zu
   * zeigen, was es noch gibt. Wer nicht gebucht hat, soll den Durchlauf sehen,
   * lesen was er bringt, und mit einem Klick dorthin kommen, wo man es bucht.
   *
   * Fehlt das Feld, ist der Durchlauf in JEDEM Paket nutzbar.
   */
  requiresKey?: string;
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

  // ── Ergänzung 06.08.2026 (Leon): vier Durchläufe fehlten komplett ──────────
  // Der Katalog kannte nur E-Mail-Themen. Buchhaltung, Compliance-Radar, Voice
  // und die Beratung durch Jana selbst waren nicht erklärt, obwohl es sie gibt
  // und drei davon Geld kosten. Die drei kostenpflichtigen tragen `requiresKey`
  // und zeigen bei fehlender Buchung den Weg zur Kachel; Jana selbst ist in
  // jedem Paket enthalten und trägt deshalb keinen.
  {
    slug: "jana-fragen",
    title: "Jana fragen: jede Zahl erklärt, jede Antwort belegt",
    summary: "Wie du Jana im Chat nach Kennzahlen, Signalen und Produkten fragst, und woran du eine belegte Antwort erkennst.",
    durationMin: 2,
    icon: "Sparkles",
    steps: [
      {
        key: "jf-open",
        route: "/signale?sec=jana",
        title: "Der Sparkle-Knopf unten rechts",
        body: "Jana ist auf jeder Seite erreichbar, unten rechts. Du kannst sie in normalem Deutsch fragen, warum eine Zahl sich verändert hat, was diese Woche wichtig ist oder was ein Produkt kostet. Sie liest nur, sie ändert nichts.",
        source: "Beleg: Jana ist read-only, sie kann keine Einstellung ändern und nichts senden.",
        janaStarter: "Was sind meine Top-3-Prioritäten diese Woche?",
      },
      {
        key: "jf-beleg",
        title: "Woran du eine gute Antwort erkennst",
        body: "Unter jeder Antwort stehen kleine Belege: die Kennzahl, ihr Stand und die Quelle, aus der sie kommt. Fehlt der Beleg, sagt Jana lieber, dass sie es nicht weiß. Geraten wird nicht, und eine Zahl ohne Quelle gibt sie nicht aus.",
        source: "Beleg: jede quantitative Aussage trägt eine Zitat-Referenz, sonst wird sie verworfen.",
        janaStarter: "Woher kommen die Zahlen in deiner letzten Antwort?",
      },
      {
        key: "jf-produkt",
        title: "Sie kennt auch die Preise",
        body: "Jana weiß, welche Pakete es gibt, was sie kosten und was in deinem Paket schon enthalten ist. Sie schlägt nichts ungefragt vor. Fragst du danach, nennt sie den Preis und wo man es bucht, und kauft dabei selbst nie etwas.",
        source: "Beleg: Preise kommen aus dem Produktkatalog, erfundene Beträge werden maschinell erkannt und verworfen.",
        janaStarter: "Was würde mir noch helfen?",
      },
    ],
  },
  {
    slug: "buchhaltung-belege",
    title: "Buchhaltung: Belege lesen, zuordnen, exportieren",
    summary: "Wie Rechnungen aus dem Postfach zu Forderungen, Verbindlichkeiten und einem Export für die Kanzlei werden.",
    durationMin: 3,
    icon: "Wallet",
    requiresKey: "ue2_accounting_monthly",
    steps: [
      {
        key: "bu-uebersicht",
        route: "/buchhaltung",
        title: "Geld rein, Geld raus",
        body: "Diese Seite rechnet aus deinen Belegen, was in den nächsten Tagen hereinkommt und was hinausgeht. Der Cash-Index ist die Differenz im gewählten Zeitraum. Nichts davon musst du eintippen: die Zahlen kommen aus Rechnungen, die UseEasy im Postfach gelesen hat.",
        source: "Beleg: server-berechnet aus erfassten Belegen, je Zeitraum 7 bis 60 Tage.",
        janaStarter: "Wie kommt mein Cash-Index zustande?",
      },
      {
        key: "bu-forderungen",
        route: "/forderungen",
        title: "Forderungen und Rechnungen",
        body: "Offene Posten stehen hier als Liste statt im Postfach: wer schuldet wie viel, seit wann, und was davon überfällig ist. Eine Mahnung, die eskaliert, erkennt UseEasy an der Sprache und hebt sie hervor, bevor daraus ein Streit wird.",
        source: "Beleg: je Position die Ursprungs-Mail und das Rechnungsdatum.",
        janaStarter: "Welche Forderungen sind gerade überfällig?",
      },
      {
        key: "bu-export",
        title: "Der Export für die Kanzlei",
        body: "Am Ende steht ein Export, den deine Steuerkanzlei direkt verarbeiten kann. Im Paket sind 400 Belege im Monat enthalten. Brauchst du mehr, kommt je Beleg-Paket ein Kontingent von 200 dazu.",
        source: "Beleg: 400 Belege im Monat, Zukauf über Beleg-Pakete.",
        janaStarter: "Wie viele Belege habe ich diesen Monat verbraucht?",
      },
    ],
  },
  {
    slug: "compliance-radar",
    title: "Compliance-Radar: warnen, bevor es teuer wird",
    summary: "Fristen, eskalierende Mahnungen und DSGVO-Anfragen erkennt UseEasy im Postfach und meldet sie vorher.",
    durationMin: 3,
    icon: "ShieldAlert",
    requiresKey: "ue2_compliance_radar_monthly",
    steps: [
      {
        key: "cr-ampel",
        route: "/signale?sec=risk_shield",
        title: "Alles, was warnt, an einem Ort",
        body: "Auf der Frühwarnung stehen zwei Dinge nebeneinander: was bei deinen Partnern auffällt, und deine eigene Rechts- und Compliance-Lage. Eine Sprache für beides, mit drei Stufen: Bestätigt, Beobachtung, Stabil.",
        source: "Beleg: Einordnung nach einer Regel, die an zwei Rückrechnungen kalibriert wurde.",
        janaStarter: "Welche Frühwarn-Signale sind gerade kritisch?",
      },
      {
        key: "cr-eigene",
        title: "Was der Radar im Postfach findet",
        body: "Er erkennt laufende Fristen, Mahnungen, die eine Stufe weitergehen, angefragte DSGVO-Auskünfte und drohende Verjährung. Jedes Signal nennt die Mail, auf der es beruht, damit du es in zehn Sekunden nachvollziehen kannst.",
        source: "Beleg: je Signal die Ursprungs-Mail und der erkannte Fristtyp.",
        janaStarter: "Welche Fristen laufen bei mir in den nächsten 14 Tagen?",
      },
      {
        key: "cr-grenze",
        title: "Ein Hinweis, keine Rechtsberatung",
        body: "Der Radar sagt dir, wo du hinsehen solltest, und er sagt es früh. Er entscheidet nichts und er ersetzt keinen Anwalt. Bewertet wird nur aus öffentlichen Signalen und deinem eigenen Postfach, und deine Signale bleiben privat.",
        source: "Beleg: Investoren sehen ausschließlich aggregierte Indizes, nie einzelne Signale.",
      },
    ],
  },
  {
    slug: "voice-jana",
    title: "Voice „Jana“: sie geht ans Telefon",
    summary: "Was passiert, wenn niemand abnehmen kann, und wie aus einem Anruf ein Vorgang wird.",
    durationMin: 3,
    icon: "PhoneCall",
    requiresKey: "ue2_voice_jana_monthly",
    steps: [
      {
        key: "vo-seite",
        route: "/voice",
        title: "Voice und Co-Pilot",
        body: "Hier verwaltest du die Telefonie: welche Rufnummer bei dir klingelt, was Jana am Telefon sagen darf und welche Vorlage sie benutzt. Getrennt davon liegen deine Vertriebler mit dem Co-Pilot, die ist eine andere Sache.",
        source: "Beleg: je Anruf ein Protokoll mit Zeitpunkt, Dauer und erkanntem Anliegen.",
        janaStarter: "Was kann Jana am Telefon und was nicht?",
      },
      {
        key: "vo-anruf",
        title: "Aus einem Anruf wird ein Vorgang",
        body: "Jana nimmt ab, klärt worum es geht und legt daraus einen Vorgang mit Nummer an. Der Anrufer bekommt sofort eine Antwort statt einer Mailbox. Was sie nicht klären kann, gibt sie als Rückruf an dich weiter, mit dem Anliegen dabei.",
        source: "Beleg: jeder Anruf landet im Verlauf, mit Anliegen und Vorgangs-Nummer.",
        janaStarter: "Wie viele Anrufe hat Jana diese Woche angenommen?",
      },
      {
        key: "vo-zeiten",
        route: "/einstellungen?tab=autopilot",
        title: "Wann sie überhaupt abnimmt",
        body: "Du legst die Zeiten fest, in denen Jana Anrufe annimmt, und was ausserhalb passiert. Erreicht sie bei einem Rückruf niemanden, versucht sie es bis zu dreimal, in der Zeitzone des Angerufenen. Im Paket sind 1.000 Gesprächsminuten im Monat enthalten.",
        source: "Beleg: 1.000 Minuten im Monat, darüber 0,18 Euro je Minute.",
        janaStarter: "Wie viele Gesprächsminuten habe ich noch?",
      },
    ],
  },
];

export const DEMO_ORDER: string[] = DEMOS.map((d) => d.slug);
export function getDemo(slug: string): Demo | undefined {
  return DEMOS.find((d) => d.slug === slug);
}
