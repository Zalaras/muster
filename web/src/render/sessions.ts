// Rail cards (design-system §5 card anatomy).
// DOM only — every displayed string comes from ../sessions/card.ts's pure view-model.
import type { RailActivity, RailDensity } from "../protocol/prefs";
import type { Session } from "../protocol/session";
import {
  buildCardViewModel,
  canResume,
  unreadLabel,
  type CardAction,
  type CardViewModel,
  type SessionAction,
} from "../sessions/card";
import { requireElement } from "../dom";
import { renderContextRow } from "./context";
import { captureFocusedControl, type FocusedControl } from "./focuskeep";
import { reconcileKeyedOrder, type KeyedReorderEntry } from "./keyedreorder";
import { buildActionButton } from "./actionbutton";

/** The card/rail options every render function in this module needs,
 * travelling as one named object rather than a positional tail of booleans and
 * nullables — `renderReader(refs, vm)`/`renderUpdateSection(elements, vm)` are this
 * module's siblings for the same shape (`render/mainhead.ts`'s `renderMainhead` takes a
 * positional tail instead). `onClick`
 * only matters to `buildSessionCardElement` (the click/keydown listeners are wired once,
 * never on an update); every other field is read by both build and update. */
export interface CardOptions {
  onClick: (id: number, source: "pointer" | "keyboard") => void;
  // Required, not optional: every real caller (features/rail.ts, features/tiles.ts) passes
  // `deps.actions.dispatch` straight through — there is no card/strip render path that
  // legitimately has no action handler.
  onAction: (action: SessionAction, id: number) => void;
  connected: boolean;
  /** Manual-mode rail cards are draggable (kb:adr/rail-user-owned-manual-order-default);
   * attention-mode rail cards and every
   * strip card are not — the caller decides which, per its own context. */
  draggable: boolean;
  /** The id of the session the Focus pane is showing
   * (kb:adr/rail-current-marker-means-shown-in-focus) — the rail passes
   * `focusedId`; the strip always passes `null` (a strip card is never "current"). */
  currentId: number | null;
  railActivity: RailActivity;
}

/** `reconcileCards`/`renderSessions`'s own options: `CardOptions` plus the one field only
 * a full reconcile pass needs. */
export interface CardListOptions extends CardOptions {
  /** A rail drag's initiating `mousedown` blurs whatever
   * control currently has focus before `dragstart`/`drop` ever runs (same mechanism as
   * `features/tiles.ts`'s own `pendingTileFocus` — see render/dragreorder.ts's header
   * comment), so by the time this reconcile runs a *live* `captureFocusedControl` would find
   * nothing. `features/rail.ts` passes the pre-blur snapshot it stashed from
   * `installDragReorder`'s `onMove` here instead; every other caller (a plain render
   * tick, a pin click, a strip reconcile) omits this and gets the live capture. */
  pendingFocus?: FocusedControl | null | undefined;
}

/** Per-card options: `CardOptions` plus the one field `reconcileCards` computes itself,
 * from the whole ordered list, before calling either card-content function. */
interface CardRenderOptions extends CardOptions {
  /** Whether this is the last pinned entry in display order —
   * decides which card carries `pinned-last`. */
  pinnedLast: boolean;
}

/** Reconciles one card's `.acts-row` in place: when the label sequence is unchanged
 * (the common case — a live card stays End-only, an ended card stays Resume+Remove, on
 * every 1s tick) only each existing button's `disabled` state is refreshed, so the exact
 * button node a keyboard user has focused survives the tick — an unconditional
 * `replaceChildren` every render would destroy and rebuild every action button once a
 * second and drop focus to `<body>` with no automatic re-focus. The label sequence only
 * changes on a genuine live/ended transition, which legitimately does need a rebuilt row
 * (Resume/Remove didn't exist a moment ago). */
function reconcileActsRow(
  actsRow: HTMLElement,
  actions: readonly CardAction[],
  id: number,
  claudeSessionId: string | null,
  connected: boolean,
  onAction: (action: SessionAction, id: number) => void,
): void {
  const existing = Array.from(actsRow.children).filter(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
  );
  const sameShape =
    existing.length === actions.length &&
    existing.every((btn, i) => btn.textContent === actions[i]);

  if (sameShape) {
    existing.forEach((btn, i) => {
      const label = actions[i];
      if (label === undefined) return;
      btn.disabled = !(connected && (label !== "Resume" || canResume(claudeSessionId)));
    });
    return;
  }

  actsRow.replaceChildren(
    ...actions.map((label) => {
      const enabled = connected && (label !== "Resume" || canResume(claudeSessionId));
      return buildActionButton(label, id, enabled, onAction);
    }),
  );
}

