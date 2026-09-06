// Tiles view rendering: the live grid + the snapshot strip (docs/design/mockups/
// d-tiled.html; design-system §4/§5). DOM only — every displayed string comes from
// ../sessions/card.ts's pure view-model, shared with the rail, since a strip card IS a
// rail card per the plan's UI spec: "the M1 card content on its side".
import type { Session } from "../protocol";
import { buildDeadSurfaceFromTemplate, collectDeadSurfaceRefs, renderDeadSurface, type PaneState } from "./dead";
import { buildCardViewModel, stateBadgeText } from "../sessions/card";
import { formatEndedAge, formatEndedAgo } from "../sessions/format";
import { renderContextRow } from "./context";
import { buildActionButton, reconcileCards, type SessionAction } from "./sessions";
import { attachRenameEditor, type RenameEditorController } from "./rename";
import type { TitleCommand } from "../sessions/rename";
import { buildSurfaceSegment, type SurfaceKind, type SurfaceSegmentRefs } from "../terminal/surfaceswitch";

function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}

export interface TileRefs {
  root: HTMLElement;
  /** Where the caller (main.ts's surface manager) moves a live TerminalSurface's root, OR
   * (REQ-12) where a dead tile's dead-surface is mounted — this module never touches a
   * socket or an xterm instance itself. */
  bodySlot: HTMLElement;
  geoEl: HTMLElement;
  markerEl: HTMLElement;
  /** REQ-12's footer action row — optional so `tiles.test.ts`'s existing hand-built
   * `TileRefs` fixtures (built before this plan, with only the four original fields) keep
   * typechecking unchanged; every real tile built via `buildTile` always has one. */
  actsEl?: HTMLElement;
  /** REQ-13/REQ-15: this tile's rename editor, attached to `.thead .nm` — optional for
   * the same pre-plan-fixture reason as `actsEl` above; every real tile built via
   * `buildTile` always has one. `main.ts` calls `cancel()`/`dispose()` on demotion
   * (before the tile leaves the grid) and `setEnabled()` on every connection change. */
  rename?: RenameEditorController;
  /** Plan plain-terminal-session REQ-4: this tile's `claude | shell` segment, built once
   * in `buildTile` and prepended into `.tfoot .acts` — optional for the same pre-plan-
   * fixture reason as `actsEl`/`rename` above; every real tile built via `buildTile`
   * always has one. `main.ts` calls `updateSurfaceSegment` on it every render pass. */
  surfaceSegment?: SurfaceSegmentRefs;
}

/** `main.ts` supplies one pair of callbacks, shared by every tile — `getSession` is
 * parameterized by id so `buildTile` can close over the one session this tile owns, and
 * `onCommit` is the single `putTitle` dispatcher both the mainhead and every tile route
 * through (REQ-13's "one shared editor module serves both"). */
export interface TileRenameHandlers {
  getSession: (id: number) => Session | null;
  onCommit: (id: number, command: TitleCommand) => void;
}

/** Updates one tile's header chrome (title/where/context/timer + state class) in place
 * from the shared view-model, without touching `bodySlot`'s mounted live surface — the
 * only two callers are `buildTile` (fresh chrome) and main.ts's tiles reconciler
 * (existing chrome, every render pass; review m2-terminal Critical 2: rebuilding a
 * live tile's chrome wholesale re-parents its mounted surface root and blurs xterm's
 * textarea, so updates must mutate the existing nodes instead). */
