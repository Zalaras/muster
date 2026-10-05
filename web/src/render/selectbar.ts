// The select-mode bar at the rail's foot (`#select-bar`, index.html): the count and the buttons'
// enablement. Static markup, one instance — features/groupsselect.ts wires the click listeners once and
// this module only ever writes text, `hidden` and `disabled`, never rebuilding a button, so a
// focused one keeps focus across the 1s tick.

export interface SelectBarElements {
  root: HTMLElement;
  count: HTMLElement;
  move: HTMLButtonElement;
  ungroup: HTMLButtonElement;
  stop: HTMLButtonElement;
  remove: HTMLButtonElement;
  all: HTMLButtonElement;
  done: HTMLButtonElement;
}

export interface SelectBarModel {
  visible: boolean;
  /** `3 selected`, or `Select sessions` at zero. */
  countText: string;
  /** Daemon down: every button disabled, as the action buttons are. Escape still leaves the mode. */
  connected: boolean;
  hasSelection: boolean;
  /** Something selected is in a group (Ungroup has work to do). */
  anyGrouped: boolean;
  /** Something selected is alive (Stop has work to do). */
  anyAlive: boolean;
}

export function renderSelectBar(els: SelectBarElements, model: SelectBarModel): void {
  els.root.hidden = !model.visible;
  if (els.count.textContent !== model.countText) els.count.textContent = model.countText;
  const acts = model.connected && model.hasSelection;
  els.move.disabled = !acts;
  els.ungroup.disabled = !(acts && model.anyGrouped);
  els.stop.disabled = !(acts && model.anyAlive);
  els.remove.disabled = !acts;
  els.all.disabled = !model.connected;
  els.done.disabled = !model.connected;
}
