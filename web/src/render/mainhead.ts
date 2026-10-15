import type { Session } from "../protocol/session";
import { requireElement } from "../dom";
import {
  bypassChip,
  displayTitle,
  mainheadMeta,
  stopResumeButton,
  type MainheadMeta,
  type StopResumeButton,
} from "../sessions/card";
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import type { SessionSurfaceState } from "../terminal/surfaceswitch";
import { renderEffortStrip } from "./effortstrip";
import { renderRepoLines } from "./repolines";
import { updateSurfaceSegment, type SurfaceSegmentRefs } from "./surfaceseg";

export interface MainheadElements {
  root: HTMLElement;
  nameEl: HTMLElement;
  metaEl: HTMLElement;
  stopResumeBtn: HTMLButtonElement;
  removeBtn: HTMLButtonElement;
  // The rename trigger inside `nameEl` (kb:adr/rename-muster-owned-title-override-wins) —
  // its text is written here on every non-editing pass; `features/rename.ts` attaches the
  // actual editor (render/rename.ts) to `nameEl` once at startup, this module never
  // opens/closes it.
  renameBtn: HTMLButtonElement;
  // The group control between the name and the repo readout: its label is written here, its click
  // is wired once by features/focus.ts, which also owns the Move to menu it opens
  // (kb:adr/focus-group-control-hides-below-640px-container-width — the CSS hides it).
  groupBtn: HTMLButtonElement;
  surfaceSegment: SurfaceSegmentRefs;
  effortStrip: HTMLElement;
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

  renderModel(requireElement<HTMLElement>(".model", metaEl), meta);

  const endedAt = requireElement<HTMLElement>(".ended-at", metaEl);
  endedAt.hidden = meta.ended === null;
  requireElement<HTMLElement>(".ended", endedAt).textContent = meta.ended ?? "";
}

function renderModel(modelEl: HTMLElement, meta: MainheadMeta): void {
  modelEl.classList.toggle("holds-eff", meta.effort.reservesBrackets);
  writeModelText(modelEl, meta.model);
  writeEffort(modelEl, meta.effort);
}

function writeModelText(modelEl: HTMLElement, model: string): void {
  const first = modelEl.firstChild;
  if (first && first.nodeType === Node.TEXT_NODE) {
    if (first.nodeValue !== model) first.nodeValue = model;
    return;
  }
  modelEl.replaceChildren(model);
}

function writeEffort(modelEl: HTMLElement, effort: MainheadMeta["effort"]): void {
  const existing = modelEl.querySelector<HTMLElement>(".eff");
  if (effort.brackets === null) {
    existing?.remove();
    return;
  }
  const eff = existing ?? document.createElement("span");
  if (!existing) modelEl.append(eff);
  const className = effort.warn ? "eff warn" : "eff";
  if (eff.className !== className) eff.className = className;
  if (eff.textContent !== effort.brackets) eff.textContent = effort.brackets;
}

export function fitMainheadMeta(metaEl: HTMLElement, root: HTMLElement): void {
  metaEl.style.removeProperty("--loc-cap");
  if (metaEl.offsetParent === null) return;
  metaEl.classList.remove("stacked");
  const loc = requireElement<HTMLElement>(".loc", metaEl);
  loc.classList.remove("repo-only");
  const claudeAt = requireElement<HTMLElement>(".claude-at", loc);
  if (!claudeAt.hidden && onOneRow(root)) return;
  loc.classList.add("repo-only");
  const repo = requireElement<HTMLElement>(".repo", loc);
  const repoBox = repo.getBoundingClientRect();
  const room = Number.parseFloat(getComputedStyle(repo).marginRight) || 0;
  metaEl.style.setProperty(
    "--loc-cap",
    `${repoBox.right + room - loc.getBoundingClientRect().left}px`,
  );
  stackMeta(metaEl, root);
}

function stackMeta(metaEl: HTMLElement, root: HTMLElement): void {
  const title = requireElement<HTMLElement>(".name", root);
  if (sharesRow(metaEl, title)) return;
  metaEl.classList.add("stacked");
  const rename = requireElement<HTMLElement>(".rename", title);
  if (rename.scrollWidth > rename.clientWidth)
    metaEl.style.setProperty("--loc-cap", "var(--loc-floor)");
}

function onOneRow(root: HTMLElement): boolean {
  return sharesRow(
    requireElement<HTMLElement>(".acts", root),
    requireElement<HTMLElement>(".idrow", root),
  );
}

function sharesRow(el: HTMLElement, other: HTMLElement): boolean {
  return el.getBoundingClientRect().top < other.getBoundingClientRect().bottom - 1;
}

function renderStopResume(btn: HTMLButtonElement, view: StopResumeButton): void {
  if (btn.textContent !== view.label) btn.textContent = view.label;
  btn.dataset["action"] = view.action;
  btn.disabled = view.disabled;
  btn.title = view.reason ?? "";
}

/** `session` is the currently-focused one, or `null` when nothing is focused (no
 * sessions at all) — hidden in that case. `connected`
 * gates every button while the WS is down (States: "action buttons are disabled while
 * the WS is down"), on top of each button's own enablement rule:
 * - Stop/Resume: one button (sessions/card.ts's `stopResumeButton`) — `Stop` while alive,
 *   `Resume` (enabled iff a Claude session id is bound) while dead.
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
  // The focused session's group name, or `no group` (sessions/sections.ts's `groupLabel`).
  groupText: string,
): void {
  if (!session) {
    elements.root.hidden = true;
    renderEffortStrip(elements.effortStrip, null);
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
    const title = displayTitle(session);
    elements.renameBtn.textContent = title;
    // The heading ends a long title in an ellipsis, so the hover reads it in full.
    elements.renameBtn.title = title;
  }
  // Same "every render pass, regardless of the editing skip above" rule as its three
  // siblings below — disabling reflects `connected`, not the edit state (States: "the
  // rename button is disabled while the WS is disconnected"; features/rename.ts separately cancels
  // an open edit on disconnect).
  elements.renameBtn.disabled = !connected;
  const meta = mainheadMeta(session, now);
  renderMeta(elements.metaEl, meta);
  renderEffortStrip(elements.effortStrip, meta.effort.strip);
  // The danger `bypass` chip, shared markup/class with a rail card and a tile
  // header (sessions/card.ts's `bypassChip`) — looked up on `elements.root` rather than a
  // dedicated `MainheadElements` field, matching `render/tiles.ts`'s `updateTileChrome`
  // (a `requireElement` lookup per chrome slot, not one field per slot).
  requireElement<HTMLElement>(".chip-danger", elements.root).hidden = !bypassChip(session);
  const groupName = requireElement<HTMLElement>(".ig-name", elements.groupBtn);
  if (groupName.textContent !== groupText) groupName.textContent = groupText;
  elements.groupBtn.disabled = !connected;
  renderStopResume(elements.stopResumeBtn, stopResumeButton(session, connected));
  elements.removeBtn.disabled = !connected;
  updateSurfaceSegment(elements.surfaceSegment, surfaceState, connected, activity);
  // Last, once every slot that shares the header's row (title, chip, meta, cluster) holds this pass's text.
  fitMainheadMeta(elements.metaEl, elements.root);
}
