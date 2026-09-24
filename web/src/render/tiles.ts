// Tiles view rendering: the live grid + the snapshot strip (docs/design/mockups/
// d-tiled.html; design-system §4/§5). DOM only — every displayed string comes from
// ../sessions/card.ts's pure view-model, shared with the rail, since a strip card IS a
// rail card on its side.
import type { RailActivity } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import { buildDeadSurfaceFromTemplate, collectDeadSurfaceRefs, renderDeadSurface } from "./dead";
import {
  buildCardViewModel,
  canResume,
  stateBadgeText,
  tileFooterAgeText,
  tileHeaderTimerText,
  type PaneState,
  type SessionAction,
} from "../sessions/card";
import { requireElement } from "../dom";
import { renderContextRow } from "./context";
import { reconcileCards, type CardListOptions } from "./sessions";
import { buildActionButton } from "./actionbutton";
import { attachRenameEditor, type RenameEditorController } from "./rename";
import type { TitleCommand } from "../sessions/rename";
import type { SurfaceKind } from "../terminal/surfaceswitch";
import { buildSurfaceSegment, type SurfaceSegmentRefs } from "./surfaceseg";

export interface TileRefs {
  root: HTMLElement;
  /** Where the caller (features/tiles.ts, via features/surfaces.ts's surface manager)
   * moves a live TerminalSurface's root, OR where a dead tile's dead-surface is
   * mounted — this module never touches a socket or an xterm instance itself. */
  bodySlot: HTMLElement;
  geoEl: HTMLElement;
  markerEl: HTMLElement;
  /** The footer action row — built once, in `buildTile` below. */
  actsEl: HTMLElement;
  /** This tile's rename editor (kb:adr/rename-muster-owned-title-override-wins), attached
   * to `.thead .nm`, built once in
   * `buildTile` below. `features/tiles.ts` calls `cancel()`/`dispose()` on demotion (before
   * the tile leaves the grid) and `setEnabled()` on every connection change. */
  rename: RenameEditorController;
  /** This tile's `claude | shell` segment (kb:adr/surfaces-shell-control-in-tile-footer),
   * built once
   * in `buildTile` and prepended into `.tfoot .acts`. `features/tiles.ts` calls
   * `updateSurfaceSegment` on it every render pass. */
  surfaceSegment: SurfaceSegmentRefs;
}

/** `features/rename.ts` supplies one pair of callbacks, shared by every tile — `getSession` is
 * parameterized by id so `buildTile` can close over the one session this tile owns, and
 * `onCommit` is the single `putTitle` dispatcher both the mainhead and every tile route
 * through (kb:adr/rename-muster-owned-title-override-wins's "one shared editor module serves both"). */
export interface TileRenameHandlers {
  getSession: (id: number) => Session | null;
  onCommit: (id: number, command: TitleCommand) => void;
}

/** Updates one tile's header chrome (title/where/context/timer + state class) in place
 * from the shared view-model, without touching `bodySlot`'s mounted live surface — the
 * only two callers are `buildTile` (fresh chrome) and features/tiles.ts's tiles reconciler
 * (existing chrome, every render pass; rebuilding a
 * live tile's chrome wholesale re-parents its mounted surface root and blurs xterm's
 * textarea, so updates must mutate the existing nodes instead). */
