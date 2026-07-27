# UseEasy Console — Design-System (Redesign 27.07.2026)

Verbindlich für alle Seiten. Quelle: Leons Entwurf `UseEasy Console.html`
(Briefing `BRIEFING CONSOLE REDESIGN 2026-07-27`).

## Grundregeln

1. **Kein Hex im Markup.** Farben kommen ausschließlich aus den Tokens in
   `src/index.css` bzw. den Tailwind-Aliassen. Kein `text-emerald-500`,
   kein `border-red-200` — sondern `text-primary`, `border-danger/40`.
2. **Nichts anzeigen, was der Server nicht liefert.** Fehlt ein Wert, steht
   `–` da. Lieber ein Widget weglassen als eine Fantasiezahl.
3. **Fehler ≠ leer.** Eine fehlgeschlagene Query zeigt `<QueryErrorNotice>`,
   niemals den Leer-Zustand ("Keine offenen Forderungen").
4. **Kein Feature-Verlust.** Beim Umbau darf keine bestehende Aktion, Route
   oder Bestätigungsabfrage verschwinden.
5. **Ruhige Bewegung.** Animationen ≥ 1.6 s, niemals blinken.
   `prefers-reduced-motion` ist global in `index.css` abgeräumt.

## Farb-Tokens

| Zweck | Klasse |
|---|---|
| Seitenhintergrund | `bg-background` (#090d13) |
| Ruhige Fläche, Sidebar, Inputs | `bg-muted` (#0d131b) |
| Fläche 2. Ebene, Listenzeilen | `bg-surface` / `.ue-surface` (#10161f) |
| Karte | `bg-card` / `.glass-card` (#131a24) |
| Gehobene Karte (KPI) | `.ue-card-raised` (#161d27) |
| Hover / Sekundärfläche | `bg-surface-hover`, `bg-secondary` (#1b2431) |
| Linie | `border-border` (#1e2733), weich: `border-line-soft` (#1b2431) |
| Text primär / sekundär / muted | `text-foreground` · `text-tx-secondary` · `text-muted-foreground` |
| Deko-Text (nur Labels!) | `text-tx-weak` (#5d6878) · `text-tx-faint` (#4c5665) |
| Erfolg / Marke | `text-primary`, `bg-primary`, hell: `text-emerald-light` |
| Emerald-Flächen | `bg-emerald-surface` (#14382c) · `bg-emerald-deep` (#0f2119) |
| Warnung / Frist | `text-amber`, `bg-amber-surface` (#2a2418) |
| Alarm | `text-danger` (#e0685e) |

⚠ `tx-weak` / `tx-faint` sind Deko-Stufen. Lesbarer Inhalt bekommt mindestens
`text-muted-foreground` (a11y).

## Typografie

- UI: Inter. Kennzahlen bekommen `.tabular` (springt beim Hochzählen nicht).
- Display-Akzent: `.ue-serif` (Instrument Serif italic) — **nur** Login, Boot
  und die Heute-Überschrift. Sonst nirgends.
- Overline/Kicker: `.ue-kicker` (11px, uppercase, ls .16em). Nur für kurze
  Labels; ganze Sätze niemals in Versalien.

## Bausteine (`@/components/ue/primitives`)

| Komponente | Zweck |
|---|---|
| `PageHeader` | Seitenkopf: `kicker`, `title`, optional `accent` (Serif), `subtitle`, `actions` |
| `StatCard` | KPI mit Count-up. `value={null}` ⇒ `–`. `glow` nur für die Leitkennzahl |
| `SectionCard` | Karte mit Kopfzeile: `title`, `subtitle` (normale Schreibweise!), `action`, `live` |
| `Chip` | Filter-Chip mit `active` + `count` |
| `Dot` | Statuspunkt, `tone`: emerald/amber/danger/muted, optional `pulse` |
| `EmptyState` | Leer-Zustand mit Icon, Titel, Beschreibung |
| `ProgressRing` | SVG-Ring, animiert per `stroke-dashoffset` (1.2 s) |

`@/components/ue/motion`: `useCountUp`, `usePrefersReducedMotion`.

## Animations-Utilities (`src/index.css`)

`animate-breathe` · `animate-dot-pulse` (+ `-amber`) · `animate-fade-up` ·
`animate-rise-in` · `animate-fade-in` · `animate-slide-l` · `animate-grow-w` ·
`animate-draw` · `.sheen` · Staffelung mit `.stagger-1` … `.stagger-6`.

Karten steigen mit `animate-fade-up` ein (macht `SectionCard` bereits selbst).

## Seiten-Gerüst

```tsx
<div className="space-y-6">
  <PageHeader kicker="Buchhaltung" title="Forderungen" subtitle="…" actions={…} />
  <div className="flex flex-wrap gap-1.5">{/* Chips */}</div>
  <SectionCard title="…" subtitle="…" bodyClassName="p-0">
    {isLoading ? <Skeleton …/>
     : isError  ? <QueryErrorNotice onRetry={refetch} retrying={isFetching} />
     : rows.length === 0 ? <EmptyState … />
     : <ul className="divide-y divide-line-soft">…</ul>}
  </SectionCard>
</div>
```

Kein eigener `max-w-*`/`p-*`-Container auf Seitenebene — das macht `AppLayout`.
