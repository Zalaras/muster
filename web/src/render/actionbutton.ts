// One action button (card/strip/tile-footer), shared across every surface that renders
// one of REQ-11/REQ-12's End/Resume/Remove rows (plan m4-reconcile) — split out of
// render/sessions.ts (review seed B11: shared by `render/sessions.ts` and
// `render/tiles.ts`, so it belongs to neither).
import type { CardAction, SessionAction } from "../sessions/card";

const ACTION_BY_LABEL: Record<CardAction, SessionAction> = {
  End: "end",
  Resume: "resume",
  Remove: "remove",
};

/** `event.stopPropagation()` is REQ-11's explicit requirement ("Clicks on the buttons do
 * not change focus") — attached directly on the button rather than via a delegated
 * container listener, so it always runs before the card's own click-to-focus listener
 * regardless of DOM nesting. `enabled` folds in both the connection-down gate (States:
 * "action buttons are disabled while the WS is down") and any per-action rule (e.g.
 * Resume needs a claudeSessionId) the caller already computed. */
export function buildActionButton(
  label: CardAction,
  id: number,
  enabled: boolean,
  onAction?: (action: SessionAction, id: number) => void,
): HTMLButtonElement {
  const action = ACTION_BY_LABEL[label];
  const btn = document.createElement("button");
  btn.type = "button";
  // Mockup fidelity (opt-c-both.html/tiles-dead.html): every Remove button carries the
  // same `.danger` (hover-danger, design-system §1/§3's --danger family, cycle-3
  // Major 2) treatment, End/Resume stay plain.
  btn.className = label === "Remove" ? "btn sm danger" : "btn sm";
  btn.textContent = label;
  btn.dataset["action"] = action;
  btn.dataset["id"] = String(id);
  btn.disabled = !enabled;
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!btn.disabled) onAction?.(action, id);
  });
  return btn;
}