function updateTileChrome(
  root: HTMLElement,
  session: Session,
  now: Date,
  isEditingName: boolean,
): void {
  const vm = buildCardViewModel(session, now);
  root.className = `tile ${vm.stateClass}${vm.ended ? " ended" : ""}`;

  // Every slot below is part of `#tile-template`'s fixed markup (index.html) — required,
  // not optionally guarded, the same rule `render/sessions.ts`'s `applyCardText` follows.
  const dot = requireElement<HTMLElement>(".sdot", root);
  const nameEl = requireElement<HTMLElement>(".nm", root);
  const where = requireElement<HTMLElement>(".wh", root);
  const ctx = requireElement<HTMLElement>(".ctxinfo", root);
  const timer = requireElement<HTMLElement>(".tm", root);

  // The dot carries no text of its own, so a hover is the only
  // way to learn what its colour means — `title` is the same state word the badge/dead
  // surface already use (`stateBadgeText`), not a second copy.
  dot.title = stateBadgeText(session.state);
  // While `refs.rename`'s editor is open, skip the
  // title write entirely so a render tick or `sessionUpsert` mid-edit never touches the
  // open field's value, focus or selection — the caller (`updateTile`) asks the editor's
  // own controller, rather than this module reading DOM state itself (hosts ask the
  // controller, not the DOM). `.nm`
  // wraps a `button.rename` (built once, in `buildTile` below) whose text this writes,
  // never `.nm`'s own textContent, so the button node — and its click listener — survives
  // every tick untouched.
  if (!isEditingName) {
    requireElement<HTMLButtonElement>("button.rename", nameEl).textContent = vm.title;
  }
  where.textContent = vm.repoLine;
  renderContextRow(ctx, session.context, "ctxinfo");
  timer.textContent = tileHeaderTimerText(session, now);
}

/** Builds one tile's chrome (header + empty body slot + footer) from the shared
 * view-model. A live tile is "article-shaped" — the template's root is a bare
 * `<article>`, which is the one plain element that carries an implicit ARIA role
 * (`article`) without any attribute, and its header (`.nm`) carries the session title
 * text. `template` is looked up once by the caller (`features/tiles.ts`'s `initTiles`)
 * and passed in, matching its sibling `mountTileDeadSurface` below — every `render/`
 * builder takes its template as a parameter rather than looking one up itself. */
export function buildTile(
  session: Session,
  now: Date,
  template: HTMLTemplateElement,
  renameHandlers: TileRenameHandlers,
  onSurfaceSelect: (id: number, kind: SurfaceKind) => void,
): TileRefs {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".tile");
  if (!root) throw new Error("tile-template is missing its .tile root");

  const bodySlot = root.querySelector<HTMLElement>(".tbody-slot");
  const geoEl = root.querySelector<HTMLElement>(".geo");
  const markerEl = root.querySelector<HTMLElement>(".marker");
  const actsEl = root.querySelector<HTMLElement>(".acts");
  const nameEl = root.querySelector<HTMLElement>(".nm");
  if (!bodySlot || !geoEl || !markerEl || !actsEl || !nameEl)
    throw new Error("tile-template is missing a required element");

  root.dataset["sessionId"] = String(session.id);

  // Built once, prepended as `.acts`'s permanent first child (kb:adr/surfaces-shell-control-in-tile-footer) —
  // `renderTileFooterActions` below never touches it, only the End/Resume/Remove/age
  // nodes that follow it, so a locator scoped through `article.tile[data-session-id]`
  // finds each control exactly once.
  const surfaceSegment = buildSurfaceSegment((kind) => onSurfaceSelect(session.id, kind));
  actsEl.append(surfaceSegment.root);

  // `.nm` wraps the same rename trigger the mainhead uses (kb:adr/rename-muster-owned-title-override-wins)
  // — built once, here,
  // so `updateTileChrome`'s later passes only ever write its text, never rebuild it (the
  // click listener `attachRenameEditor` wires below survives every tick).
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "rename";
  // The revert path (clear -> Claude Code's own name, kb:adr/rename-muster-owned-title-override-wins)
  // is discoverable without
  // documentation; the accessible name is still the button's text either way (Testable
  // UI Elements).
  renameBtn.title = "Rename · clear to use Claude Code's name";
  nameEl.replaceChildren(renameBtn);
  // The tile is the host that knows about its own `.thead` drag handle — the editor
  // itself holds no selector into its container's markup.
  const rename = attachRenameEditor(nameEl, {
    getSession: () => renameHandlers.getSession(session.id),
    onCommit: renameHandlers.onCommit,
    onEditingChange: (editing) => {
      const head = root.querySelector<HTMLElement>(".thead");
      head?.setAttribute("draggable", editing ? "false" : "true");
    },
  });

  // Freshly attached, so never mid-edit yet.
  updateTileChrome(root, session, now, false);

  return { root, bodySlot, geoEl, markerEl, actsEl, rename, surfaceSegment };
}