/** Writes the card's per-render text into the slots the template already built. Every
 * slot is required — `session-card-template` (index.html) always carries the full set,
 * shared unchanged by the rail card and the strip card. */
function applyCardText(card: HTMLElement, vm: CardViewModel, session: Session): void {
  const name = requireElement<HTMLElement>(".name", card);
  name.textContent = vm.title;
  // `.name` always carries `title` equal to the display title, so a title
  // clamped to one line in compact density can still be read in full on hover.
  name.title = vm.title;

  requireElement<HTMLElement>(".badge", card).textContent = vm.badge;
  requireElement<HTMLElement>(".timer", card).textContent = vm.timer;

  const repoLine = requireElement<HTMLElement>(".r2", card);
  repoLine.textContent = vm.repoLine;
  // `.r2` always carries `title` equal to its own text, same reasoning as `.name`.
  repoLine.title = vm.repoLine;

  renderContextRow(requireElement<HTMLElement>(".r3", card), session.context, "r3");

  // The two activity lines write independently — either may be hidden while the
  // other shows, and both are hidden when neither source has data yet.
  // Each line carries its full text as `title`,
  // same reasoning as `.name`/`.r2` above — comfortable now clamps this line to three
  // lines, so the hover title is the only way to read text beyond that. Cleared (not
  // left stale) when the line is hidden.
  const activityYou = requireElement<HTMLElement>(".activity.you", card);
  activityYou.hidden = vm.activity.you === null;
  activityYou.textContent = vm.activity.you ?? "";
  activityYou.title = vm.activity.you ?? "";

  const activityClaude = requireElement<HTMLElement>(".activity.claude", card);
  activityClaude.hidden = vm.activity.claude === null;
  activityClaude.textContent = vm.activity.claude ?? "";
  activityClaude.title = vm.activity.claude ?? "";

  const note = requireElement<HTMLElement>(".note", card);
  note.hidden = vm.noteText === null;
  note.textContent = vm.noteText ?? "";
  // Only "failure" gets the rose-border visual treatment (design-system §5: the
  // trust-prompt and no-signal notes are sanctioned to render as a plain amber note,
  // same as "attention"). The full
  // NoteKind (including "trust"/"no-signal") is still carried onto the DOM via
  // data-note-kind below so the distinction isn't discarded outright.
  note.className = vm.noteKind === "failure" ? "note fail" : "note";
  note.dataset.noteKind = vm.noteKind;
}

/** The card's `class` attribute — extracted from `updateSessionCardContent` to keep it
 * under Biome's complexity ceiling (five independent modifiers, one ternary each). */
function cardClassName(vm: CardViewModel, pinnedLast: boolean, isCurrent: boolean): string {
  return `card ${vm.stateClass}${vm.ended ? " ended" : ""}${vm.pinned ? " pinned" : ""}${pinnedLast ? " pinned-last" : ""}${isCurrent ? " current" : ""}${vm.unread ? " unread" : ""}`;
}

/** The card's `aria-label` and `data-unread` (kb:adr/rail-unread-marker-neutral-dot) —
 * extracted from `updateSessionCardContent` to keep it under Biome's complexity ceiling. */
function applyUnreadAttributes(card: HTMLElement, vm: CardViewModel): void {
  // Gives the card an accessible name — a bare <span> title
  // carries none on its own. An unread session's name carries a ", unread" suffix.
  card.setAttribute("aria-label", unreadLabel(vm.title, vm.unread));
  // `data-unread="true"` only while unread — removed entirely otherwise (never set to
  // "false"), matching the pattern `draggable` below uses for its own boolean.
  if (vm.unread) card.dataset["unread"] = "true";
  else delete card.dataset["unread"];
}

/** Refreshes an already-built card's mutable content in place from the shared
 * view-model — never touches the click/keydown listeners `buildSessionCardElement`
 * wires up once, and (via `reconcileActsRow`) never destroys an action button that
 * doesn't need to change. Called on every render tick for a card that already exists
 * (`reconcileCards`) as well as once, for the initial paint, by
 * `buildSessionCardElement` itself. */
