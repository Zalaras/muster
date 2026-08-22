// Rail cards (docs/protocol.md UI Specifications > Rail; design-system §5 card anatomy).
// DOM only — every displayed string comes from ../sessions/card.ts's pure view-model.
import type { Session } from "../protocol";
import { buildCardViewModel } from "../sessions/card";

function requireTemplate(id: string): HTMLTemplateElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLTemplateElement)) throw new Error(`missing template: #${id}`);
  return el;
}

function buildCardElement(session: Session, now: Date, template: HTMLTemplateElement): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>(".card");
  if (!card) throw new Error("session-card-template is missing its .card root");
  const vm = buildCardViewModel(session, now);

  card.className = `card ${vm.stateClass}${vm.ended ? " ended" : ""}`;
  // Gives the card an accessible name (review m1-sessions Minor 9) — a bare <span> title
  // carries none on its own. Harmless now (cards aren't interactive in M1) and mandatory
  // once M2 makes them focusable.
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

  return card;
}

/** Renders the honest empty state ("No sessions yet" — never a placeholder list) or one
 * card per session, in the order given (sorting is sessions/sort.ts's job, applied by
 * the caller). `now` defaults to the render-time clock so callers driving the 1s tick
 * don't need to thread it through every call site. */
export function renderSessions(el: HTMLElement, sessions: readonly Session[], now: Date = new Date()): void {
  if (sessions.length === 0) {
    el.textContent = "No sessions yet";
    return;
  }
  const template = requireTemplate("session-card-template");
  el.replaceChildren(...sessions.map((session) => buildCardElement(session, now, template)));
}
