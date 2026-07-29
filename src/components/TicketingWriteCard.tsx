/**
 * TicketingWriteCard — Schnitt F1 (Briefing B / Zusatz-Briefing vom 29.07.2026)
 *
 * Der schreibende Ticket-Zugriff steht seit v4.180.0 (HubSpot) und v4.181.0
 * (Freshdesk) im Backend. Bis heute gab es dafuer keine einzige Stelle in der
 * Konsole: ein Kunde konnte seinen Freshdesk-Schluessel nicht hinterlegen, und
 * niemand konnte nachsehen, was der Assistent in seinem Ticketsystem eigentlich
 * darf. Diese Karte ist beides — Zugang hinterlegen und Bereitschaft zeigen.
 *
 * 🔴 Die Regel dieser Karte: JEDER erklaerende Satz kommt vom Endpunkt. Der
 * Server weiss, welche Berechtigung fehlt, welcher Status nichts ueber sich
 * verraet und was als Naechstes zu tun ist — und er sagt es schon auf Deutsch.
 * Hier wird davon nichts nachgebaut, nachgebessert oder "freundlicher"
 * formuliert. Was hier steht, sind Beschriftungen fuer Schluessel
 * (`createTicket` -> "Ticket anlegen"), und die liegen im reinen Modul nebenan.
 *
 * Was die Karte NICHT tut: sie loest keinen Schreibvorgang aus. Sie liest
 * `/v1/ticketing/readiness` und schreibt `/v1/ticketing/settings`. Kein Ticket
 * wird von hier aus angelegt, kommentiert oder geschlossen.
 */
import { useState } from "react";
import {
  LifeBuoy,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Info,
  Lock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, Dot } from "@/components/ue/primitives";
import { QueryErrorNotice } from "@/components/QueryErrorNotice";
import { useTicketingReadiness, useSaveTicketingSettings } from "@/hooks/use-api";
import type { TicketingReadiness } from "@/lib/api-client";
import {
  STATUS_ORDER,
  herkunftLabel,
  normalizeFreshdeskDomain,
  opLabel,
  providerLabel,
  schliesstLabel,
  sortOps,
  stateLabel,
  stateTone,
  statusLabel,
  summarize,
} from "@/lib/ticketing-readiness";

type Provider = "hubspot" | "freshdesk";

/** Ein Satz vom Server, unveraendert. */
function Hinweis({ text, ton = "info" }: { text: string; ton?: "info" | "warn" }) {
  const Icon = ton === "warn" ? AlertTriangle : Info;
  return (
    <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
      <Icon className={"mt-0.5 h-3.5 w-3.5 shrink-0 " + (ton === "warn" ? "text-amber" : "")} />
      <span>{text}</span>
    </p>
  );
}

