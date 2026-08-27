// Rail cards (docs/protocol.md UI Specifications > Rail; design-system §5 card anatomy).
// DOM only — every displayed string comes from ../sessions/card.ts's pure view-model.
import type { Session } from "../protocol";
import { buildCardViewModel, type CardAction } from "../sessions/card";
import { renderContextRow } from "./context";

/** REQ-11's card/strip/tile action-row buttons all dispatch through this one shape —
 * `main.ts`'s dispatcher owns what each action actually does (open a confirm dialog, or
 * call Resume directly per User Flow 3). */
export type SessionAction = "end" | "resume" | "remove";

const ACTION_BY_LABEL: Record<CardAction, SessionAction> = {
  End: "end",
  Resume: "resume",
  Remove: "remove",
};

function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}

/** One action button (card/strip/tile-footer), shared across every surface that renders
 * one of REQ-11/REQ-12's End/Resume/Remove rows. `event.stopPropagation()` is REQ-11's
 * explicit requirement ("Clicks on the buttons do not change focus") — attached directly
 * on the button rather than via a delegated container listener, so it always runs before
 * the card's own click-to-focus listener regardless of DOM nesting. `enabled` folds in
 * both the connection-down gate (States: "action buttons are disabled while the WS is
 * down") and any per-action rule (e.g. Resume needs a claudeSessionId) the caller already
 * computed. */
export function buildActionButton(
  label: CardAction,
  id: number,
  enabled: boolean,
  onAction?: (action: SessionAction, id: number) => void,
): HTMLButtonElement {
  const action = ACTION_BY_LABEL[label];
  const btn = document.createElement("button");
  btn.type = "button";
  // Mockup fidelity (opt-c-both.html/tiles-dead.html): every Remove button carries the
  // same `.danger` (hover-danger, design-system §1/§3's --danger family, cycle-3
  // Major 2) treatment, End/Resume stay plain.
  btn.className = label === "Remove" ? "btn sm danger" : "btn sm";
  btn.textContent = label;
  btn.dataset["action"] = action;
  btn.dataset["id"] = String(id);
  btn.disabled = !enabled;
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!btn.disabled) onAction?.(action, id);
  });
  return btn;
}

/** Reconciles one card's `.acts-row` in place: when the label sequence is unchanged
 * (the common case — a live card stays End-only, an ended card stays Resume+Remove, on
 * every 1s tick) only each existing button's `disabled` state is refreshed, so the exact
 * button node a keyboard user has focused survives the tick (review m4-reconcile cycle-2
 * Major 1 — previously this row was unconditionally `replaceChildren`'d every render,
 * destroying and rebuilding every action button once a second and dropping focus to
 * `<body>` with no automatic re-focus). The label sequence only changes on a genuine
 * live/ended transition, which legitimately does need a rebuilt row (Resume/Remove
 * didn't exist a moment ago). */
function reconcileActsRow(
  actsRow: HTMLElement,
  actions: readonly CardAction[],
  id: number,
  claudeSessionId: string | null,
  connected: boolean,
  onAction?: (action: SessionAction, id: number) => void,
): void {
  const existing = Array.from(actsRow.children).filter(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
  );
  const sameShape =
    existing.length === actions.length && existing.every((btn, i) => btn.textContent === actions[i]);

  if (sameShape) {
    existing.forEach((btn, i) => {
      const label = actions[i];
      if (label === undefined) return;
      btn.disabled = !(connected && (label !== "Resume" || claudeSessionId !== null));
    });
    return;
  }

  actsRow.replaceChildren(
    ...actions.map((label) => {
      const enabled = connected && (label !== "Resume" || claudeSessionId !== null);
      return buildActionButton(label, id, enabled, onAction);
    }),
  );
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
  connected: boolean,
  onAction?: (action: SessionAction, id: number) => void,
): void {
  const vm = buildCardViewModel(session, now);

  card.className = `card ${vm.stateClass}${vm.ended ? " ended" : ""}`;
  // Gives the card an accessible name (review m1-sessions Minor 9) — a bare <span> title
  // carries none on its own. Mandatory now that M2 makes cards focusable/clickable.
  card.setAttribute("aria-label", vm.title);
  // The reconciliation key `reconcileCards` uses to match existing DOM nodes against
  // incoming sessions (review m4-reconcile cycle-2 Major 1).
  card.dataset["sessionId"] = String(session.id);

  const name = card.querySelector<HTMLElement>(".name");
  if (name) name.textContent = vm.title;

  const badge = card.querySelector<HTMLElement>(".badge");
  if (badge) badge.textContent = vm.badge;

  const timer = card.querySelector<HTMLElement>(".timer");
  if (timer) timer.textContent = vm.timer;

  const repoLine = card.querySelector<HTMLElement>(".r2");
  if (repoLine) repoLine.textContent = vm.repoLine;

  const contextRow = card.querySelector<HTMLElement>(".r3");
  if (contextRow) renderContextRow(contextRow, session.context, "r3");

  const activity = card.querySelector<HTMLElement>(".activity");
  if (activity) {
    activity.hidden = vm.activity === null;
    activity.textContent = vm.activity ?? "";
  }

  const note = card.querySelector<HTMLElement>(".note");
  if (note) {
    note.hidden = vm.noteText === null;
    note.textContent = vm.noteText ?? "";
    // Only "failure" gets the rose-border visual treatment (design-system §5: the
    // trust-prompt and no-signal notes are sanctioned to render as a plain amber note,
    // same as "attention" — see review m1-sessions cycle-2 note on this). The full
    // NoteKind (including "trust"/"no-signal") is still carried onto the DOM via
    // data-note-kind below so the distinction isn't discarded outright (review Minor 3).
    note.className = vm.noteKind === "failure" ? "note fail" : "note";
    note.dataset.noteKind = vm.noteKind;
  }

  // REQ-11: End on a live card, Resume+Remove on an ended one — `vm.actions` already
  // carries the exact label set and order (sessions/card.ts). Resume additionally needs
  // a claudeSessionId to ever be enabled, same rule as the mainhead (REQ-10).
  const actsRow = card.querySelector<HTMLElement>(".acts-row");
  if (actsRow) {
    actsRow.hidden = false;
    reconcileActsRow(actsRow, vm.actions, session.id, session.claudeSessionId, connected, onAction);
  }
}

