import type { MouseEvent, PointerEvent } from "react";

/**
 * Closes a dialog only when a press both starts and ends on its backdrop.
 * Closing on the first touch lost unsaved forms on phones, where the keyboard
 * moves the sheet and a tap meant for a field lands on the backdrop, and on
 * desktop when a text selection drag ended outside the dialog.
 */
export function backdropDismiss(onClose: () => void) {
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.dataset.pressStart =
        event.target === event.currentTarget ? "1" : "";
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const started = event.currentTarget.dataset.pressStart === "1";
      event.currentTarget.dataset.pressStart = "";
      if (started && event.target === event.currentTarget) onClose();
    },
  };
}