/** Refreshes an existing tile's chrome for the current render pass — never rebuilds or
 * re-parents anything (see `updateTileChrome`). Asks the tile's own rename controller
 * whether it's editing, rather than reading DOM state itself. */
export function updateTile(refs: TileRefs, session: Session, now: Date): void {
  updateTileChrome(refs.root, session, now, refs.rename.isEditing());
}

/** Tile footer geometry + live/stopped marker ("tile footers show their real
 * geometry"; design-system §5: the marker reads `live` or `stopped`). Driven by the
 * session's own `alive` flag, not by geometry nullability — a surface that ever
 * attached keeps a non-null `geometry` forever, so a
 * session that dies while its tile is live must not still read `live` just because its
 * last-known geometry is still around. */
export function renderTileGeometry(
  refs: TileRefs,
  alive: boolean,
  geometry: { cols: number; rows: number } | null,
): void {
  refs.geoEl.textContent = geometry ? `${geometry.cols}×${geometry.rows}` : "";
  refs.markerEl.textContent = alive ? "live" : "stopped";
  refs.markerEl.className = alive ? "marker live" : "marker";
}

/** `renderStrip`'s own caller-facing options — a strip card is never
 * draggable and never "current", so those two `CardOptions` fields are
 * this function's own job to fill in, not the caller's. */
export interface StripOptions {
  onAction: (action: SessionAction, id: number) => void;
  connected: boolean;
  railActivity: RailActivity;
}

/** Renders the snapshot strip: the same rail-card markup, on its side — clicking
 * promotes ("clicking a strip card promotes it"). Hides the strip entirely when
 * every session is live ("the strip hides when empty"). `options.onAction`/
 * `options.connected` thread through to each strip card's action row exactly like the rail
 * ("a strip card carries the same pair" — it's the same shared card template).
 * Reconciles by session id via `render/sessions.ts`'s shared `reconcileCards`
 * rather than rebuilding every strip card each tick — same
 * fix, same reason, as the rail's `renderSessions`. `template` is looked up once by the
 * caller (same rule as `buildTile` above). */
export function renderStrip(
  el: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  template: HTMLTemplateElement,
  onPromote: (id: number) => void,
  options: StripOptions,
): void {
  el.hidden = sessions.length === 0;
  if (sessions.length === 0) {
    el.replaceChildren();
    return;
  }
  const cardOptions: CardListOptions = {
    onClick: onPromote,
    onAction: options.onAction,
    connected: options.connected,
    // A strip card is never draggable, regardless of the
    // rail's current sort mode — the strip is a promote surface, not a manual-order drop
    // target.
    draggable: false,
    // Always `null` — a strip card is never "the session the Focus pane is
    // showing" (kb:adr/rail-current-marker-means-shown-in-focus), so it can never carry
    // the marker.
    currentId: null,
    railActivity: options.railActivity,
  };
  reconcileCards(el, sessions, now, template, cardOptions);
}

/** The tile footer action row: a live tile gets End; a dead tile gets the "ended
 * <age> ago" text (the geometry readout's replacement — `.geo` itself stays untouched and
 * empty, per `renderTileGeometry`'s existing frozen contract) plus Resume + Remove. Text
 * and buttons share one `<span class="acts">` ("footer gains a
 * single `.acts` span after `.marker`" — no second element was added for the age text).
 *
 * Updates the existing button(s) in place when the row's shape (live-End vs.
 * dead-age+Resume+Remove) hasn't changed, rather than unconditionally rebuilding —
 * this ran via `actsEl.replaceChildren(...)` on
 * every 1s render tick regardless of whether anything changed, destroying and rebuilding
 * every tile footer's action button(s) a second after they were focused, with focus
 * falling to `<body>` rather than the new node. The row's shape only changes on a
 * genuine live/ended transition, which does legitimately need a rebuild (Resume/Remove
 * didn't exist a moment ago). */
