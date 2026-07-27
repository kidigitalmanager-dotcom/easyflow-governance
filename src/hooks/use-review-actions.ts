import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useSubmitReviewVerdict, useDismissReview } from "@/hooks/use-api";
import { REVIEW } from "@/data/strings.de";

/**
 * Redesign 27.07.2026 — EINE Quelle fuer die Freigabe-Aktionen.
 *
 * Der neue Tastatur-Flow (F / A / ↓) und die Buttons im Detail muessen exakt
 * dasselbe tun: derselbe Endpunkt, dieselbe Lernschleife, dieselben Toasts.
 * Deshalb liegen approve/edit/reject/dismiss hier und werden von beiden
 * Seiten aufgerufen — Tastatur und Maus koennen nicht auseinanderlaufen.
 *
 * Wirkung unveraendert (v4.18.0): approve/edit legt den Entwurf via
 * Gmail/Outlook in den ENTWUERFE-Ordner. UseEasy sendet nie selbst.
 */

// Modul-Ebene statt im Hook: der Fehler-Toast haengt an keinem State und waere
// sonst bei jedem Render eine neue Funktion (und damit ein instabiles Callback).
const onErr = (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e)));

export function useReviewActions() {
  const submit = useSubmitReviewVerdict();
  const dismiss = useDismissReview();

  /* Referenz-stabil, weil die ReviewQueue dieses Objekt als Effekt-Dependency
     fuehrt: bisher entstand pro Render ein NEUES Objekt, wodurch der globale
     keydown-Listener bei jedem Render ab- und wieder angemeldet wurde.
     `mutate` ist in react-query v5 selbst stabil, die Callbacks bleiben es
     damit auch. `isPending` gehoert bewusst IN die Abhaengigkeiten: es steuert
     die disabled-Zustaende der Buttons und die Tastatur-Sperre und muss
     aktuell bleiben — das Objekt wechselt also nur, wenn sich wirklich etwas
     aendert, statt bei jedem Render. Verhalten unveraendert. */
  const submitMutate = submit.mutate;
  const dismissMutate = dismiss.mutate;
  const isPending = submit.isPending || dismiss.isPending;

  const approve = useCallback(
    (draftId: string, onDone?: () => void) => {
      submitMutate(
        { draft_id: draftId, human_verdict: "approve" },
        {
          onSuccess: () => {
            toast.success(REVIEW.approvedToast);
            onDone?.();
          },
          onError: onErr,
        },
      );
    },
    [submitMutate],
  );

  const edit = useCallback(
    (draftId: string, body: string, onDone?: () => void) => {
      submitMutate(
        { draft_id: draftId, human_verdict: "edit", draft_body_final: body },
        {
          onSuccess: (data) => {
            toast.success(`${REVIEW.editedToast} (${data.edit_distance} Zeichen geändert)`);
            onDone?.();
          },
          onError: onErr,
        },
      );
    },
    [submitMutate],
  );

  const reject = useCallback(
    (draftId: string, onDone?: () => void) => {
      submitMutate(
        { draft_id: draftId, human_verdict: "reject" },
        {
          onSuccess: () => {
            toast.success(REVIEW.rejectedToast);
            onDone?.();
          },
          onError: onErr,
        },
      );
    },
    [submitMutate],
  );

  /** Ohne Entwurf: Vorgang aus der Queue nehmen (reversibel). */
  const dismissEvent = useCallback(
    (eventId: string, onDone?: () => void) => {
      dismissMutate(
        { event_id: eventId },
        {
          onSuccess: () => {
            toast.success("Verworfen.");
            onDone?.();
          },
          onError: onErr,
        },
      );
    },
    [dismissMutate],
  );

  return useMemo(
    () => ({ isPending, approve, edit, reject, dismissEvent }),
    [isPending, approve, edit, reject, dismissEvent],
  );
}