function updateTileChrome(root: HTMLElement, session: Session, now: Date): void {
  const vm = buildCardViewModel(session, now);
  root.className = `tile ${vm.stateClass}${vm.ended ? " ended" : ""}`;

  const dot = root.querySelector<HTMLElement>(".sdot");
  const nameEl = root.querySelector<HTMLElement>(".nm");
  const where = root.querySelector<HTMLElement>(".wh");
  const ctx = root.querySelector<HTMLElement>(".ctxinfo");
  const timer = root.querySelector<HTMLElement>(".tm");

  // REQ-9 (plan move-tiles): the dot carries no text of its own, so a hover is the only
  // way to learn what its colour means — `title` is the same state word the badge/dead
  // surface already use (`stateBadgeText`), not a second copy.
  if (dot) dot.title = stateBadgeText(session.state);
  // REQ-15/INV-4 (plan ui-text-and-focus): render/rename.ts marks `.nm` with
  // `data-editing="true"` while its editor is open — skip the title write entirely so a
  // render tick or `sessionUpsert` mid-edit never touches the open field's value, focus
  // or selection. `.nm` wraps a `button.rename` (built once, in `buildTile` below) whose
  // text this writes, never `.nm`'s own textContent, so the button node — and its click
  // listener — survives every tick untouched.
  if (nameEl && nameEl.dataset["editing"] !== "true") {
    const renameBtn = nameEl.querySelector<HTMLButtonElement>("button.rename");
    if (renameBtn) renameBtn.textContent = vm.title;
  }
  if (where) where.textContent = vm.repoLine;
  if (ctx) renderContextRow(ctx, session.context, "ctxinfo");
  // A dead tile's header timer shows the bare age, deliberately WITHOUT the "ended"
  // word — `vm.timer` ("ended <age>") is the rail/strip card's own wording (REQ-9), and
  // a tile's dead-surface (mounted in the same subtree, unlike a card) already has an
  // `.endbar` that starts with "ended " per the Testable UI Elements' `/^ended /`
  // contract. Two elements inside one tile both starting with "ended " would make any
  // `tile.getByText(/^ended /)` locator ambiguous (Playwright strict-mode violation) —
  // REQ-12's own footer age readout (`.tage`, see `renderTileFooterActions`) sidesteps
  // the same trap by leading with "✕" instead.
  if (timer) timer.textContent = session.alive ? vm.timer : session.endedAt ? formatEndedAge(session.endedAt, now) : "";
}

/** Builds one tile's chrome (header + empty body slot + footer) from the shared
 * view-model. The Testable UI Elements table calls a live tile "article-shaped" — the
 * template's root is a bare `<article>`, which is the one plain element that carries an
 * implicit ARIA role (`article`) without any attribute, and its header (`.nm`) carries
 * the session title text the table also requires. */
export function buildTile(
  session: Session,
  now: Date,
  renameHandlers: TileRenameHandlers,
  onSurfaceSelect: (id: number, kind: SurfaceKind) => void,
): TileRefs {
  const template = requireTemplate("tile-template");
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const root = fragment.querySelector<HTMLElement>(".tile");
  if (!root) throw new Error("tile-template is missing its .tile root");

  const bodySlot = root.querySelector<HTMLElement>(".tbody-slot");
  const geoEl = root.querySelector<HTMLElement>(".geo");
  const markerEl = root.querySelector<HTMLElement>(".marker");
  const actsEl = root.querySelector<HTMLElement>(".acts");
  const nameEl = root.querySelector<HTMLElement>(".nm");
  if (!bodySlot || !geoEl || !markerEl || !actsEl || !nameEl) throw new Error("tile-template is missing a required element");

  root.dataset["sessionId"] = String(session.id);

  // REQ-4/REQ-13: built once, prepended as `.acts`'s permanent first child —
  // `renderTileFooterActions` below never touches it, only the End/Resume/Remove/age
  // nodes that follow it (Testable UI Elements: "scope through
  // article.tile[data-session-id]").
  const surfaceSegment = buildSurfaceSegment((kind) => onSurfaceSelect(session.id, kind));
  actsEl.append(surfaceSegment.root);

  // REQ-13(b): `.nm` wraps the same rename trigger the mainhead uses — built once, here,
  // so `updateTileChrome`'s later passes only ever write its text, never rebuild it (the
  // click listener `attachRenameEditor` wires below survives every tick).
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "rename";
  // REQ-19: the revert path (clear -> Claude Code's own name) is discoverable without
  // documentation; the accessible name is still the button's text either way (Testable
  // UI Elements).
  renameBtn.title = "Rename · clear to use Claude Code's name";
  nameEl.replaceChildren(renameBtn);
  const rename = attachRenameEditor(nameEl, {
    getSession: () => renameHandlers.getSession(session.id),
    onCommit: renameHandlers.onCommit,
  });

  updateTileChrome(root, session, now);

  return { root, bodySlot, geoEl, markerEl, actsEl, rename, surfaceSegment };
}

/** Refreshes an existing tile's chrome for the current render pass — never rebuilds or
 * re-parents anything (see `updateTileChrome`). */
export function updateTile(refs: TileRefs, session: Session, now: Date): void {
  updateTileChrome(refs.root, session, now);
}

/** Tile footer geometry + live/stopped marker (REQ-15's "tile footers show their real
 * geometry"; design-system §5: the marker reads `live` or `stopped`). Driven by the
 * session's own `alive` flag, not by geometry nullability — review m2-terminal
 * Critical 5: a surface that ever attached keeps a non-null `geometry` forever, so a
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

/** Renders the snapshot strip: the same rail-card markup, on its side — clicking
 * promotes (REQ-8's "clicking a strip card promotes it"). Hides the strip entirely when
 * every session is live (plan edge case 7: "the strip hides when empty"). `onAction`/
 * `connected` thread through to each strip card's action row exactly like the rail
 * (REQ-11's "a strip card carries the same pair" — it's the same shared card template).
 * Reconciles by session id via `render/sessions.ts`'s shared `reconcileCards` (review
 * m4-reconcile cycle-2 Major 1) rather than rebuilding every strip card each tick — same
 * fix, same reason, as the rail's `renderSessions`. */
