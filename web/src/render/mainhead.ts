// The Focus mainhead — name, meta (repo/branch · model ·
// `ended <age>` when dead), and the End/Resume/Remove action row above the terminal slot
// (kb:adr/actions-placement-mainhead-and-card-rows). DOM only; every displayed string is derived from the Session plus a shared helper
// (card.ts's repoLine/stateBadgeText) so the mainhead never composes a second copy of
// text the card already owns. Static markup (one instance in index.html, unlike the
// per-session card/tile templates) — features/focus.ts wires the three buttons' click
// listeners once at startup and this module only ever toggles their `disabled` state.
import type { Session } from "../protocol/session";
import { canResume, mainheadMeta, resumeDisabledReason } from "../sessions/card";
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import type { SessionSurfaceState } from "../terminal/surfaceswitch";
import { updateSurfaceSegment, type SurfaceSegmentRefs } from "./surfaceseg";

export interface MainheadElements {
  root: HTMLElement;
  nameEl: HTMLElement;
  metaEl: HTMLElement;
  endBtn: HTMLButtonElement;
  resumeBtn: HTMLButtonElement;
  removeBtn: HTMLButtonElement;
  // The rename trigger inside `nameEl` (kb:adr/rename-muster-owned-title-override-wins) —
  // its text is written here on every non-editing pass; `features/rename.ts` attaches the
  // actual editor (render/rename.ts) to `nameEl` once at startup, this module never
  // opens/closes it.
  renameBtn: HTMLButtonElement;
  // The `claude | shell` segment (kb:adr/surfaces-shell-is-attach-target-not-session),
  // built once by features/focus.ts at startup and inserted between `.meta` and `.acts`
  // — this module only ever updates its attributes (below), never rebuilds it.
  surfaceSegment: SurfaceSegmentRefs;
}

/** `session` is the currently-focused one, or `null` when nothing is focused (no
 * sessions at all) — hidden in that case. `connected`
 * gates every button while the WS is down (States: "action buttons are disabled while
 * the WS is down"), on top of each button's own enablement rule:
 * - End: enabled iff `alive`.
 * - Resume: enabled iff `!alive && claudeSessionId`.
 * - Remove: never disabled by session state (only by `connected`).
 *
 * `surfaceState` is the currently-focused session's
 * surface-switch state (features/surfaces.ts's `surfaceSwitchState`, or the default when there is no
 * focused session) — updated every pass regardless of the `!session` branch below, since
 * `updateSurfaceSegment` only ever writes attributes and is harmless while `root` is
 * hidden. `activity` is that same session's `shell` segment
 * busy/done verdict (`features/surfaces.ts`'s `activityFor`). */
export function renderMainhead(
  elements: MainheadElements,
  session: Session | null,
  now: Date,
  connected: boolean,
  surfaceState: SessionSurfaceState,
  activity: ShellActivityIndicator,
  // Asks the rename controller directly (features/focus.ts's caller reads its own
  // attached editor's `isEditing()`), rather than this module reading DOM state off
  // `elements.nameEl` itself. Required, not optional — the one production caller always
  // passes it.
  isEditingName: boolean,
): void {
  if (!session) {
    elements.root.hidden = true;
    // Never `elements.nameEl.textContent = ""` here — that would permanently detach the
    // `button.rename` child `nameEl` must always keep: `features/focus.ts` captures that
    // button once via `requireElement` and `attachRenameEditor` finds it once at
    // startup, with no later rebuild path. `elements.root` is hidden in this state, so
    // the button (and any stale text on it) is not visible; only `metaEl` needs
    // clearing here.
    elements.metaEl.textContent = "";
    updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected, activity);
    return;
  }
  elements.root.hidden = false;
  // While the rename editor is open, skip the title write entirely so a
  // render tick or `sessionUpsert` mid-edit never touches the input's value, focus or
  // selection.
  if (!isEditingName) {
    elements.renameBtn.textContent = session.title ?? "untitled";
  }
  // Same "every render pass, regardless of the editing skip above" rule as its three
  // siblings below — disabling reflects `connected`, not the edit state (States: "the
  // rename button is disabled while the WS is disconnected"; features/rename.ts separately cancels
  // an open edit on disconnect).
  elements.renameBtn.disabled = !connected;
  elements.metaEl.textContent = mainheadMeta(session, now);
  elements.endBtn.disabled = !connected || !session.alive;
  elements.resumeBtn.disabled = !connected || session.alive || !canResume(session.claudeSessionId);
  // A disabled-for-no-claudeSessionId Resume says why, not just sits greyed.
  elements.resumeBtn.title = resumeDisabledReason(session) ?? "";
  elements.removeBtn.disabled = !connected;
  updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected, activity);
}