/** Builds one session card element (rail card in Focus, or — reusing this exact markup —
 * a strip card in Tiles per the plan's UI spec: "the M1 card content on its side").
 * `onClick` is optional so the honest-empty-state-only Vitest coverage in sessions.test.ts
 * keeps working unchanged; every real caller (rail, strip) supplies one (REQ-7's "clicking
 * a rail card moves focus" / REQ-8's "clicking a strip card promotes it"). Listeners are
 * wired up exactly once here — `reconcileCards` never rebuilds an existing card, it calls
 * `updateSessionCardElement` on the same node instead (review m4-reconcile cycle-2
 * Major 1). */
export function buildSessionCardElement(
  session: Session,
  now: Date,
  template: HTMLTemplateElement,
  onClick?: (id: number) => void,
  onAction?: (action: SessionAction, id: number) => void,
  connected = true,
): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>(".card");
  if (!card) throw new Error("session-card-template is missing its .card root");
  updateSessionCardContent(card, session, now, connected, onAction);

  if (onClick) {
    // REQ-7/REQ-8: cards become interactive in M2 — keyboard-reachable too, not just a
    // mouse target.
    card.tabIndex = 0;
    card.addEventListener("click", () => onClick(session.id));
    card.addEventListener("keydown", (event) => {
      // review m4-reconcile Major 5: this listener is on `.card`, but REQ-11 nests real
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
        onClick(session.id);
      }
    });
  }

  return card;
}

/** Refreshes an already-built card in place for the current render pass — the update
 * half of the `buildSessionCardElement`/`updateSessionCardElement` pair
 * `reconcileCards` uses, mirroring `render/tiles.ts`'s existing `buildTile`/`updateTile`
 * convention (review m2-terminal Critical 2's in-place-mutation pattern, now applied
 * here too). Exported for the same shared-module reason `buildSessionCardElement` is:
 * `render/tiles.ts`'s `renderStrip` reconciles the identical card markup. */
export function updateSessionCardElement(
  card: HTMLElement,
  session: Session,
  now: Date,
  connected: boolean,
  onAction?: (action: SessionAction, id: number) => void,
): void {
  updateSessionCardContent(card, session, now, connected, onAction);
}

/** Reconciles `container`'s card children against `sessions`, matching existing DOM
 * nodes by session id — the same pattern `main.ts`'s `reconcileTilesGrid` already uses
 * for tiles, for the identical reason (review m2-terminal Critical 2 / m4-reconcile
 * cycle-2 Major 1): replacing the container's children wholesale on every 1s render tick
 * destroys and rebuilds every action button (and the card itself, if it's the focused
 * element) whether or not anything about that card changed, so a keyboard user's focus
 * silently falls to `<body>` within the next tick. An existing card is updated in place
 * and moved only if its position actually changed; only sessions with no existing card
 * build a new one, and only departed ids remove one. Also the Minor-3 fix: a steady rail
 * with nothing changed now touches no DOM nodes beyond the per-field text/attr updates
 * `updateSessionCardElement` already does — no wholesale remove+reinsert, so no forced
 * layout and no discarded in-card text selection. */
