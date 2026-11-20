import type { Entry, Seg } from "./diffshape";

export function button(text: string, className = "dv-btn"): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  return node;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function codeWith(text: string, segs: Seg[] | null, kind: Entry["kind"]): HTMLElement {
  const code = el("span", "dv-code");
  if (!segs) {
    code.textContent = text === "" ? " " : text;
    return code;
  }
  const tag = kind === "del" ? "del" : "ins";
  for (const seg of segs) {
    if (!seg.changed) {
      code.append(document.createTextNode(seg.text));
      continue;
    }
    const mark = document.createElement(tag);
    mark.textContent = seg.text;
    code.append(mark);
  }
  return code;
}

function numberCell(value: number | null): HTMLElement {
  const cell = el("span", "dv-num", value === null ? "" : String(value));
  return cell;
}

function plusButton(entry: Entry): HTMLButtonElement {
  const plus = button("+", "dv-plus");
  plus.setAttribute("aria-label", `Comment on line ${entry.line}`);
  return plus;
}

function sign(text: string): HTMLElement {
  const mark = el("span", "dv-sign", text);
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

export function buildUnifiedRow(entry: Entry): HTMLElement {
  const row = el("div", `dv-row ${entry.kind}`);
  row.dataset["idx"] = String(entry.idx);
  const oldNum = numberCell(entry.old);
  oldNum.dataset["idx"] = String(entry.idx);
  const newNum = numberCell(entry.new);
  newNum.dataset["idx"] = String(entry.idx);
  row.append(
    oldNum,
    newNum,
    plusButton(entry),
    sign(entry.sign),
    codeWith(entry.text, entry.segs, entry.kind),
  );
  return row;
}

function splitCell(entry: Entry | null, side: "old" | "new"): HTMLElement {
  const cell = el("div", `dv-cell ${side}`);
  if (!entry) {
    cell.classList.add("empty");
    return cell;
  }
  cell.classList.add(entry.kind);
  cell.dataset["idx"] = String(entry.idx);
  const num = numberCell(side === "old" ? entry.old : entry.new);
  num.dataset["idx"] = String(entry.idx);
  cell.append(
    num,
    plusButton(entry),
    sign(entry.sign),
    codeWith(entry.text, entry.segs, entry.kind),
  );
  return cell;
}

export interface SplitRow {
  row: HTMLElement;
  cells: Array<{ idx: number; cell: HTMLElement }>;
}

export function buildSplitRow(oldEntry: Entry | null, newEntry: Entry | null): SplitRow {
  const row = el("div", "dv-srow");
  const left = splitCell(oldEntry, "old");
  const right = splitCell(newEntry, "new");
  row.append(left, right);
  const cells: SplitRow["cells"] = [];
  if (oldEntry) cells.push({ idx: oldEntry.idx, cell: left });
  if (newEntry) cells.push({ idx: newEntry.idx, cell: right });
  return { row, cells };
}

export function buildHunkRow(header: string): HTMLElement {
  return el("div", "dv-hunk", header);
}

export function buildPlaceholder(text: string): HTMLElement {
  return el("div", "dv-placeholder", text);
}
