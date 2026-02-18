import { REJECTION_REASONS } from "./strings.de";

export interface ReviewItem {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  suggestionType: string;
  priority: "P0" | "P1" | "P2" | "P3";
  mailbox: string;
  playbook: string;
  playbookVersion: string;
  timestamp: string;
  evidence: string[];
  reason: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  mailbox: string;
  subject: string;
  priority: "P0" | "P1" | "P2" | "P3";
  category: string;
  playbook: string;
  playbookVersion: string;
  decision: string;
  reason: string;
  evidence: string[];
  userAction: "approved" | "rejected" | "sent" | "pending" | "playbook_switch";
  actor: string;
}

export interface PlaybookData {
  id: string;
  name: string;
  useCases: string[];
  priorityExplainer: string;
  version: string;
  category: string;
}

export const MAILBOXES = [
  "support@firma.de",
  "sales@firma.de",
  "info@firma.de",
];

// Re-export from centralized strings
export { REJECTION_REASONS };

export const PLAYBOOKS: PlaybookData[] = [
  { id: "ecommerce", name: "E-Commerce", category: "E-Commerce", version: "v2.4", useCases: ["Bestellstatus", "Rückgabe", "Adressänderung", "Zahlungsfrage"], priorityExplainer: "P0: Zahlungsbetrug · P1: Rückgabe-Frist · P2: Statusanfrage · P3: Info" },
  { id: "b2b-sales", name: "B2B Sales", category: "B2B Sales", version: "v1.8", useCases: ["Angebotsanfrage", "Terminbuchung", "Nachfass-Mail", "Produktfrage"], priorityExplainer: "P0: Vertragsrisiko · P1: Deadline · P2: Nachfass · P3: Info" },
  { id: "logistics", name: "Logistics", category: "Logistics", version: "v2.1", useCases: ["Lieferstatus", "Reklamation", "Terminänderung", "Transportschaden"], priorityExplainer: "P0: Transportschaden · P1: Verzögerung · P2: Statusanfrage · P3: Info" },
  { id: "hotel", name: "Hotel", category: "Hotel", version: "v1.5", useCases: ["Reservierung", "Check-in Frage", "Concierge-Service", "Stornierung"], priorityExplainer: "P0: Stornierung · P1: Check-in · P2: Service · P3: Info" },
  { id: "education", name: "Education", category: "Education", version: "v1.3", useCases: ["Einschreibung", "Kursfrage", "Prüfungstermin", "Zertifikat"], priorityExplainer: "P0: Fristablauf · P1: Prüfung · P2: Kursfrage · P3: Info" },
  { id: "real-estate", name: "Real Estate", category: "Real Estate", version: "v1.6", useCases: ["Besichtigung", "Mietvertrag", "Nebenkostenabrechnung", "Kündigung"], priorityExplainer: "P0: Kündigung · P1: Vertrag · P2: Besichtigung · P3: Info" },
  { id: "telecom", name: "Telecom", category: "Telecom", version: "v2.0", useCases: ["Tarifwechsel", "Störungsmeldung", "Vertragsfrage", "Kündigung"], priorityExplainer: "P0: Störung · P1: Kündigung · P2: Tarif · P3: Info" },
  { id: "manufacturing", name: "Manufacturing", category: "Manufacturing", version: "v1.2", useCases: ["Auftragsstatus", "Qualitätsmeldung", "Lieferverzögerung", "Reklamation"], priorityExplainer: "P0: Qualitätsmangel · P1: Verzögerung · P2: Status · P3: Info" },
  { id: "coaching", name: "Coaching", category: "Coaching", version: "v1.1", useCases: ["Terminbuchung", "Kursanfrage", "Feedback", "Rechnung"], priorityExplainer: "P0: Stornierung · P1: Termin · P2: Feedback · P3: Info" },
  { id: "marketing", name: "Marketing", category: "Marketing", version: "v1.4", useCases: ["Kampagnenanfrage", "Budgetfreigabe", "Reportanfrage", "Partneranfrage"], priorityExplainer: "P0: Budget · P1: Deadline · P2: Report · P3: Info" },
  { id: "finance", name: "Finanzen", category: "Finanzen", version: "v2.2", useCases: ["Rechnungsklärung", "Mahnwesen", "Bankdatenänderung", "Steueranfrage"], priorityExplainer: "P0: Betrug · P1: Mahnung · P2: Klärung · P3: Info" },
];

