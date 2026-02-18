
# Governance Controls und Plan Entitlements erweitern

## Zusammenfassung
Etwa 60% der angeforderten Features sind bereits vorhanden. Es fehlen vor allem: Mailbox-Limits pro Plan, ein globaler Plan-Limits-Balken mit Fortschrittsanzeigen, Chip-basierte Domain-Eingaben (statt Freitext), Sperr-Logik fuer niedrigere Plaene, ein "Aenderung anfragen"-Modal, und aktualisierte Ablehnungsgruende.

---

## Was bereits existiert (keine Aenderung noetig)

- Freigabe-Regeln als Toggles + numerischer Betrag-Schwellenwert
- Geschaeftszeiten und SLA als strukturierte Eingaben
- Playbook-Karten mit Status aktiv/verfuegbar/gesperrt und Plan-Gating
- Wechsel-Modal mit Warntext und Bestaetigung
- Ein Playbook pro Mailbox durchgesetzt
- Ablehnung per Dropdown (kein Freitext) in Review Queue
- Toasts bei Freigabe/Ablehnung
- Audit Trail Detail-Drawer mit Entscheidung, Playbook+Version, Prioritaet, Evidenz, Nutzeraktion
- Export-Button nur fuer Scale/Pro sichtbar, bei niedrigeren Plaenen deaktiviert mit Upgrade-CTA
- Plan und Limits Sektion in Einstellungen (Basis-Version)

---

## Was gebaut/geaendert wird

### 1. Plan-Datenmodell erweitern
**Datei:** `src/data/plan.ts`

- `mailboxLimit` hinzufuegen: Starter 1 / Team 3 / Scale 10 / Pro 25
- `processedEmails` und `draftCredits` als numerische Werte (fuer Fortschrittsbalken)

### 2. Ablehnungsgruende aktualisieren
**Datei:** `src/data/mock-data.ts`

Die REJECTION_REASONS Liste auf die 8 neuen Gruende aendern:
- Nicht relevant
- Kein Handlungsbedarf
- Spam / Werbung
- Doppelt / bereits erledigt
- Falscher Empfaenger
- Nicht freigabefaehig (Compliance)
- Unklar - Rueckfrage noetig
- Bitte manuell pruefen

### 3. Neue Komponente: PlanLimitsBar
**Datei:** `src/components/PlanLimitsBar.tsx`

Kompakter Streifen mit 4 Fortschrittsbalken:
- Mailboxen genutzt: X / Limit
- Aktive Playbooks: Y / Limit
- Verarbeitete E-Mails: X / Limit
- Entwurf-Credits: X / Limit

Jeder mit kleinem Progress-Balken und "Plan upgraden" CTA-Link. Wird in AppLayout oberhalb des Hauptinhalts eingebaut.

### 4. Neue Komponente: LockedControl
**Datei:** `src/components/LockedControl.tsx`

Wrapper-Komponente die beliebige Inhalte mit einem Sperr-Overlay versieht:
- Lock-Icon + abgedunkelte Darstellung
- Tooltip "Aenderung nur per Ticket/Upgrade"
- Hinweistext: "Diese Einstellung ist in deinem Plan gesperrt."
- CTA-Button "Aenderung anfragen" der das RequestChangeModal oeffnet

### 5. Neue Komponente: RequestChangeModal
**Datei:** `src/components/RequestChangeModal.tsx`

Modal mit strukturierten Dropdowns (kein Freitext):
- Kategorie: Domains, Approval-Regeln, Mailboxen, Playbooks, Plan
- Aenderungstyp: Hinzufuegen, Entfernen, Anpassung
- Dringlichkeit: Normal, Hoch, Kritisch
- Buttons: Abbrechen / Anfrage senden
- Nach Absenden: Toast "Anfrage gesendet"

### 6. Neue Komponente: ChipDomainInput
**Datei:** `src/components/ChipDomainInput.tsx`

Ersetzt die Freitext-Domain-Eingaben:
- Chip-Liste mit einzelnen Domains als Tags
- Validierung: nur gueltiges Domain-Format, automatisch Kleinbuchstaben
- Entfernen per X-Button am Chip
- Hinzufuegen per Enter-Taste

### 7. Einstellungen-Seite anpassen
**Datei:** `src/pages/Einstellungen.tsx`

- Domain-Listen: Freitext-Inputs durch ChipDomainInput ersetzen
- Fuer Starter/Team: Domain-Bereich mit LockedControl umschliessen (read-only + "Aenderung anfragen")
- Fuer Scale/Pro: ChipDomainInput editierbar
- Mailbox-Sektion: Anzeige genutzt vs. Limit, Upgrade-Hinweis wenn Limit erreicht
- Plan und Limits Sektion: Fortschrittsbalken statt einfacher Text-Anzeige

### 8. AppLayout anpassen
**Datei:** `src/components/layout/AppLayout.tsx`

- PlanLimitsBar als schmalen Streifen oberhalb des Hauptinhalts einbauen (unterhalb der oberen Kante)

---

## Technische Details

- Alle neuen Komponenten folgen dem bestehenden Styling: `glass-card`, `bg-muted/50`, `border-border`, emerald Akzente
- LockedControl nutzt `opacity-50` + `pointer-events-none` auf den Kindern plus ein absolut positioniertes Overlay
- ChipDomainInput validiert mit Regex `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/`
- PlanLimitsBar nutzt die bestehende Progress-Komponente aus `@radix-ui/react-progress`
- RequestChangeModal nutzt bestehendes Modal-Pattern (wie das Switch-Modal in Playbooks)
- Keine neuen Abhaengigkeiten erforderlich
