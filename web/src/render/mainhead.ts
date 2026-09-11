// REQ-10 (plan m4-reconcile): the Focus mainhead — name, meta (repo/branch · model ·
// `ended <age>` when dead), and the End/Resume/Remove action row above the terminal slot.
// DOM only; every displayed string is derived from the Session plus a shared helper
// (card.ts's repoLine/stateBadgeText) so the mainhead never composes a second copy of
// text the card already owns. Static markup (one instance in index.html, unlike the
// per-session card/tile templates) — features/focus.ts wires the three buttons' click
// listeners once at startup and this module only ever toggles their `disabled` state.
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";
import { formatEndedAgo } from "../sessions/format";
import { DEFAULT_SURFACE_STATE, updateSurfaceSegment, type SessionSurfaceState, type SurfaceSegmentRefs } from "../terminal/surfaceswitch";

export interface MainheadElements {
  root: HTMLElement;
  nameEl: HTMLElement;
  metaEl: HTMLElement;
  endBtn: HTMLButtonElement;
  resumeBtn: HTMLButtonElement;
  removeBtn: HTMLButtonElement;
  // Plan ui-text-and-focus REQ-13: the rename trigger inside `nameEl` — its text is
  // written here on every non-editing pass; `features/rename.ts` attaches the actual
  // editor (render/rename.ts) to `nameEl` once at startup, this module never opens/closes it.
  renameBtn: HTMLButtonElement;
  // Plan plain-terminal-session REQ-4: the `claude | shell` segment, built once by
  // features/focus.ts at startup and inserted between `.meta` and `.acts` — this module
  // only ever updates its attributes (below), never rebuilds it. Optional for the same
  // reason render/tiles.ts's `actsEl`/`rename` are (mainhead.test.ts's pre-existing
  // hand-built `MainheadElements` fixtures, built before this plan, have no such field) —
  // every real caller (features/focus.ts) always supplies one.
  surfaceSegment?: SurfaceSegmentRefs;
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
 * - Remove: never disabled by session state (only by `connected`).
 *
 * `surfaceState` (plan plain-terminal-session) is the currently-focused session's
 * surface-switch state (features/surfaces.ts's `surfaceSwitchState`, or the default when there is no
 * focused session) — updated every pass regardless of the `!session` branch below, since
 * `updateSurfaceSegment` only ever writes attributes and is harmless while `root` is
 * hidden. Defaults to the "no shell yet" state so a caller with no `surfaceSegment`
 * element (mainhead.test.ts's pre-plan fixtures) never needs to pass it. */
export function renderMainhead(
  elements: MainheadElements,
  session: Session | null,
  now: Date,
  connected: boolean,
  surfaceState: SessionSurfaceState = DEFAULT_SURFACE_STATE,
): void {
  if (!session) {
    elements.root.hidden = true;
    // Pre-review fix (ui-text-and-focus): this branch used to run
    // `elements.nameEl.textContent = ""`, which permanently detached the
    // `button.rename` child `nameEl` must always keep (Testable UI Elements:
    // "Mainhead heading — heading — #mainhead h2.name" always contains the rename
    // button; REQ-13(a)). `features/focus.ts` captures that button once via `requireElement`
    // and `attachRenameEditor` finds it once at startup — there is no later rebuild
    // path — and the dashboard always runs one render() pass with zero sessions
    // before the first sessionUpsert, so this branch fired on every page load and
    // wiped the button before any session data ever arrived. `elements.root` is
    // hidden in this state, so the button (and any stale text on it) is not visible;
    // only `metaEl` needs clearing here.
    elements.metaEl.textContent = "";
    if (elements.surfaceSegment) updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected);
    return;
  }
  elements.root.hidden = false;
  // REQ-15/INV-4: `render/rename.ts` marks `nameEl` while its editor is open — skip the
  // title write entirely so a render tick or `sessionUpsert` mid-edit never touches the
  // input's value, focus or selection. The rename button (inside `nameEl`) is written
  // only on the non-editing branch below, same reasoning.
  if (elements.nameEl.dataset["editing"] !== "true") {
    elements.renameBtn.textContent = session.title ?? "untitled";
  }
  // Same "every render pass, regardless of the editing skip above" rule as its three
  // siblings below — disabling reflects `connected`, not the edit state (States: "the
  // rename button is disabled while the WS is disconnected"; features/rename.ts separately cancels
  // an open edit on disconnect).
  elements.renameBtn.disabled = !connected;
  elements.metaEl.textContent = mainheadMeta(session, now);
  elements.endBtn.disabled = !connected || !session.alive;
  elements.resumeBtn.disabled = !connected || session.alive || session.claudeSessionId === null;
  elements.removeBtn.disabled = !connected;
  if (elements.surfaceSegment) updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected);
}