export function renderStrip(
  el: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  onPromote: (id: number) => void,
  onAction?: (action: SessionAction, id: number) => void,
  connected = true,
): void {
  el.hidden = sessions.length === 0;
  if (sessions.length === 0) {
    el.replaceChildren();
    return;
  }
  const template = requireTemplate("session-card-template");
  // Plan order-sidebar REQ-13: a strip card is never draggable, regardless of the rail's
  // current sort mode — the strip is a promote surface, not a manual-order drop target.
  // REQ-1: `currentId` is always `null` here — a strip card is never "the session the
  // Focus pane is showing" (edge case 14), so it can never carry the marker.
  reconcileCards(el, sessions, now, template, onPromote, onAction, connected, false, undefined, null);
}

/** REQ-12's tile footer action row: a live tile gets End; a dead tile gets the "ended
 * <age> ago" text (the geometry readout's replacement — `.geo` itself stays untouched and
 * empty, per `renderTileGeometry`'s existing frozen contract) plus Resume + Remove. Text
 * and buttons share one `<span class="acts">` (the plan's own DOM spec: "footer gains a
 * single `.acts` span after `.marker`" — no second element was added for the age text).
 *
 * Updates the existing button(s) in place when the row's shape (live-End vs.
 * dead-age+Resume+Remove) hasn't changed, rather than unconditionally rebuilding —
 * review m4-reconcile cycle-2 Major 1: this ran via `actsEl.replaceChildren(...)` on
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
  onAction?: (action: SessionAction, id: number) => void,
): void {
  // REQ-4/REQ-13: `.surfseg` (built once in `buildTile`, prepended into `.acts`) is a
  // permanent fixture of this row, never part of the shape checks or rebuilds below —
  // only the children AFTER it (End, or age+Resume+Remove) are ever touched. Falls back
  // to treating every child as "tail" when there's no surfseg present (pre-plan hand-
  // built fixtures, none of which exist for this function today, but matching the same
  // defensive shape as `TileRefs`'s other optional fields).
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
  // (see `updateTileChrome`'s comment on the same collision).
  const ageText = session.endedAt ? `✕ ended ${formatEndedAgo(session.endedAt, now)}` : "✕ ended";
  const resumeEnabled = connected && session.claudeSessionId !== null;

  const [ageEl, resumeEl, removeEl] = tail;
  const sameShape =
    tail.length === 3 &&
    ageEl instanceof HTMLElement &&
    ageEl.className === "tage" &&
    resumeEl instanceof HTMLButtonElement &&
    resumeEl.dataset["action"] === "resume" &&
    removeEl instanceof HTMLButtonElement &&
    removeEl.dataset["action"] === "remove";

  if (sameShape && ageEl && resumeEl instanceof HTMLButtonElement && removeEl instanceof HTMLButtonElement) {
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

/** REQ-12/REQ-13: mounts (once) or refreshes a dead tile's dead-surface inside its
 * `.tbody-slot`, cloning from `#dead-surface-template` the first time this tile goes dead
 * and requerying the existing instance on every later pass — same convention as
 * `updateTileChrome`'s existing chrome nodes, never a live TerminalSurface for `alive:false`
 * (W8/INV-5). The cap's Resume button's click listener is attached exactly once, only in
 * the fresh-clone branch — `renderDeadSurface` itself runs every pass and only ever
 * updates text/dataset/disabled, never re-wires a listener (which would otherwise stack a
 * new one on the same button every render tick for as long as the tile stays dead). */
export function mountTileDeadSurface(
  bodySlot: HTMLElement,
  session: Session,
  pane: PaneState,
  now: Date,
  connected: boolean,
  template: HTMLTemplateElement,
  onAction?: (action: SessionAction, id: number) => void,
): void {
  const existing = bodySlot.querySelector<HTMLElement>(".dead-surface");
  const refs = existing ? collectDeadSurfaceRefs(existing) : buildDeadSurfaceFromTemplate(template);
  if (!existing) {
    bodySlot.replaceChildren(refs.root);
    refs.resumeBtn.addEventListener("click", () => {
      if (!refs.resumeBtn.disabled) onAction?.("resume", session.id);
    });
  }
  renderDeadSurface(refs, session, pane, now, connected);
}
