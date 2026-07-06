// Copy + step/milestone metadata for the V6 Jana-Onboarding-Coach.
// Pure data (no React, no lucide) -> icons + rendering live in the components.
// Explanations are STATIC (0 LLM cost, instant); every step names its Beleg (KPI + Quelle)
// and "Frag Jana dazu" opens the real jana-chat for follow-ups.
import type { MilestoneId } from "@/lib/onboarding";

// Which Signale sub-section a tour step needs active. Matches Signale.tsx SectionKey.
export type TourSection = "signale" | "quellen" | "freigabe" | "jana";

export type TourStep = {
  key: string;
  section: TourSection;
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
};