export const REVIEW_QUEUE: ReviewItem[] = [
  { id: "r1", subject: "Rückgabe Bestellung #4821", sender: "Maria Keller", senderEmail: "m.keller@example.de", suggestionType: "Entwurf erstellen", priority: "P1", mailbox: "support@firma.de", playbook: "E-Commerce", playbookVersion: "v2.4", timestamp: "vor 12 Min.", evidence: ["Rückgabefrist läuft in 48h ab", "Bestellwert > 200 €", "Kundenkategorie: Premium"], reason: "Zeitkritisch – Rückgabefrist läuft bald ab." },
  { id: "r2", subject: "Bankdaten-Änderung Lieferant", sender: "Thomas Braun", senderEmail: "t.braun@partner.de", suggestionType: "Zur Prüfung", priority: "P0", mailbox: "info@firma.de", playbook: "Finanzen", playbookVersion: "v2.2", timestamp: "vor 3 Min.", evidence: ["Bankdatenänderung angefragt", "Absender nicht verifiziert", "Betrag > 5.000 €"], reason: "Risiko erkannt – Bankdatenänderung von externem Absender." },
  { id: "r3", subject: "Terminbestätigung Workshop Q2", sender: "Lisa Weber", senderEmail: "l.weber@firma.de", suggestionType: "Auto-Antwort", priority: "P3", mailbox: "sales@firma.de", playbook: "B2B Sales", playbookVersion: "v1.8", timestamp: "vor 45 Min.", evidence: ["Standard-Terminbestätigung", "Kein Risiko erkannt", "Intern"], reason: "Info – keine Antwort nötig." },
  { id: "r4", subject: "Störungsmeldung Standort Nord", sender: "Markus Vogel", senderEmail: "m.vogel@technik.de", suggestionType: "Eskalation", priority: "P0", mailbox: "support@firma.de", playbook: "Manufacturing", playbookVersion: "v1.2", timestamp: "vor 8 Min.", evidence: ["Produktionsstillstand gemeldet", "SLA-Verletzung droht", "Mehrere Standorte betroffen"], reason: "Sofort handeln – Produktionsstillstand." },
  { id: "r5", subject: "Angebotsanfrage Enterprise-Lizenz", sender: "Julia Hoffmann", senderEmail: "j.hoffmann@enterprise.de", suggestionType: "Entwurf erstellen", priority: "P2", mailbox: "sales@firma.de", playbook: "B2B Sales", playbookVersion: "v1.8", timestamp: "vor 2 Std.", evidence: ["Enterprise-Anfrage", "Volumen > 50 Lizenzen", "Bestandskunde"], reason: "Empfehlung – Antwort ist sinnvoll." },
];

export const AUDIT_TRAIL: AuditEntry[] = [
  { id: "a1", timestamp: "18.02.2026, 14:23", mailbox: "support@firma.de", subject: "Rückgabe Bestellung #4712", priority: "P1", category: "Rückgabe", playbook: "E-Commerce", playbookVersion: "v2.4", decision: "Entwurf wurde erstellt und zur Freigabe vorgelegt.", reason: "Rückgabefrist läuft in 24h ab.", evidence: ["Bestellwert 189 €", "Premium-Kunde", "Rückgabefrist 24h"], userAction: "approved", actor: "Leon (Admin)" },
  { id: "a2", timestamp: "18.02.2026, 13:45", mailbox: "info@firma.de", subject: "Bankdaten-Änderung Lieferant Meyer", priority: "P0", category: "Bankdaten", playbook: "Finanzen", playbookVersion: "v2.2", decision: "Eskalation an Compliance-Team ausgelöst.", reason: "Verdächtige Bankdatenänderung erkannt.", evidence: ["Externer Absender", "Betrag > 10.000 €", "Keine Vorankündigung"], userAction: "rejected", actor: "Leon (Admin)" },
  { id: "a3", timestamp: "18.02.2026, 11:30", mailbox: "sales@firma.de", subject: "Nachfass Angebot Q1-2026", priority: "P2", category: "Nachfass", playbook: "B2B Sales", playbookVersion: "v1.8", decision: "Nachfass-Mail Entwurf erstellt.", reason: "Follow-up nach 7 Tagen empfohlen.", evidence: ["Kein Response seit 7 Tagen", "Angebotswert > 5.000 €", "Entscheider-Kontakt"], userAction: "sent", actor: "UseEasy (Auto)" },
  { id: "a4", timestamp: "17.02.2026, 16:10", mailbox: "support@firma.de", subject: "Lieferstatus Anfrage #9923", priority: "P3", category: "Status", playbook: "Logistics", playbookVersion: "v2.1", decision: "Auto-Antwort mit Tracking-Link gesendet.", reason: "Standard-Statusanfrage, kein Risiko.", evidence: ["Standardanfrage", "Tracking verfügbar", "Lieferung planmäßig"], userAction: "sent", actor: "UseEasy (Auto)" },
  { id: "a5", timestamp: "17.02.2026, 09:55", mailbox: "support@firma.de", subject: "Qualitätsmangel Charge #B-442", priority: "P0", category: "Qualität", playbook: "Manufacturing", playbookVersion: "v1.2", decision: "Sofort-Eskalation an QM-Leitung.", reason: "Qualitätsmangel mit möglichem Produktionsausfall.", evidence: ["Charge betrifft 500 Einheiten", "Auslieferung gestoppt", "QM-Prüfung erforderlich"], userAction: "approved", actor: "Leon (Admin)" },
];

export const MAILBOX_PLAYBOOK_ASSIGNMENTS: Record<string, string | null> = {
  "support@firma.de": "ecommerce",
  "sales@firma.de": "b2b-sales",
  "info@firma.de": null,
};