export function renderTileFooterActions(
  actsEl: HTMLElement,
  session: Session,
  now: Date,
  connected: boolean,
  onAction: (action: SessionAction, id: number) => void,
): void {
  // `.surfseg` (built once in `buildTile`, prepended into `.acts`,
  // kb:adr/surfaces-shell-control-in-tile-footer) is a
  // permanent fixture of this row, never part of the shape checks or rebuilds below —
  // only the children AFTER it (End, or age+Resume+Remove) are ever touched.
  const surfaceSegment = actsEl.querySelector<HTMLElement>(":scope > .surfseg");
  const tail = Array.from(actsEl.children).filter((el) => el !== surfaceSegment);

  if (session.alive) {
    const existingEnd = tail.length === 1 ? tail[0] : null;
    if (existingEnd instanceof HTMLButtonElement && existingEnd.dataset["action"] === "end") {
      existingEnd.disabled = !connected;
      return;
    }
    for (const el of tail) el.remove();
    actsEl.append(buildActionButton("End", session.id, connected, onAction));
    return;
  }
  // Leads with "✕" rather than "ended" (mockups/tiles-dead.html's `.tfoot .snap`: "✕
  // ended 6m ago") — deliberately not the word this tile's `.endbar` also starts with
  // (see `tileHeaderTimerText`'s doc comment on the same collision).
  const ageText = tileFooterAgeText(session, now);
  const resumeEnabled = connected && canResume(session.claudeSessionId);

  const [ageEl, resumeEl, removeEl] = tail;
  const sameShape =
    tail.length === 3 &&
    ageEl instanceof HTMLElement &&
    ageEl.className === "tage" &&
    resumeEl instanceof HTMLButtonElement &&
    resumeEl.dataset["action"] === "resume" &&
    removeEl instanceof HTMLButtonElement &&
    removeEl.dataset["action"] === "remove";

  if (
    sameShape &&
    ageEl &&
    resumeEl instanceof HTMLButtonElement &&
    removeEl instanceof HTMLButtonElement
  ) {
    ageEl.textContent = ageText;
    resumeEl.disabled = !resumeEnabled;
    removeEl.disabled = !connected;
    return;
  }

  const age = document.createElement("span");
  age.className = "tage";
  age.textContent = ageText;
  for (const el of tail) el.remove();
  actsEl.append(
    age,
    buildActionButton("Resume", session.id, resumeEnabled, onAction),
    buildActionButton("Remove", session.id, connected, onAction),
  );
}

/** `mountTileDeadSurface`'s own options: the two caller-decided fields, named rather than
 * a positional tail — same shape as `CardOptions`/`StripOptions`. */
export interface MountTileDeadSurfaceOptions {
  connected: boolean;
  onAction: (action: SessionAction, id: number) => void;
}

/** Mounts (once) or refreshes a dead tile's dead-surface inside its
 * `.tbody-slot`, cloning from `#dead-surface-template` the first time this tile goes dead
 * and requerying the existing instance on every later pass — same convention as
 * `updateTileChrome`'s existing chrome nodes, never a live TerminalSurface for `alive:false`.
 * The cap's Resume button's click listener is attached exactly once, only in
 * the fresh-clone branch — `renderDeadSurface` itself runs every pass and only ever
 * updates text/dataset/disabled, never re-wires a listener (which would otherwise stack a
 * new one on the same button every render tick for as long as the tile stays dead). */
export function mountTileDeadSurface(
  bodySlot: HTMLElement,
  session: Session,
  pane: PaneState,
  now: Date,
  template: HTMLTemplateElement,
  options: MountTileDeadSurfaceOptions,
): void {
  const existing = bodySlot.querySelector<HTMLElement>(".dead-surface");
  const refs = existing ? collectDeadSurfaceRefs(existing) : buildDeadSurfaceFromTemplate(template);
  if (!existing) {
    bodySlot.replaceChildren(refs.root);
    refs.resumeBtn.addEventListener("click", () => {
      if (!refs.resumeBtn.disabled) options.onAction("resume", session.id);
    });
  }
  renderDeadSurface(refs, session, pane, now, options.connected);
}
