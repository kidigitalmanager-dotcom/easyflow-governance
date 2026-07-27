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
export function useReviewActions() {
  const submit = useSubmitReviewVerdict();
  const dismiss = useDismissReview();

  const onErr = (e: unknown) => toast.error("Fehler: " + (e instanceof Error ? e.message : String(e)));

  return {
    isPending: submit.isPending || dismiss.isPending,

    approve(draftId: string, onDone?: () => void) {
      submit.mutate(
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

    edit(draftId: string, body: string, onDone?: () => void) {
      submit.mutate(
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

    reject(draftId: string, onDone?: () => void) {
      submit.mutate(
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

    /** Ohne Entwurf: Vorgang aus der Queue nehmen (reversibel). */
    dismissEvent(eventId: string, onDone?: () => void) {
      dismiss.mutate(
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
  };
}
