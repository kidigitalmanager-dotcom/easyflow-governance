import { describe, it, expect } from "vitest";
import {
  REITER, REITER_LABEL, istReiter, reiterAus,
  meinRep, meineListen, istZentral, type RepMinimal,
} from "./vertrieb";

const rep = (id: string, name: string, email: string | null, active = true): RepMinimal =>
  ({ rep_id: id, name, email, active });

// 🔴 Drei Vertriebler, und der gesuchte ist NIE der erste. Eine Attrappe mit
// einem einzigen Rep faellt mit dem naiven Weg (reps[0]) zusammen und misst
// nichts.
const KERIM = rep("kerim", "Kerim", "kerim@useeasy.ai");
const MAURICE = rep("maurice", "Maurice", "maurice@useeasy.ai");
const LEON = rep("leon", "Leon", "admin@useeasy.ai");
const DREI = [KERIM, MAURICE, LEON];

describe("Reiter", () => {
  it("kennt genau die sechs Reiter der Arbeitsflaeche", () => {
    expect(REITER).toEqual(["telefon", "leads", "faelle", "calls", "termin", "scripts"]);
  });

  it("jeder Reiter hat eine Beschriftung", () => {
    for (const r of REITER) expect(REITER_LABEL[r]).toBeTruthy();
  });

  it("🔴 ein unbekannter oder fehlender Reiter landet beim Telefon, nicht im Nichts", () => {
    expect(reiterAus(null)).toBe("telefon");
    expect(reiterAus(undefined)).toBe("telefon");
    expect(reiterAus("")).toBe("telefon");
    expect(reiterAus("gibtsnicht")).toBe("telefon");
    // Ein alter /voice-Parameter, der hier landet, faellt ebenfalls sanft.
    expect(reiterAus("consent")).toBe("telefon");
  });

  it("gueltige Reiter bleiben stehen", () => {
    for (const r of REITER) expect(reiterAus(r)).toBe(r);
    expect(istReiter("faelle")).toBe(true);
    expect(istReiter("reps")).toBe(false);
  });
});

describe("meinRep — wer bin ich", () => {
  it("🔴 findet MICH ueber die Konto-Adresse, nicht den ersten in der Liste", () => {
    const w = meinRep(DREI, "admin@useeasy.ai");
    expect(w.repId).toBe("leon");
    expect(w.herkunft).toBe("konto");
    // Der ganze Datensatz kommt mit: die Skript-Linse braucht mehr als die Id.
    expect(w.rep).toBe(LEON);
    // Der naive Weg haette "kerim" geliefert.
    expect(w.repId).not.toBe(DREI[0].rep_id);
  });

  it("die Adresse wird ohne Ruecksicht auf Gross-/Kleinschreibung und Leerzeichen verglichen", () => {
    expect(meinRep(DREI, "  Admin@UseEasy.AI ").repId).toBe("leon");
  });

  it("eine ausdrueckliche Wahl gewinnt gegen die Konto-Adresse", () => {
    const w = meinRep(DREI, "admin@useeasy.ai", "maurice");
    expect(w.repId).toBe("maurice");
    expect(w.herkunft).toBe("gewaehlt");
  });

  it("🔴 eine Wahl auf einen DEAKTIVIERTEN Vertriebler faellt zurueck, statt still weiterzulaufen", () => {
    const reps = [KERIM, rep("maurice", "Maurice", "maurice@useeasy.ai", false), LEON];
    const w = meinRep(reps, "admin@useeasy.ai", "maurice");
    expect(w.repId).toBe("leon");
    expect(w.herkunft).toBe("konto");
    expect(w.auswahl.map((r) => r.rep_id)).not.toContain("maurice");
  });

  it("eine Wahl auf einen Vertriebler, den es gar nicht gibt, faellt ebenfalls zurueck", () => {
    expect(meinRep(DREI, "admin@useeasy.ai", "phantom").repId).toBe("leon");
  });

  it("genau EIN aktiver Vertriebler ist zwangslaeufig ich", () => {
    const w = meinRep([KERIM], "wer@auch.immer");
    expect(w.repId).toBe("kerim");
    expect(w.herkunft).toBe("einziger");
  });

  it("🔴 mehrere Vertriebler und keine passende Adresse: KEINE Zuordnung, es wird gefragt", () => {
    const w = meinRep(DREI, "fremd@woanders.de");
    expect(w.repId).toBeNull();
    expect(w.rep).toBeNull();
    expect(w.herkunft).toBe("keiner");
    expect(w.auswahl).toHaveLength(3);
  });

  it("ein Rep ohne hinterlegte Adresse wird nicht zufaellig getroffen", () => {
    const reps = [rep("a", "A", null), rep("b", "B", null)];
    expect(meinRep(reps, "").repId).toBeNull();
    expect(meinRep(reps, null).repId).toBeNull();
  });

  it("deaktivierte Vertriebler stehen nicht zur Auswahl", () => {
    const reps = [KERIM, rep("alt", "Alt", "alt@useeasy.ai", false)];
    const w = meinRep(reps, "alt@useeasy.ai");
    // Die Adresse passt, der Rep ist aber aus: also einziger aktiver.
    expect(w.repId).toBe("kerim");
    expect(w.auswahl).toHaveLength(1);
  });

  it("leere Eingaben stuerzen nicht ab", () => {
    expect(meinRep(null, null).herkunft).toBe("keiner");
    expect(meinRep([], "a@b.c").auswahl).toEqual([]);
  });
});

describe("meineListen — die Arbeits-Linse auf Lead-Listen", () => {
  const zentral = { list_id: "z", assigned_rep_ids: [] };
  const ohneFeld = { list_id: "o" };
  const meine = { list_id: "m", assigned_rep_ids: ["leon"] };
  const fremde = { list_id: "f", assigned_rep_ids: ["kerim"] };
  const geteilte = { list_id: "g", assigned_rep_ids: ["kerim", "leon"] };
  const alle = [zentral, ohneFeld, meine, fremde, geteilte];

  it("🔴 zeigt meine, geteilte und zentrale Listen — aber NICHT die fremde", () => {
    const ids = meineListen(alle, "leon").map((l) => l.list_id);
    expect(ids).toEqual(["z", "o", "m", "g"]);
    expect(ids).not.toContain("f");
  });

  it("eine Liste ohne Zuweisungs-Feld gilt als zentral (Bestandslisten, kein Backfill)", () => {
    expect(istZentral(ohneFeld)).toBe(true);
    expect(meineListen([ohneFeld], "leon")).toHaveLength(1);
    expect(meineListen([ohneFeld], null)).toHaveLength(1);
  });

  it("🔴 ohne bekannte Zuordnung nur die zentralen — nicht alle", () => {
    const ids = meineListen(alle, null).map((l) => l.list_id);
    expect(ids).toEqual(["z", "o"]);
    // Der bequeme Fehler waere, bei unbekanntem Rep einfach alles zu zeigen.
    expect(ids).not.toContain("m");
    expect(ids).not.toContain("f");
  });

  it("istZentral unterscheidet zentral von zugewiesen", () => {
    expect(istZentral(zentral)).toBe(true);
    expect(istZentral(meine)).toBe(false);
  });

  it("leere Eingabe ist eine leere Liste, kein Absturz", () => {
    expect(meineListen(null, "leon")).toEqual([]);
    expect(meineListen(undefined, null)).toEqual([]);
  });
});
