// The Focus mainhead — name, meta (repo block, `↳` block while Claude is in another
// checkout, model, `ended <age>` when dead), and the End/Resume/Remove action row above
// the terminal slot (kb:adr/actions-placement-mainhead-and-card-rows). DOM only; every
// displayed string comes from card.ts's `mainheadMeta` view-model so the mainhead never
// composes a second copy of text the card already owns. Static markup (one instance in index.html, unlike the
// per-session card/tile templates) — features/focus.ts wires the three buttons' click
// listeners once at startup and this module only ever toggles their `disabled` state.
import type { Session } from "../protocol/session";
import { requireElement } from "../dom";
import {
  bypassChip,
  canResume,
  mainheadMeta,
  resumeDisabledReason,
  type MainheadMeta,
} from "../sessions/card";
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import type { SessionSurfaceState } from "../terminal/surfaceswitch";
import { renderRepoLines } from "./repolines";
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

/** Fills `.meta`'s static slots (index.html) in place — never rebuilt, since the hover
 * title and the `.rf`/`.rb` text change on a sibling write but nothing here holds focus.
 * The `.loc` group carries the hover for both blocks (kb:adr/rail-repo-line-wraps-at-slash). */
function renderMeta(metaEl: HTMLElement, meta: MainheadMeta): void {
  const loc = requireElement<HTMLElement>(".loc", metaEl);
  loc.title = meta.hover;
  renderRepoLines(requireElement<HTMLElement>(".repo", loc), meta.repo);

  const claudeAt = requireElement<HTMLElement>(".claude-at", loc);
  claudeAt.hidden = meta.claudeAt === null;
  // `.loc` holds two `.sep`s; this first one is the `·` between the blocks. The last, before
  // the model, always shows (index.html).
  requireElement<HTMLElement>(".sep", loc).hidden = meta.claudeAt === null;
  if (meta.claudeAt) renderRepoLines(claudeAt, meta.claudeAt);

  requireElement<HTMLElement>(".model", metaEl).textContent = meta.model;

  const endedAt = requireElement<HTMLElement>(".ended-at", metaEl);
  endedAt.hidden = meta.ended === null;
  requireElement<HTMLElement>(".ended", endedAt).textContent = meta.ended ?? "";
}

/** Trims `.loc` to what it shows. `.loc`'s width follows the window continuously, but the `↳`
 * block shows or gives way whole, so in between `.loc` would hold room for a block it does not
 * draw — and a folder line shorter than the floor leaves the floor's room unused. Measured with
 * the cap cleared, every time, so the decision never feeds on its own result: while the `↳`
 * block is not on `.loc`'s first line, `--loc-cap` (style.css `.mainhead .meta`) caps `.loc` at
 * the repo block plus the room its `·` is drawn in, and the leftover is the header's ordinary
 * free space. Called after every meta write and whenever the pane resizes (features/focus.ts). */
export function fitMainheadMeta(metaEl: HTMLElement): void {
  metaEl.style.removeProperty("--loc-cap");
  if (metaEl.offsetParent === null) return;
  const loc = requireElement<HTMLElement>(".loc", metaEl);
  const repo = requireElement<HTMLElement>(".repo", loc);
  const claudeAt = requireElement<HTMLElement>(".claude-at", loc);
  const locBox = loc.getBoundingClientRect();
  if (!claudeAt.hidden && claudeAt.getBoundingClientRect().top < locBox.bottom - 1) return;
  const repoBox = repo.getBoundingClientRect();
  const room = Number.parseFloat(getComputedStyle(repo).marginRight) || 0;
  metaEl.style.setProperty("--loc-cap", `${repoBox.right + room - locBox.left}px`);
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
    // the button (and any stale text on it) is not visible. `metaEl` is the same: its static
    // slots (index.html) stay, and the next focused pass overwrites them.
    updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected, activity);
    return;
  }
  elements.root.hidden = false;
  // While the rename editor is open, skip the title write entirely so a
  // render tick or `sessionUpsert` mid-edit never touches the input's value, focus or
  // selection.
  if (!isEditingName) {
    const title = session.title ?? "untitled";
    elements.renameBtn.textContent = title;
    // The heading ends a long title in an ellipsis, so the hover reads it in full.
    elements.renameBtn.title = title;
  }
  // Same "every render pass, regardless of the editing skip above" rule as its three
  // siblings below — disabling reflects `connected`, not the edit state (States: "the
  // rename button is disabled while the WS is disconnected"; features/rename.ts separately cancels
  // an open edit on disconnect).
  elements.renameBtn.disabled = !connected;
  renderMeta(elements.metaEl, mainheadMeta(session, now));
  // The danger `bypass` chip, shared markup/class with a rail card and a tile
  // header (sessions/card.ts's `bypassChip`) — looked up on `elements.root` rather than a
  // dedicated `MainheadElements` field, matching `render/tiles.ts`'s `updateTileChrome`
  // (a `requireElement` lookup per chrome slot, not one field per slot).
  requireElement<HTMLElement>(".chip-danger", elements.root).hidden = !bypassChip(session);
  elements.endBtn.disabled = !connected || !session.alive;
  elements.resumeBtn.disabled = !connected || session.alive || !canResume(session.claudeSessionId);
  // A disabled-for-no-claudeSessionId Resume says why, not just sits greyed.
  elements.resumeBtn.title = resumeDisabledReason(session) ?? "";
  elements.removeBtn.disabled = !connected;
  updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected, activity);
  // Last, once every slot that shares the header's row (title, chip, meta) holds this pass's text.
  fitMainheadMeta(elements.metaEl);
}