export function reconcileCards(
  container: HTMLElement,
  sessions: readonly Session[],
  now: Date,
  template: HTMLTemplateElement,
  onClick: ((id: number) => void) | undefined,
  onAction: ((action: SessionAction, id: number) => void) | undefined,
  connected: boolean,
): void {
  // Drop any stray non-element children (e.g. the honest-empty-state's lone text node,
  // left behind when the session list goes from empty to non-empty) before reconciling —
  // `container.children` below only enumerates elements, so a leftover text node would
  // otherwise survive untouched alongside the reconciled cards.
  for (const node of Array.from(container.childNodes)) {
    if (!(node instanceof HTMLElement)) node.remove();
  }

  const existingById = new Map<number, HTMLElement>();
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const id = Number(child.dataset["sessionId"]);
    if (Number.isFinite(id)) existingById.set(id, child);
  }

  // review m4-reconcile cycle-3 Minor 1: `insertBefore` on an already-mounted node still
  // detaches it first per the DOM spec, and Chrome blurs a focused descendant on detach
  // even though the reattach is synchronous — measured live: `SORT-CHANGE focus:
  // before=true after=false active=BODY` when a priority change (not just a clock tick)
  // moved the focused card. Record *which* logical control was focused — the card itself
  // (by session id) or one of its action buttons (by data-action + session id) — before
  // the reorder loop runs, so it can be re-focused afterwards if the move blurred it.
  const active = document.activeElement;
  let focusedSessionId: number | undefined;
  let focusedAction: string | undefined;
  if (active instanceof HTMLElement && container.contains(active)) {
    if (active.dataset["action"] !== undefined && active.dataset["id"] !== undefined) {
      focusedAction = active.dataset["action"];
      focusedSessionId = Number(active.dataset["id"]);
    } else if (active.dataset["sessionId"] !== undefined) {
      focusedSessionId = Number(active.dataset["sessionId"]);
    }
  }

  const seen = new Set<number>();
  let previous: HTMLElement | null = null;
  for (const session of sessions) {
    seen.add(session.id);
    let card = existingById.get(session.id);
    if (card) {
      updateSessionCardElement(card, session, now, connected, onAction);
    } else {
      card = buildSessionCardElement(session, now, template, onClick, onAction, connected);
    }

    // Moving an already-mounted node via insertBefore repositions it in place rather
    // than detaching and reattaching a fresh subtree — but the detach step still runs
    // (see comment above), which is enough for Chrome to blur a focused descendant.
    // Skipped entirely when the card is already in the right slot, so a steady rail
    // touches no DOM at all here.
    const desiredNext: Element | null = previous ? previous.nextElementSibling : container.firstElementChild;
    if (desiredNext !== card) container.insertBefore(card, desiredNext);
    previous = card;
  }

  for (const [id, card] of existingById) {
    if (!seen.has(id)) card.remove();
  }

  // Re-focus the same logical control if the reorder blurred it — `document.activeElement`
  // falls back to `<body>` on blur, so any mismatch here means focus was lost, not
  // deliberately moved elsewhere by the caller mid-reconcile.
  if (focusedSessionId !== undefined && document.activeElement !== active) {
    const card = existingById.get(focusedSessionId) ?? container.querySelector<HTMLElement>(
      `[data-session-id="${focusedSessionId}"]`,
    );
    if (card) {
      const target = focusedAction
        ? card.querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)
        : card;
      target?.focus();
    }
  }
}

/** Renders the honest empty state ("No sessions yet" — never a placeholder list) or one
 * card per session, in the order given (sorting is sessions/sort.ts's job, applied by
 * the caller). `now` defaults to the render-time clock so callers driving the 1s tick
 * don't need to thread it through every call site. `onClick` is the rail's focus action
 * (REQ-7) — omitted only by sessions.test.ts's empty-state check. */
export function renderSessions(
  el: HTMLElement,
  sessions: readonly Session[],
  now: Date = new Date(),
  onClick?: (id: number) => void,
  onAction?: (action: SessionAction, id: number) => void,
  connected = true,
): void {
  if (sessions.length === 0) {
    // `textContent` assignment already clears any existing children (real DOM), so no
    // separate `replaceChildren()` call is needed here.
    el.textContent = "No sessions yet";
    return;
  }
  const template = requireTemplate("session-card-template");
  reconcileCards(el, sessions, now, template, onClick, onAction, connected);
}

export interface FocusMainElements {
  emptyEl: HTMLElement;
  slotEl: HTMLElement;
}

/** Toggles Focus's main area between the honest empty state and the terminal slot — the
 * slot's contents (a TerminalSurface's root) are main.ts's surface manager's job, not
 * this module's (docs/conventions.md: DOM here, sockets/pane lifecycle in main.ts). */
export function renderFocusMain(elements: FocusMainElements, hasSessions: boolean): void {
  elements.emptyEl.hidden = hasSessions;
  elements.slotEl.hidden = !hasSessions;
}

/** REQ-15's sizenote line: `<cols>×<rows> · one live client · geometry owned by this
 * pane`. `null` geometry (no focused session, or one not yet laid out) hides the line
 * entirely rather than rendering a half-formed one. */
export function renderSizenote(el: HTMLElement, geometry: { cols: number; rows: number } | null): void {
  if (!geometry) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `${geometry.cols}×${geometry.rows} · one live client · geometry owned by this pane`;
}
