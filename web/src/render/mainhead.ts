// REQ-10 (plan m4-reconcile): the Focus mainhead — name, meta (repo/branch · model ·
// `ended <age>` when dead), and the End/Resume/Remove action row above the terminal slot.
// DOM only; every displayed string is derived from the Session plus a shared helper
// (card.ts's repoLine/stateBadgeText) so the mainhead never composes a second copy of
// text the card already owns. Static markup (one instance in index.html, unlike the
// per-session card/tile templates) — main.ts wires the three buttons' click listeners
// once at startup and this module only ever toggles their `disabled` state.
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";
import { formatEndedAgo } from "../sessions/format";

export interface MainheadElements {
  root: HTMLElement;
  nameEl: HTMLElement;
  metaEl: HTMLElement;
  endBtn: HTMLButtonElement;
  resumeBtn: HTMLButtonElement;
  removeBtn: HTMLButtonElement;
}

/** REQ-10's meta line: "repo/branch · model · `ended <age>` when dead" — reuses
 * `buildCardViewModel`'s `repoLine` (the same repo-or-basename fallback the rail card
 * shows) rather than re-deriving it. */
function mainheadMeta(session: Session, now: Date): string {
  const parts: string[] = [buildCardViewModel(session, now).repoLine];
  if (session.model) parts.push(session.model.displayName);
  if (!session.alive && session.endedAt) parts.push(`ended ${formatEndedAgo(session.endedAt, now)}`);
  return parts.join(" · ");
}

/** `session` is the currently-focused one, or `null` when nothing is focused (no
 * sessions at all) — REQ-10: "Hidden when there is no focused session." `connected`
 * gates every button while the WS is down (States: "action buttons are disabled while
 * the WS is down"), on top of each button's own enablement rule:
 * - End: enabled iff `alive`.
 * - Resume: enabled iff `!alive && claudeSessionId`.
 * - Remove: never disabled by session state (only by `connected`). */
export function renderMainhead(elements: MainheadElements, session: Session | null, now: Date, connected: boolean): void {
  if (!session) {
    elements.root.hidden = true;
    elements.nameEl.textContent = "";
    elements.metaEl.textContent = "";
    return;
  }
  elements.root.hidden = false;
  elements.nameEl.textContent = session.title ?? "untitled";
  elements.metaEl.textContent = mainheadMeta(session, now);
  elements.endBtn.disabled = !connected || !session.alive;
  elements.resumeBtn.disabled = !connected || session.alive || session.claudeSessionId === null;
  elements.removeBtn.disabled = !connected;
}
