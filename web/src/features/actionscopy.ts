// REQ-14 (plan m4-reconcile)'s End/Remove confirm dialogs' body-text composition — split
// out of render/confirm.ts (review seed B7: a DOM-free decision with one controller
// caller, features/actions.ts, lives beside it, not in `render/`). `render/confirm.ts`
// stays the DOM half: `initConfirmDialogs`'s `openEnd`/`openRemove` take the text these
// produce as a parameter and only ever assign it to `textContent`.
import type { Session } from "../protocol/session";
import { buildCardViewModel } from "../sessions/card";

function sessionLabel(session: Session, now: Date): string {
  const title = session.title ?? "untitled";
  return `${title} — ${buildCardViewModel(session, now).repoLine}`;
}

/** REQ-14's End dialog copy: names the session, says it stays as ended and can be
 * resumed. */
export function endDialogBody(session: Session, now: Date): string {
  return (
    `${sessionLabel(session, now)}. Kills the tmux pane and the claude inside it. The card stays in the rail ` +
    "as ended — Resume can pick the conversation back up if this was a slip."
  );
}

/** REQ-14's Remove dialog copy: it disappears and cannot be resumed from here, plus —
 * only when the target is still alive — "ends the session first" (E9's exact phrase). */
export function removeDialogBody(session: Session, now: Date): string {
  const endsFirst = session.alive ? " This ends the session first." : "";
  return (
    `${sessionLabel(session, now)}.${endsFirst} Deletes it from Muster for good — the card disappears and it ` +
    "can no longer be resumed from here."
  );
}
