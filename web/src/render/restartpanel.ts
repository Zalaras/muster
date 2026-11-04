import { setText } from "../dom";

export interface RestartRow {
  id: number;
  title: string;
  reason: string;
}

export interface RestartPanelModel {
  head: string;
  behind: { intro: string; now: number; whenFree: number } | null;
  queued: { heading: string; rows: RestartRow[] } | null;
}

export interface RestartPanelElements {
  panel: HTMLElement;
  head: HTMLElement;
  behind: HTMLElement;
  intro: HTMLElement;
  counts: HTMLElement;
  countNow: HTMLElement;
  countNowValue: HTMLElement;
  countWhenFree: HTMLElement;
  countWhenFreeValue: HTMLElement;
  queued: HTMLElement;
  queuedHeading: HTMLElement;
  queuedList: HTMLElement;
}

export function buildRestartRow(row: RestartRow): HTMLElement {
  const item = document.createElement("li");
  const title = document.createElement("span");
  title.className = "n";
  title.textContent = row.title;
  const reason = document.createElement("span");
  reason.className = "why";
  reason.textContent = row.reason;
  item.append(title, reason);
  return item;
}

function renderCounts(els: RestartPanelElements, now: number, whenFree: number): void {
  setText(els.countNowValue, String(now));
  setText(els.countWhenFreeValue, String(whenFree));
  const wanted = [now > 0 ? els.countNow : null, whenFree > 0 ? els.countWhenFree : null].filter(
    (row) => row !== null,
  );
  const held = Array.from(els.counts.children);
  if (wanted.length === held.length && wanted.every((row, i) => row === held[i])) return;
  els.counts.replaceChildren(...wanted);
}

function renderQueuedRows(list: HTMLElement, rows: readonly RestartRow[]): void {
  const signature = JSON.stringify(rows.map((row) => [row.id, row.title, row.reason]));
  if (list.dataset["signature"] === signature) return;
  list.dataset["signature"] = signature;
  list.replaceChildren(...rows.map(buildRestartRow));
}

export function renderRestartPanel(els: RestartPanelElements, model: RestartPanelModel): void {
  const focusWasInBehind = els.behind.contains(document.activeElement);
  setText(els.head, model.head);
  els.behind.hidden = model.behind === null;
  if (model.behind !== null) {
    setText(els.intro, model.behind.intro);
    renderCounts(els, model.behind.now, model.behind.whenFree);
  }
  els.queued.hidden = model.queued === null;
  if (model.queued !== null) {
    setText(els.queuedHeading, model.queued.heading);
    renderQueuedRows(els.queuedList, model.queued.rows);
  }
  if (focusWasInBehind && els.behind.hidden) els.panel.focus();
}
