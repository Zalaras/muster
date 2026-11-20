import { buildFileTick } from "./diffbody";
import { button, el } from "./diffrows";
import type { FileModel } from "./diffshape";

export interface FilesRowRefs {
  root: HTMLElement;
  jump: HTMLButtonElement;
  comments: HTMLElement;
  tick: HTMLInputElement | null;
  tickCount: HTMLElement | null;
}

export function buildFilesRow(model: FileModel, withTick: boolean): FilesRowRefs {
  const root = el("div", "dv-frow");
  const jump = button("", "dv-fjump");
  const comments = el("span", "dv-fcomments");
  comments.hidden = true;
  jump.append(el("span", "dv-fpath", model.path), el("span", "dv-counts", model.counts), comments);
  root.append(jump);
  let tick: HTMLInputElement | null = null;
  let tickCount: HTMLElement | null = null;
  if (withTick) {
    tick = buildFileTick(model.path);
    tickCount = el("span", "dv-tickcount");
    tickCount.hidden = true;
    root.append(tick, tickCount);
  }
  return { root, jump, comments, tick, tickCount };
}

export interface CommentEntry {
  path: string;
  lines: string;
  quote: string;
  more: string;
  body: string;
  mark: "outdated" | "partly outdated" | null;
}

export function buildCommentEntry(entry: CommentEntry): HTMLButtonElement {
  const node = button("", "dv-centry");
  node.append(el("div", "dv-cwhere", `${entry.path}:${entry.lines}`));
  if (entry.mark) node.append(el("div", "dv-cmark", entry.mark));
  const quote = el("div", "dv-cquote");
  quote.append(el("span", "dv-cq", entry.quote));
  if (entry.more) quote.append(el("span", "dv-cmore", entry.more));
  node.append(quote, el("div", "dv-cbody", entry.body));
  return node;
}

export function buildMapMark(number: number): HTMLButtonElement {
  const mark = button("", "dv-mark");
  mark.setAttribute("aria-label", `Go to change ${number}`);
  return mark;
}
