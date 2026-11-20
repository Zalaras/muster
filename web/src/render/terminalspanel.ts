import { setText } from "../dom";
import { type KeyedReorderEntry, reconcileKeyedOrder } from "./keyedreorder";
import type { TerminalInfo } from "../protocol/terminals";

export const TERMINAL_NAME_MAX = 40;

export interface TerminalsPanelModel {
  terminals: readonly TerminalInfo[];
  shown: number | null;
}

export interface TerminalsPanelHandlers {
  onSwitch: (n: number) => void;
  onRename: (n: number, name: string) => void;
  onClose: (n: number) => void;
  onNew: () => void;
}

export interface TerminalsPanel {
  root: HTMLElement;
  update: (model: TerminalsPanelModel) => void;
  initialFocus: () => HTMLElement | null;
}

interface Row {
  root: HTMLElement;
  nameBtn: HTMLButtonElement;
  stateEl: HTMLElement;
  spinner: HTMLElement;
  stateWord: HTMLElement;
  renameBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  field: HTMLInputElement | null;
}

function iconButton(className: string, glyph: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = glyph;
  btn.append(icon);
  return btn;
}

function setLabel(el: HTMLElement, label: string): void {
  if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
}

function buildRow(n: number): Row {
  const root = document.createElement("li");
  root.className = "trow";
  root.dataset["n"] = String(n);
  const nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "tname";
  const stateEl = document.createElement("span");
  stateEl.className = "tstate";
  const spinner = document.createElement("span");
  spinner.className = "shellact";
  spinner.dataset["act"] = "busy";
  spinner.setAttribute("aria-hidden", "true");
  const stateWord = document.createElement("span");
  stateEl.append(stateWord);
  const renameBtn = iconButton("trename", "✎");
  const closeBtn = iconButton("tclose", "×");
  root.append(nameBtn, stateEl, renameBtn, closeBtn);
  return { root, nameBtn, stateEl, spinner, stateWord, renameBtn, closeBtn, field: null };
}

function updateRow(row: Row, terminal: TerminalInfo, shown: boolean): void {
  setText(row.nameBtn, terminal.name);
  if (shown) row.nameBtn.setAttribute("aria-current", "true");
  else row.nameBtn.removeAttribute("aria-current");
  row.root.classList.toggle("on", shown);
  setText(row.stateWord, terminal.busy ? "running" : "idle");
  const hasSpinner = row.stateEl.contains(row.spinner);
  if (terminal.busy && !hasSpinner) row.stateEl.prepend(row.spinner);
  if (!terminal.busy && hasSpinner) row.spinner.remove();
  setLabel(row.renameBtn, `Rename ${terminal.name}`);
  setLabel(row.closeBtn, `Close ${terminal.name}`);
}

export function buildTerminalsPanel(handlers: TerminalsPanelHandlers): TerminalsPanel {
  const root = document.createElement("div");
  root.className = "menu tpanel";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Terminals");

  const header = document.createElement("div");
  header.className = "hdr";
  header.setAttribute("role", "presentation");
  header.textContent = "Terminals";

  const list = document.createElement("ul");
  list.className = "tlist";

  const sep = document.createElement("div");
  sep.className = "sep";
  sep.setAttribute("role", "separator");

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "mi tnew";
  const plus = document.createElement("span");
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+ ";
  newBtn.append(plus, document.createTextNode("New terminal"));
  newBtn.addEventListener("click", handlers.onNew);

  root.append(header, list, sep, newBtn);

  const rows = new Map<number, Row>();

  function endRename(row: Row, restoreFocus: boolean): void {
    const field = row.field;
    if (field === null) return;
    row.field = null;
    field.replaceWith(row.nameBtn);
    if (restoreFocus) row.renameBtn.focus();
  }

  function startRename(n: number, row: Row): void {
    if (row.field !== null) return;
    const field = document.createElement("input");
    field.type = "text";
    field.className = "tfield";
    field.maxLength = TERMINAL_NAME_MAX;
    field.setAttribute("aria-label", "Terminal name");
    field.value = row.nameBtn.textContent ?? "";
    row.field = field;
    row.nameBtn.replaceWith(field);
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const value = field.value;
        endRename(row, true);
        handlers.onRename(n, value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        endRename(row, true);
      }
    });
    field.addEventListener("blur", () => endRename(row, false));
    field.focus();
    field.select();
  }

  function rowFor(n: number): Row {
    const existing = rows.get(n);
    if (existing) return existing;
    const row = buildRow(n);
    row.nameBtn.addEventListener("click", () => handlers.onSwitch(n));
    row.renameBtn.addEventListener("click", () => startRename(n, row));
    row.closeBtn.addEventListener("click", () => handlers.onClose(n));
    rows.set(n, row);
    return row;
  }

  function position(entries: readonly KeyedReorderEntry[]): void {
    const active = document.activeElement;
    reconcileKeyedOrder(list, entries, null);
    if (
      active instanceof HTMLElement &&
      list.contains(active) &&
      document.activeElement !== active
    ) {
      active.focus();
    }
  }

  function update(model: TerminalsPanelModel): void {
    const present = new Set(model.terminals.map((t) => t.n));
    for (const [n, row] of rows) {
      if (present.has(n)) continue;
      row.root.remove();
      rows.delete(n);
    }
    const ordered: KeyedReorderEntry[] = [];
    for (const terminal of model.terminals) {
      const row = rowFor(terminal.n);
      updateRow(row, terminal, terminal.n === model.shown);
      ordered.push({ id: terminal.n, root: row.root });
    }
    position(ordered);
  }

  return {
    root,
    update,
    initialFocus: () => root.querySelector<HTMLElement>("button.tname[aria-current]") ?? newBtn,
  };
}