function updateSessionCardContent(
  card: HTMLElement,
  session: Session,
  now: Date,
  options: CardRenderOptions,
): void {
  const vm = buildCardViewModel(session, now, options.railActivity);
  const isCurrent = session.id === options.currentId;

  card.className = cardClassName(vm, options.pinnedLast, isCurrent);
  applyUnreadAttributes(card, vm);
  // The reconciliation key `reconcileCards` uses to match existing DOM nodes against
  // incoming sessions.
  card.dataset["sessionId"] = String(session.id);
  // Explicit "false" (not just an absent attribute) so a locator can assert either state.
  card.setAttribute("draggable", options.draggable ? "true" : "false");
  // The marker means "the session the Focus pane is showing" (kb:adr/rail-current-marker-means-shown-in-focus);
  // a strip card's
  // `currentId` is always null (renderStrip below), so it never matches and the attribute
  // is removed, never set to "false".
  if (isCurrent) card.setAttribute("aria-current", "true");
  else card.removeAttribute("aria-current");

  applyCardText(card, vm, session);

  // End on a live card, Resume+Remove on an ended one — `vm.actions` already
  // carries the exact label set and order (sessions/card.ts). Resume additionally needs
  // a claudeSessionId to ever be enabled, same rule as the mainhead.
  const actsRow = requireElement<HTMLElement>(".acts-row", card);
  actsRow.hidden = false;
  reconcileActsRow(
    actsRow,
    vm.actions,
    session.id,
    session.claudeSessionId,
    options.connected,
    options.onAction,
  );

  // The pin button's aria-label/aria-pressed/title follow `pinned` on
  // every pass. `data-action`/`data-id` (not the `.acts-row` buttons' own convention,
  // since this button lives in `.r0` rather than an acts row) let it participate in the
  // existing `captureFocusedControl`/`restoreFocusedControl` contract unchanged
  // (render/focuskeep.ts: "an action button (data-action + data-id)") — its focus
  // survival needs no new code path, just this button carrying the same two attributes
  // `buildActionButton` already sets.
  const pinBtn = requireElement<HTMLButtonElement>(".pin", card);
  pinBtn.setAttribute("aria-label", vm.pinned ? "Unpin" : "Pin");
  pinBtn.setAttribute("aria-pressed", vm.pinned ? "true" : "false");
  pinBtn.title = vm.pinned ? "Unpin" : "Pin to top";
  pinBtn.dataset["action"] = "pin";
  pinBtn.dataset["id"] = String(session.id);
}

/** Builds one session card element (rail card in Focus, or — reusing this exact markup —
 * a strip card in Tiles). Every caller supplies `options.onClick` (clicking a rail card
 * moves focus; clicking a strip card promotes it). The callback also learns its source —
 * `"pointer"` for a mouse click, `"keyboard"`
 * for Enter/Space activation — so a caller that only wants to move keyboard focus into the
 * terminal on a deliberate pointer selection (features/rail.ts's rail callback) can tell
 * the two apart without a second callback or a DOM flag. Listeners are wired up exactly
 * once here — `reconcileCards` never rebuilds an existing card, it calls
 * `updateSessionCardContent` on the same node instead. */
function buildSessionCardElement(
  session: Session,
  now: Date,
  template: HTMLTemplateElement,
  options: CardRenderOptions,
): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>(".card");
  if (!card) throw new Error("session-card-template is missing its .card root");
  updateSessionCardContent(card, session, now, options);

  // Wired once, like the click/keydown listeners below — reconcileCards never
  // rebuilds an existing card, so this never double-attaches on a later render tick.
  const pinBtn = requireElement<HTMLButtonElement>(".pin", card);
  pinBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onAction("pin", session.id);
  });

  const onClick = options.onClick;
  card.tabIndex = 0;
  // The pointer path is the only one features/rail.ts's rail
  // callback uses to move keyboard focus into the terminal — the
  // keyboard-activation branch below reports itself as "keyboard" so that callback can
  // decline to do so and leave focus on the card.
  card.addEventListener("click", () => onClick(session.id, "pointer"));
  card.addEventListener("keydown", (event) => {
    // This listener is on `.card`, but the acts row nests real
    // `<button>`s inside it (.acts-row) whose own keydown (Enter/Space) bubbles up
    // here. Without this guard, `event.preventDefault()` below ran for every bubbled
    // keydown regardless of origin and cancelled the button's own Enter/Space
    // activation — verified live (focused card's End button, Enter key,
    // `endDialogOpen` stayed false and focus dropped to BODY). Only handle the key when
    // the card itself is the target, i.e. it wasn't a nested control that already owns
    // the key.
    if (event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(session.id, "keyboard");
    }
  });

  return card;
}

/** Clears stray non-element children (e.g. the honest-empty-state's lone text node, left
 * behind when the session list goes from empty to non-empty) and indexes the surviving
 * cards by the `data-session-id` reconciliation key. */
