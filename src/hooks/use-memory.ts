import { useQuery } from "@tanstack/react-query";
import { fetchMemoryEntities, fetchMemoryEpisodes, type MemoryEntity } from "@/lib/memory-api";

// Kontakt-Dossier: Suche per ?q=<email> (Backend-LIKE auf entity_email/display_name),
// dann exakter Client-Match. enabled steuert der Aufrufer (erst beim Oeffnen fetchen).
export function useEntityByEmail(email?: string | null) {
  return useQuery({
    enabled: !!email,
    queryKey: ["memory", "entity", email],
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MemoryEntity | null> => {
      const r = await fetchMemoryEntities({ q: email!, limit: 5 });
      const list = r.entities ?? [];
      return list.find((e) => (e.entity_email ?? "").toLowerCase() === email!.toLowerCase()) ?? list[0] ?? null;
    },
  });
}

// Fristen-Board: eine Liste reicht (Cap 200), Fristen werden client-seitig gefiltert.
export function useMemoryEntities(limit = 200) {
  return useQuery({
    queryKey: ["memory", "entities", limit],
    retry: false,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => (await fetchMemoryEntities({ limit })).entities ?? [],
  });
}

// Wochen-Rueckblick: juengste Episode eines Scopes (nightly geschrieben).
export function useMemoryEpisode(scope: "day" | "week" | "month" = "week") {
  return useQuery({
    queryKey: ["memory", "episode", scope],
    retry: false,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => (await fetchMemoryEpisodes(scope, 1)).episodes?.[0] ?? null,
  });
}
