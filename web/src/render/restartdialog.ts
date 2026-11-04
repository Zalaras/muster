import { buildRestartRow, type RestartRow } from "./restartpanel";

export interface RestartDialogModel {
  title: string;
  intro: string;
  now: readonly RestartRow[];
  whenFree: readonly RestartRow[];
  confirmLabel: string;
}

export interface RestartDialogElements {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  intro: HTMLElement;
  list: HTMLElement;
  note: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
}

function buildSection(label: string, rows: readonly RestartRow[]): HTMLElement {
  const section = document.createElement("details");
  section.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `${label} · ${rows.length}`;
  const list = document.createElement("ul");
  list.className = "rlist";
  list.append(...rows.map(buildRestartRow));
  section.append(summary, list);
  return section;
}

export function renderRestartDialog(els: RestartDialogElements, model: RestartDialogModel): void {
  els.title.textContent = model.title;
  els.intro.textContent = model.intro;
  const sections: HTMLElement[] = [];
  if (model.now.length > 0) sections.push(buildSection("Restart now", model.now));
  if (model.whenFree.length > 0) sections.push(buildSection("Restart when free", model.whenFree));
  els.list.replaceChildren(...sections);
  els.note.hidden = model.whenFree.length === 0;
  els.confirmBtn.textContent = model.confirmLabel;
}
