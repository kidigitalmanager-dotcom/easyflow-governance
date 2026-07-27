import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/use-api";
import { getTenantIntegrations } from "@/lib/api-client";
import {
  useCapitalBankStatus,
  useCapitalAccountingStatus,
  useCapitalStripeStatus,
  useCapitalShopifyStatus,
  useCapitalMetaAdsStatus,
  useCapitalTicketingStatus,
} from "@/hooks/use-capital";
import { isConnectedStatus } from "@/lib/source-state";

/**
 * Verbindungszustand aller Datenquellen an EINER Stelle.
 *
 * Warum (Leon, 27.07.2026): "wenn hubspot in integrationen connected ist soll
 * es auch unter datenquellen gruen werden". Die Quellen-Liste leitete ihren
 * Zustand bisher ausschliesslich aus den gelieferten Kennzahlen ab — eine frisch
 * verbundene Quelle, die noch nichts geliefert hat, stand dort auf grau.
 *
 * Dieser Hook liefert den ZWEITEN Teil der Wahrheit: ist die Quelle verbunden?
 * Die Status-Endpunkte werden von den Connect-Karten ohnehin geladen; dank
 * gleicher react-query-Schluessel entsteht KEIN zusaetzlicher Netzverkehr,
 * solange die Karte gemountet ist. Ist sie es nicht (Gruppe zugeklappt), holt
 * dieser Hook den Status einmal selbst.
 *
 * Rueckgabe: `undefined` heisst ehrlich "noch nicht geladen" — nicht "nein".
 */
export interface SourceConnections {
  byKey: Record<string, boolean | undefined>;
  /** true, sobald mindestens ein Status geladen ist (fuer "wird geladen"-Zustaende). */
  anyKnown: boolean;
}

/** HubSpot-Verbindungszustand aus /v1/tenant/integrations — derselbe Endpunkt wie die Karte. */
export function useTenantIntegrations() {
  const { session } = useAuth();
  const { data: me } = useMe();
  const tenantId =
    ((me as { tenant?: { tenant_id?: string } } | undefined)?.tenant?.tenant_id) ||
    ((me as { user?: { tenant_id?: string } } | undefined)?.user?.tenant_id) ||
    "";
  return useQuery({
    queryKey: ["tenant", "integrations", tenantId],
    queryFn: () => getTenantIntegrations(tenantId),
    enabled: !!session && !!tenantId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useSourceConnections(): SourceConnections {
  const bank = useCapitalBankStatus();
  const acct = useCapitalAccountingStatus();
  const stripe = useCapitalStripeStatus();
  const shopify = useCapitalShopifyStatus();
  const metaAds = useCapitalMetaAdsStatus();
  const ticketing = useCapitalTicketingStatus();
  const integrations = useTenantIntegrations();
  const { data: me } = useMe();

  // Postfaecher: verbunden, sobald mindestens eines in mailbox_health steht.
  // Die Ampel selbst (ok/stale/error) gehoert in die Postfach-Karte, nicht hierher.
  const mailboxes = (me as { mailbox_health?: unknown[] } | undefined)?.mailbox_health;
  const mailboxConnected = Array.isArray(mailboxes) ? mailboxes.length > 0 : undefined;

  const hs = integrations.data?.hubspot;
  // Der Endpunkt liefert `state` (connected|reauth_required|disconnected) UND
  // `connected`. `state` ist genauer — reauth_required zaehlt als verbunden.
  const hubspotConnected = integrations.isSuccess
    ? (isConnectedStatus(hs?.state) ?? !!hs?.connected)
    : undefined;

  const byKey: Record<string, boolean | undefined> = {
    comms_inbox: mailboxConnected,
    finapi: isConnectedStatus(bank.data?.status),
    bank_psp: isConnectedStatus(bank.data?.status),
    maesn: isConnectedStatus(acct.data?.status),
    stripe: isConnectedStatus(stripe.data?.status),
    shopify: isConnectedStatus(shopify.data?.status),
    meta_ads: isConnectedStatus(metaAds.data?.status),
    ticketing: isConnectedStatus(ticketing.data?.status),
    hubspot_crm: hubspotConnected,
  };

  const anyKnown = Object.values(byKey).some((v) => v !== undefined);
  return { byKey, anyKnown };
}
