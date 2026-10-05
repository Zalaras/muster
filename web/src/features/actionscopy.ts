// Stop/Remove confirm dialogs' body-text composition — split
// out of render/confirm.ts: a DOM-free decision with one controller
// caller, features/actions.ts, lives beside it, not in `render/`. `render/confirm.ts`
// stays the DOM half: `initConfirmDialogs`'s `openEnd`/`openRemove` take the text these
// produce as a parameter and only ever assign it to `textContent`.
import type { Session } from "../protocol/session";
import { displayTitle, repoLine } from "../sessions/card";

/** The single-session dialogs' title and confirm label — the markup's own text, passed in like
 * the batch copy (features/groupscopy.ts) because one dialog serves both. */
export const END_DIALOG_TITLE = "Stop session?";
export const END_CONFIRM_LABEL = "Stop session";
export const REMOVE_DIALOG_TITLE = "Remove session?";
export const REMOVE_CONFIRM_LABEL = "Remove";

function sessionLabel(session: Session): string {
  return `${displayTitle(session)} — ${repoLine(session)}`;
}

/** Stop dialog copy: names the session, says it stays as ended and can be
 * resumed. */
export function endDialogBody(session: Session): string {
  return (
    `${sessionLabel(session)}. Kills the tmux pane and the claude inside it. The card stays in the rail ` +
    "as ended — Resume can pick the conversation back up if this was a slip."
  );
}

/** Remove dialog copy (kb:adr/actions-remove-allowed-on-live-session): it disappears and
 * cannot be resumed from here, plus — only when the target is still alive — "ends the
 * session first", the exact phrase web/e2e/actions.spec.ts asserts. */
export function removeDialogBody(session: Session): string {
  const endsFirst = session.alive ? " This ends the session first." : "";
  return (
    `${sessionLabel(session)}.${endsFirst} Deletes it from Muster for good — the card disappears and it ` +
    "can no longer be resumed from here."
  );
}
