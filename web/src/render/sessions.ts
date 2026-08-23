// Rail cards (docs/protocol.md UI Specifications > Rail; design-system §5 card anatomy).
// DOM only — every displayed string comes from ../sessions/card.ts's pure view-model.
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";

function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}

/** Builds one session card element (rail card in Focus, or — reusing this exact markup —
 * a strip card in Tiles per the plan's UI spec: "the M1 card content on its side").
 * `onClick` is optional so the honest-empty-state-only Vitest coverage in sessions.test.ts
 * keeps working unchanged; every real caller (rail, strip) supplies one (REQ-7's "clicking
 * a rail card moves focus" / REQ-8's "clicking a strip card promotes it"). */
export function buildSessionCardElement(
  session: Session,
  now: Date,
  template: HTMLTemplateElement,
  onClick?: (id: number) => void,
): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>(".card");
  if (!card) throw new Error("session-card-template is missing its .card root");
  const vm = buildCardViewModel(session, now);

  card.className = `card ${vm.stateClass}${vm.ended ? " ended" : ""}`;
  // Gives the card an accessible name (review m1-sessions Minor 9) — a bare <span> title
  // carries none on its own. Mandatory now that M2 makes cards focusable/clickable.
  card.setAttribute("aria-label", vm.title);

  const name = card.querySelector<HTMLElement>(".name");
  if (name) name.textContent = vm.title;

  const badge = card.querySelector<HTMLElement>(".badge");
  if (badge) badge.textContent = vm.badge;

  const timer = card.querySelector<HTMLElement>(".timer");
  if (timer) timer.textContent = vm.timer;

  const repoLine = card.querySelector<HTMLElement>(".r2");
  if (repoLine) repoLine.textContent = vm.repoLine;

  const contextRow = card.querySelector<HTMLElement>(".r3");
  if (contextRow) contextRow.textContent = vm.contextText;

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

  if (onClick) {
    // REQ-7/REQ-8: cards become interactive in M2 — keyboard-reachable too, not just a
    // mouse target.
    card.tabIndex = 0;
    card.addEventListener("click", () => onClick(session.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick(session.id);
      }
    });
  }

  return card;
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
): void {
  if (sessions.length === 0) {
    el.textContent = "No sessions yet";
    return;
  }
  const template = requireTemplate("session-card-template");
  el.replaceChildren(...sessions.map((session) => buildSessionCardElement(session, now, template, onClick)));
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