function indexCardsBySessionId(container: HTMLElement): Map<number, HTMLElement> {
  for (const node of Array.from(container.childNodes)) {
    if (!(node instanceof HTMLElement)) node.remove();
  }
  const byId = new Map<number, HTMLElement>();
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const id = Number(child.dataset["sessionId"]);
    if (Number.isFinite(id)) byId.set(id, child);
  }
  return byId;
}

/** The last pinned entry in display order, which decides which
 * card carries `pinned-last`. Depends on the whole ordered list, so it is computed up
 * front rather than folded into the render loop. */
function lastPinnedSessionId(sessions: readonly Session[]): number | undefined {
  let lastPinnedId: number | undefined;
  for (const session of sessions) {
    if (session.pinned) lastPinnedId = session.id;
  }
  return lastPinnedId;
}

/** Reconciles `container`'s card children against `sessions`, matching existing DOM
 * nodes by session id — the same pattern `features/tiles.ts`'s `reconcileTilesGrid` already uses
 * for tiles, for the identical reason: replacing the container's children wholesale on every 1s render tick
 * destroys and rebuilds every action button (and the card itself, if it's the focused
 * element) whether or not anything about that card changed, so a keyboard user's focus
 * silently falls to `<body>` within the next tick. An existing card is updated in place
 * and moved only if its position actually changed; only sessions with no existing card
 * build a new one, and only departed ids remove one. A steady rail with nothing changed
 * touches no DOM nodes beyond the per-field text/attr updates `updateSessionCardContent`
 * already does — no wholesale remove+reinsert, so no forced layout and no discarded
 * in-card text selection. */
export function reconcileCards(
  container: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  template: HTMLTemplateElement,
  options: CardListOptions,
): void {
  const existingById = indexCardsBySessionId(container);

  // A content update below (e.g. a genuine
  // live/ended transition rebuilding `.acts-row`) or the reorder itself can blur a
  // focused card or action button (see render/focuskeep.ts / render/keyedreorder.ts for
  // the measured mechanism) — captured up front, before either runs, preferring a
  // caller-supplied pre-blur snapshot (`options.pendingFocus`'s doc comment) when one was
  // handed in.
  const focused = options.pendingFocus ?? captureFocusedControl(container);

  // The last pinned entry in display order (`sessions` is
  // already `orderRail`ed by the caller — pinned block first, in both modes) gets
  // `pinned-last`; `undefined` when nothing is pinned. Computed up front (not folded
  // into the loop below) because it depends on the *whole* ordered list — the last
  // pinned session isn't known until every session has been walked — so each card's
  // `pinned-last` membership is decided before that same card's `className` is written,
  // in the one pass `updateSessionCardContent` already makes (no second DOM-touching
  // pass, and no dependency on `classList`, which the codebase never uses elsewhere here
  // — every other modifier on this element is folded into the same `className` string).
  const lastPinnedId = lastPinnedSessionId(sessions);

  const seen = new Set<number>();
  const entries: KeyedReorderEntry[] = [];
  for (const session of sessions) {
    seen.add(session.id);
    const cardOptions: CardRenderOptions = { ...options, pinnedLast: session.id === lastPinnedId };
    let card = existingById.get(session.id);
    if (card) {
      updateSessionCardContent(card, session, now, cardOptions);
    } else {
      card = buildSessionCardElement(session, now, template, cardOptions);
    }
    entries.push({ id: session.id, root: card });
  }

  for (const [id, card] of existingById) {
    if (!seen.has(id)) card.remove();
  }

  // The id-keyed insertBefore-reorder-plus-focus-restore algorithm, shared by the
  // rail/strip and (via features/tiles.ts) the Tiles grid.
  reconcileKeyedOrder(container, entries, focused);
}

/** Renders the honest empty state ("No sessions yet" — never a placeholder list) or one
 * card per session, in the order given (sorting is sessions/sort.ts's job, applied by
 * the caller). `options.onClick` is the rail's focus action. */
export function renderSessions(
  el: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  template: HTMLTemplateElement,
  options: CardListOptions,
): void {
  if (sessions.length === 0) {
    // `textContent` assignment already clears any existing children (real DOM), so no
    // separate `replaceChildren()` call is needed here.
    el.textContent = "No sessions yet";
    return;
  }
  reconcileCards(el, sessions, now, template, options);
}

/** The rail's compact/comfortable/expanded density segmented control — the same
 * `aria-pressed`-per-button shape `render/masthead.ts`'s `renderViewSwitcher`/
 * `renderDensityControl` render for the Focus/Tiles and 2×2/3×2 controls, kept here
 * instead since this one lives in the rail, not the masthead. */
export function renderRailDensityControl(
  buttons: readonly HTMLButtonElement[],
  density: RailDensity,
): void {
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset["density"] === density));
  }
}