export function TicketingWriteCard() {
  const { data, isLoading, isError } = useTicketingReadiness();
  const speichern = useSaveTicketingSettings();

  const [provider, setProvider] = useState<Provider>("freshdesk");
  const [domain, setDomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [zugangOffen, setZugangOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // 29.07. nach Leons Test: ohne diese Rueckmeldung sah ein erfolgreicher
  // Speichervorgang aus wie ein toter Knopf — die Karte stand schon auf
  // "bereit", also aenderte sich sichtbar nichts.
  const [bestaetigung, setBestaetigung] = useState<string | null>(null);

  if (isLoading) {
    return (
      <SectionCard title="Ticketsystem" subtitle="was der Assistent dort tun darf">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 rounded-md" />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (isError || !data) {
    return (
      <SectionCard title="Ticketsystem" subtitle="was der Assistent dort tun darf">
        <QueryErrorNotice label="Der Stand des Ticketsystems konnte nicht geladen werden." />
      </SectionCard>
    );
  }

  const r: TicketingReadiness = data;
  const s = summarize(r);
  const name = providerLabel(r.provider);
  const hubspotSchonEingetragen = r.connected && r.provider === "hubspot";

  // Eine Antwort, ein Umgang damit — fuer JEDEN Speicherweg. Vorher hatte nur
  // der Freshdesk-Weg einen `onSuccess`; der HubSpot-Knopf schrieb still und
  // liess das Formular offen stehen. Fuer den Kunden war das ein toter Knopf.
  const nachSpeichern = (res: { ok?: boolean; message_de?: string } | undefined, gutText: string) => {
    if (res && res.ok === false) {
      setFehler(res.message_de || "Die Einstellung wurde nicht übernommen.");
      setBestaetigung(null);
      return;
    }
    setFehler(null);
    setZugangOffen(false);
    setBestaetigung(gutText);
  };

  // Freshdesk-Zugang absenden. Der Schluessel geht hin und kommt nie zurueck —
  // die Antwort traegt nur die frische Bereitschaft.
  const zugangSpeichern = () => {
    setFehler(null);
    setBestaetigung(null);
    const d = normalizeFreshdeskDomain(domain);
    if (!d.ok) {
      setFehler("Diese Adresse ergibt keine Freshdesk-Kennung. Erwartet wird etwa firma oder firma.freshdesk.com.");
      return;
    }
    if (!apiKey.trim()) {
      setFehler("Ohne API-Schlüssel lässt sich der Zugang nicht prüfen.");
      return;
    }
    speichern.mutate(
      { provider: "freshdesk", enabled: true, freshdesk: { domain: d.sub, api_key: apiKey.trim() } },
      {
        onSuccess: (res) => {
          // Der Schluessel verlaesst das Formular sofort wieder, egal wie es
          // ausging. Ein Feld, in dem er stehen bleibt, ist ein Feld, aus dem
          // ihn jemand mitliest.
          setApiKey("");
          nachSpeichern(res, "Freshdesk-Zugang gespeichert und geprüft.");
        },
        onError: () => {
          setApiKey("");
          setFehler("Der Zugang konnte nicht gespeichert werden.");
        },
      },
    );
  };

  // HubSpot braucht keinen Schluessel — der Zugang kommt aus der OAuth-Karte.
  // Dieser Aufruf schreibt nur die Verbindungszeile und holt die Bereitschaft
  // frisch. Er ist idempotent, taugt also auch als „nochmal nachsehen".
  const hubspotEintragen = () => {
    setFehler(null);
    setBestaetigung(null);
    speichern.mutate({ provider: "hubspot", enabled: true }, {
      onSuccess: (res) => nachSpeichern(res, hubspotSchonEingetragen
        ? "HubSpot neu geprüft."
        : "HubSpot ist jetzt als Ticketsystem eingetragen."),
      onError: () => setFehler("Die Einstellung konnte nicht gespeichert werden."),
    });
  };

  const laeuft = speichern.isPending;

  // ── Kein Tarif ───────────────────────────────────────────────────────────
  if (!r.entitled) {
    return (
      <SectionCard
        title="Ticketsystem"
        subtitle="was der Assistent dort tun darf"
        action={<Lock className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="space-y-2">
          {r.hinweise.map((h, i) => <Hinweis key={i} text={h} />)}
          <Button size="sm" variant="outline" asChild>
            <a href="/einstellungen?tab=billing">Tarif ansehen</a>
          </Button>
        </div>
      </SectionCard>
    );
  }

  // ── Zugangs-Formular (nicht verbunden, oder Schluessel wird ersetzt) ──────
  const zeigeFormular = !r.connected || zugangOffen;

  return (
    <SectionCard
      title="Ticketsystem"
      subtitle={
        r.connected
          ? `${name} · ${s.moeglich} von ${s.gesamt} Schritten möglich`
          : "Tickets anlegen und kommentieren, statt sie abzutippen"
      }
      action={
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Dot tone={s.tone} pulse={s.tone === "amber"} className="!h-1.5 !w-1.5" />
          {r.connected ? (r.ok ? "bereit" : "eingeschränkt") : "nicht verbunden"}
        </span>
      }
    >
      <div className="space-y-4">
        {/* Das Versprechen steht immer oben, nicht im Kleingedruckten. */}
        <p className="flex items-start gap-1.5 rounded-md border border-line-soft bg-emerald-surface/25 px-2.5 py-2 text-[11.5px] leading-snug text-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{r.hard_line}</span>
        </p>

        {/* Rueckmeldung nach dem Speichern. Ohne sie sieht ein erfolgreicher
            Klick auf einer Karte, die schon „bereit" meldet, nach nichts aus. */}
        {bestaetigung ? (
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-primary">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{bestaetigung}</span>
          </p>
        ) : null}

        {/* ── Zugang hinterlegen ───────────────────────────────────────── */}
        {zeigeFormular ? (
          <div className="space-y-3 rounded-md border border-line-soft p-3">
            <div className="flex flex-wrap gap-1.5">
              {(["freshdesk", "hubspot"] as Provider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setProvider(p); setFehler(null); }}
                  className={
                    "rounded-full px-2.5 py-1 text-[11.5px] transition-colors " +
                    (provider === p
                      ? "bg-emerald-surface/60 text-emerald-light"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {providerLabel(p)}
                </button>
              ))}
            </div>

            {provider === "freshdesk" ? (
              <div className="space-y-2">
                <div>
                  <label htmlFor="fd-domain" className="text-[11.5px] text-muted-foreground">
                    Freshdesk-Adresse
                  </label>
                  <Input
                    id="fd-domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="firma.freshdesk.com"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="fd-key" className="text-[11.5px] text-muted-foreground">
                    API-Schlüssel
                  </label>
                  <Input
                    id="fd-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="•••••••••••••••"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    In Freshdesk unter Profil → API-Schlüssel. Wir empfehlen einen eigenen
                    Integrations-Agenten statt eines persönlichen Kontos. Der Schlüssel wird
                    verschlüsselt abgelegt und nie wieder angezeigt.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={zugangSpeichern} disabled={laeuft}>
                    {laeuft ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Zugang hinterlegen
                  </Button>
                  {r.connected ? (
                    <Button size="sm" variant="ghost" onClick={() => { setZugangOffen(false); setApiKey(""); setFehler(null); }}>
                      Abbrechen
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  {hubspotSchonEingetragen
                    ? "HubSpot ist bereits als Ticketsystem eingetragen. Der Zugang selbst kommt aus der HubSpot-Karte in diesem Tab — hier lässt sich nur nachsehen, ob er noch trägt."
                    : "HubSpot wird nicht über einen Schlüssel verbunden, sondern über die HubSpot-Karte in diesem Tab. Ist das erledigt, genügt hier ein Klick."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={hubspotEintragen} disabled={laeuft}>
                    {laeuft ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {hubspotSchonEingetragen ? "Verbindung neu prüfen" : "HubSpot als Ticketsystem verwenden"}
                  </Button>
                  {r.connected ? (
                    <Button size="sm" variant="ghost" onClick={() => { setZugangOffen(false); setFehler(null); }}>
                      Abbrechen
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            {fehler ? <Hinweis text={fehler} ton="warn" /> : null}
          </div>
        ) : null}

        {/* ── Was der Assistent hier darf ──────────────────────────────── */}
        {r.connected ? (
          <div className="space-y-1.5">
            <p className="text-[11.5px] font-medium text-foreground">Die sechs Schritte</p>
            <ul className="space-y-1">
              {sortOps(Object.keys(r.operations)).map((op) => {
                const o = r.operations[op];
                return (
                  <li key={op} className="flex items-start gap-2">
                    <Dot tone={stateTone(o.state)} className="mt-1.5 !h-1.5 !w-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug text-foreground">
                        {opLabel(op)}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {stateLabel(o.state)} · {herkunftLabel(!!o.gemessen)}
                        </span>
                      </p>
                      {o.fehlende_berechtigung ? (
                        <p className="text-[11px] leading-snug text-amber">
                          Fehlt: {o.fehlende_berechtigung}
                        </p>
                      ) : null}
                      {o.hinweis ? (
                        <p className="text-[11px] leading-snug text-muted-foreground">{o.hinweis}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* ── Status-Zuordnung ─────────────────────────────────────────── */}
        {r.connected && Object.keys(r.status_map || {}).length ? (
          <div className="space-y-1.5">
            <p className="text-[11.5px] font-medium text-foreground">Status-Zuordnung</p>
            <ul className="space-y-0.5">
              {STATUS_ORDER.map((key) => {
                const z = r.status_map[key];
                return (
                  <li key={key} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="text-muted-foreground">{statusLabel(key)}</span>
                    <span className={z ? "text-foreground" : "text-muted-foreground"}>
                      {z ? z.label : "nicht zugeordnet"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* ── 🔴 Stufen, ueber die nichts bekannt ist ───────────────────── */}
        {r.stufen_ohne_auskunft && r.stufen_ohne_auskunft.length ? (
          <div className="space-y-1 rounded-md border border-line-soft bg-amber-surface/20 p-2.5">
            <p className="text-[11.5px] font-medium text-foreground">
              Status ohne Auskunft ({r.stufen_ohne_auskunft.length})
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.stufen_ohne_auskunft.map((st) => st.label).join(" · ")}
            </p>
            <p className="text-[11px] text-muted-foreground">{schliesstLabel(null)}</p>
          </div>
        ) : null}

        {/* ── Was nicht gemessen wurde, und wo die Grenzen liegen ───────── */}
        {r.nicht_gemessen && r.nicht_gemessen.length ? (
          <Hinweis
            text={`Nicht einzeln geprüft: ${r.nicht_gemessen.map(opLabel).join(", ")}. Diese Angaben stammen aus der Beschreibung des Anbieters.`}
          />
        ) : null}
        {r.grenzen ? <Hinweis text={r.grenzen} /> : null}

        {/* ── Alle Saetze des Servers, woertlich ───────────────────────── */}
        {r.hinweise && r.hinweise.length ? (
          <div className="space-y-1.5 border-t border-line-soft pt-3">
            {r.hinweise.map((h, i) => (
              <Hinweis key={i} text={h} ton={r.ok ? "info" : "warn"} />
            ))}
          </div>
        ) : null}

        {/* ── Handlung ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {r.connected && !zeigeFormular ? (
            <Button size="sm" variant="outline" onClick={() => { setZugangOffen(true); setBestaetigung(null); setFehler(null); setProvider((r.provider as Provider) || "freshdesk"); }}>
              Zugang ersetzen
            </Button>
          ) : null}
          {s.aktion === "einschalten" ? (
            <Button
              size="sm"
              disabled={laeuft}
              onClick={() => {
                setFehler(null);
                setBestaetigung(null);
                speichern.mutate({ provider: (r.provider as Provider) || "hubspot", enabled: true }, {
                  onSuccess: (res) => nachSpeichern(res, "Der schreibende Zugriff ist wieder eingeschaltet."),
                  onError: () => setFehler("Die Einstellung konnte nicht gespeichert werden."),
                });
              }}
            >
              {laeuft ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Wieder einschalten
            </Button>
          ) : null}
          {r.provider === "hubspot" && !r.connected ? (
            <Button size="sm" variant="ghost" asChild>
              <a href="/einstellungen?tab=integrations">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Zur HubSpot-Karte
              </a>
            </Button>
          ) : null}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <LifeBuoy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Getrennt vom Ticket-Anschluss unter „Datenquellen": der misst Kennzahlen,
            dieser hier arbeitet.
          </span>
        </p>
      </div>
    </SectionCard>
  );
}

export default TicketingWriteCard;
