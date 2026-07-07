import { Fragment, type ReactNode } from "react";

// Minimaler, XSS-sicherer Inline-Renderer fuer Jana-Antworten: rendert **fett**
// als <strong>, alles andere bleibt literaler Text. Es wird KEIN HTML injiziert
// (wir bauen React-Knoten), roher Markup aus der Modell-Ausgabe kann also nie
// ausgefuehrt werden. Deckt den gemeldeten Fall (**Ueberschrift**) ab.
export function renderRichText(text: string | null | undefined): ReactNode {
  if (!text) return text ?? null;
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((seg, i) => {
    const m = /^\*\*([^*\n]+)\*\*$/.exec(seg);
    return m
      ? <strong key={i} className="font-semibold text-foreground">{m[1]}</strong>
      : <Fragment key={i}>{seg}</Fragment>;
  });
}
