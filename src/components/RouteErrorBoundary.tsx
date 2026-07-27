import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Auffangnetz um den Seiteninhalt (Redesign 27.07.2026).
 *
 * Bisher hat ein einzelner Render-Fehler — etwa ein unerwartet unvollstaendiges
 * Server-Objekt — die GESAMTE Console weiss gemacht: keine Sidebar, kein Weg
 * zurueck, kein Hinweis. Jetzt bleibt die Huelle stehen und nur der Inhalt wird
 * durch eine ehrliche Fehlermeldung ersetzt.
 *
 * Bewusst KEIN Retry-Loop: die Komponente merkt sich den Fehler, bis der Nutzer
 * "Nochmal versuchen" drueckt oder die Route wechselt (resetKey).
 */
interface Props {
  children: ReactNode;
  /** Wechselt der Wert, wird der Fehlerzustand zurueckgesetzt (z.B. Pfadwechsel). */
  resetKey?: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error && props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    if (state.resetKey !== props.resetKey) return { resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kein externer Logger im Projekt — die Konsole ist die einzige Spur.
    console.error("[UseEasy] Seite abgestuerzt:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="glass-card p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
        <p className="text-sm font-medium text-foreground">Diese Seite konnte nicht dargestellt werden.</p>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
          Das ist ein Anzeigefehler in der Console — deine Daten sind unberührt, und es wurde nichts
          versendet oder gebucht. Die übrigen Bereiche funktionieren weiter.
        </p>
        <p className="mt-3 font-mono text-[11px] text-tx-weak">{this.state.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => this.setState({ error: null })}
        >
          <RotateCw className="mr-1 h-3.5 w-3.5" /> Nochmal versuchen
        </Button>
      </div>
    );
  }
}
