import { requireElement } from "../dom";
import { findInTexts, type StepDirection } from "../reader/find";

const MATCH_HIGHLIGHT = "find-match";
const CURRENT_HIGHLIGHT = "find-current";
const CURRENT_PRIORITY = 1;
const SCROLL_MARGIN_PX = 32;
const BAR_CLEARANCE_PX = 8;
const NON_TEXT_PARENTS = new Set(["style", "script", "title", "desc", "noscript"]);

export interface FindView {
  available: boolean;
  open: boolean;
  count: string;
}

export interface FindRefs {
  open: HTMLButtonElement;
  bar: HTMLElement;
  query: HTMLInputElement;
  count: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  close: HTMLButtonElement;
}

export interface FindCallbacks {
  onFindOpen(): void;
  onFindInput(value: string): void;
  onFindStep(direction: StepDirection): void;
  onFindClose(): void;
}

export function buildFindRefs(root: HTMLElement): FindRefs {
  return {
    open: requireElement<HTMLButtonElement>('[data-role="find-open"]', root),
    bar: requireElement('[data-role="find-bar"]', root),
    query: requireElement<HTMLInputElement>('[data-role="find-query"]', root),
    count: requireElement('[data-role="find-count"]', root),
    previous: requireElement<HTMLButtonElement>('[data-role="find-previous"]', root),
    next: requireElement<HTMLButtonElement>('[data-role="find-next"]', root),
    close: requireElement<HTMLButtonElement>('[data-role="find-close"]', root),
  };
}

export function wireFind(find: FindRefs, callbacks: FindCallbacks): void {
  find.open.addEventListener("click", callbacks.onFindOpen);
  find.query.addEventListener("input", () => callbacks.onFindInput(find.query.value));
  find.previous.addEventListener("click", () => callbacks.onFindStep(-1));
  find.next.addEventListener("click", () => callbacks.onFindStep(1));
  find.close.addEventListener("click", callbacks.onFindClose);
}

function topPadding(body: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(body).paddingTop) || 0;
}

export function renderFindBar(refs: FindRefs, view: FindView, body: HTMLElement): void {
  refs.open.hidden = !view.available || view.open;
  const barHidden = !view.available || !view.open;
  if (refs.bar.hidden !== barHidden) {
    const top = body.scrollTop;
    const before = top > 0 ? topPadding(body) : 0;
    refs.bar.hidden = barHidden;
    if (top > 0) body.scrollTop = top + topPadding(body) - before;
  }
  if (refs.count.textContent !== view.count) refs.count.textContent = view.count;
}

export interface FindPaint {
  readonly ranges: readonly Range[];
  readonly current: Range | null;
}

export const NO_PAINT: FindPaint = { ranges: [], current: null };

function bodyTextNodes(body: HTMLElement): Text[] {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && NON_TEXT_PARENTS.has(parent.localName)) continue;
    if (node instanceof Text) nodes.push(node);
  }
  return nodes;
}

export function findRanges(body: HTMLElement, query: string): Range[] {
  const nodes = bodyTextNodes(body);
  const matches = findInTexts(
    nodes.map((node) => node.data),
    query,
  );
  return matches.flatMap((match) => {
    const node = nodes[match.node];
    if (!node) return [];
    const range = document.createRange();
    range.setStart(node, match.start);
    range.setEnd(node, match.end);
    return [range];
  });
}

function registered(name: string, priority: number): Highlight | null {
  if (typeof CSS === "undefined" || !CSS.highlights) return null;
  let highlight = CSS.highlights.get(name);
  if (!highlight) {
    highlight = new Highlight();
    highlight.priority = priority;
    CSS.highlights.set(name, highlight);
  }
  return highlight;
}

export function paintFind(previous: FindPaint, next: FindPaint): FindPaint {
  const all = registered(MATCH_HIGHLIGHT, 0);
  const current = registered(CURRENT_HIGHLIGHT, CURRENT_PRIORITY);
  for (const range of previous.ranges) all?.delete(range);
  if (previous.current) current?.delete(previous.current);
  for (const range of next.ranges) all?.add(range);
  if (next.current) current?.add(next.current);
  return next;
}

function scrollsHorizontally(element: Element): boolean {
  if (element.scrollWidth <= element.clientWidth) return false;
  const { overflowX } = getComputedStyle(element);
  return overflowX === "auto" || overflowX === "scroll";
}

function revealHorizontally(container: Element, range: Range): void {
  const rect = range.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  const left = box.left + container.clientLeft;
  const right = left + container.clientWidth;
  if (rect.left >= left + SCROLL_MARGIN_PX && rect.right <= right - SCROLL_MARGIN_PX) return;
  container.scrollLeft += rect.left - left - (container.clientWidth - rect.width) / 2;
}

function revealVertically(body: HTMLElement, range: Range, bar: HTMLElement): void {
  const rect = range.getBoundingClientRect();
  const box = body.getBoundingClientRect();
  const top = Math.max(
    SCROLL_MARGIN_PX,
    bar.getBoundingClientRect().bottom - box.top + BAR_CLEARANCE_PX,
  );
  if (rect.top >= box.top + top && rect.bottom <= box.bottom - SCROLL_MARGIN_PX) return;
  const wanted = Math.max(top, (box.height - rect.height) / 2);
  body.scrollTop += rect.top - box.top - wanted;
}

export function scrollRangeIntoView(body: HTMLElement, range: Range, bar: HTMLElement): void {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  for (let el = range.commonAncestorContainer.parentElement; el; el = el.parentElement) {
    if (scrollsHorizontally(el)) revealHorizontally(el, range);
    if (el === body) break;
  }
  revealVertically(body, range, bar);
}
