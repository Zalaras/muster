import { postDiffTicks } from "../api/diff";
import type { ChangeRefs, FileRefs } from "../render/diffbody";
import { NOT_SAVED } from "../render/diffcomment";
import { setText } from "../dom";
import { fileTick, progress } from "./diffmodel";
import type { ViewerCtx, ViewerState } from "./diffviewerstate";

function isTicked(s: ViewerState, key: string): boolean {
  return s.ticks.has(key);
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function setOnly(parent: HTMLElement, node: HTMLElement, lead?: HTMLElement): void {
  const want = lead ? [lead, node] : [node];
  const have = Array.from(parent.children);
  if (have.length === want.length && have.every((child, i) => child === want[i])) return;
  parent.replaceChildren(...want);
}

function syncChange(s: ViewerState, ref: ChangeRefs): void {
  const key = ref.change.key;
  const folded = isTicked(s, key) && !s.reopened.has(key);
  const flipped = s.flips.has(key);
  setOnly(ref.el, folded ? ref.folded : ref.block);
  setOnly(ref.block, flipped ? ref.before : ref.after, ref.head);
  setText(ref.label, flipped ? "before" : "after");
  ref.tick.setAttribute("aria-pressed", String(isTicked(s, key)));
  ref.block.classList.toggle("current", s.current === key);
  ref.block.classList.toggle("flipped", flipped);
}

function syncTickBox(
  box: HTMLInputElement | null,
  count: HTMLElement | null,
  state: ReturnType<typeof fileTick>,
  total: number,
): void {
  if (!box) return;
  const checked = state.state === "all";
  const mixed = state.state === "some";
  if (box.checked !== checked) box.checked = checked;
  if (box.indeterminate !== mixed) box.indeterminate = mixed;
  if (!count) return;
  setHidden(count, !mixed);
  setText(count, mixed ? `${state.done}/${total}` : "");
}

function syncFile(s: ViewerState, file: FileRefs, index: number): void {
  for (const ref of file.changes) syncChange(s, ref);
  const state = fileTick(file.model, s.ticks);
  const total = file.model.changes.length;
  syncTickBox(file.tick, file.tickCount, state, total);
  const row = s.filesRows[index];
  if (row) syncTickBox(row.tick, row.tickCount, state, total);
}

function syncMap(s: ViewerState): void {
  for (const mark of s.map) {
    const file = s.body?.files[mark.fi];
    const ref = file?.changes[mark.ci];
    if (!file || !ref) continue;
    const key = ref.change.key;
    const state = isTicked(s, key) ? "reviewed" : s.flips.has(key) ? "flipped" : "unreviewed";
    if (mark.el.dataset["state"] !== state) mark.el.dataset["state"] = state;
    mark.el.classList.toggle("current", s.current === key);
    mark.el.classList.toggle("has-comment", ref.el.querySelector(".has-comment") !== null);
  }
}

function syncFold(s: ViewerState, file: FileRefs): void {
  const folded = s.fileFold.get(file.model.file.path) ?? false;
  const present = file.body.parentElement === file.section;
  if (folded && present) file.body.remove();
  if (!folded && !present) file.section.append(file.body);
  file.fold.setAttribute("aria-expanded", String(!folded));
}

export function syncReview(ctx: ViewerCtx): void {
  const { s, chrome } = ctx;
  const review = s.view === "review";
  setHidden(chrome.reviewTools, !review);
  setHidden(chrome.map, !review || s.map.length === 0);
  for (const file of s.body?.files ?? []) syncFold(s, file);
  if (!review || !s.body) return;
  for (const [i, file] of s.body.files.entries()) syncFile(s, file, i);
  const { done, total } = progress(s.models, s.ticks);
  setText(chrome.progress, `${done} / ${total} changes reviewed`);
  syncMap(s);
}

async function post(ctx: ViewerCtx): Promise<void> {
  const { s, chrome, id } = ctx;
  const add = [...s.pendingAdd];
  const remove = [...s.pendingRemove];
  if (add.length === 0 && remove.length === 0) return;
  const result = await postDiffTicks(id, add, remove);
  if (result.ok) {
    for (const key of add) s.pendingAdd.delete(key);
    for (const key of remove) s.pendingRemove.delete(key);
  }
  setHidden(chrome.tickFail, result.ok);
  setText(chrome.tickFail, result.ok ? "" : NOT_SAVED);
}

function flush(ctx: ViewerCtx): Promise<void> {
  ctx.s.flushing = ctx.s.flushing.then(() => post(ctx));
  return ctx.s.flushing;
}

export function applyTicks(
  ctx: ViewerCtx,
  add: readonly string[],
  remove: readonly string[],
): void {
  const { s } = ctx;
  s.tickWrites++;
  for (const key of add) {
    s.ticks.add(key);
    s.reopened.delete(key);
    s.pendingAdd.add(key);
    s.pendingRemove.delete(key);
  }
  for (const key of remove) {
    s.ticks.delete(key);
    s.reopened.delete(key);
    s.pendingRemove.add(key);
    s.pendingAdd.delete(key);
  }
  syncReview(ctx);
  void flush(ctx);
}

export function flushPending(ctx: ViewerCtx): Promise<void> {
  return flush(ctx);
}

export function toggleChangeTick(ctx: ViewerCtx, key: string): void {
  if (ctx.s.ticks.has(key)) applyTicks(ctx, [], [key]);
  else applyTicks(ctx, [key], []);
}

export function tickFile(ctx: ViewerCtx, fi: number, on: boolean): void {
  const file = ctx.s.body?.files[fi];
  if (!file) return;
  const keys = file.model.changes.map((c) => c.key);
  ctx.s.fileFold.set(file.model.file.path, on);
  if (on)
    applyTicks(
      ctx,
      keys.filter((k) => !ctx.s.ticks.has(k)),
      [],
    );
  else
    applyTicks(
      ctx,
      [],
      keys.filter((k) => ctx.s.ticks.has(k)),
    );
}

export function resetTicks(ctx: ViewerCtx): void {
  const keys = ctx.s.models.flatMap((m) => m.changes.map((c) => c.key));
  applyTicks(
    ctx,
    [],
    keys.filter((k) => ctx.s.ticks.has(k)),
  );
}

export function toggleFileFold(ctx: ViewerCtx, fi: number): void {
  const file = ctx.s.body?.files[fi];
  if (!file) return;
  const path = file.model.file.path;
  ctx.s.fileFold.set(path, !(ctx.s.fileFold.get(path) ?? false));
  syncReview(ctx);
}

export function flip(ctx: ViewerCtx, key: string): void {
  if (ctx.s.flips.has(key)) ctx.s.flips.delete(key);
  else ctx.s.flips.add(key);
  syncReview(ctx);
}

export function reopenChange(ctx: ViewerCtx, key: string): void {
  ctx.s.reopened.add(key);
  syncReview(ctx);
}

interface Location {
  fi: number;
  ci: number;
  key: string;
}

function allChanges(s: ViewerState): Location[] {
  const out: Location[] = [];
  for (const [fi, file] of (s.body?.files ?? []).entries()) {
    for (const [ci, ref] of file.changes.entries()) out.push({ fi, ci, key: ref.change.key });
  }
  return out;
}

export function showChange(ctx: ViewerCtx, fi: number, ci: number): void {
  const { s } = ctx;
  const file = s.body?.files[fi];
  const ref = file?.changes[ci];
  if (!file || !ref) return;
  s.fileFold.set(file.model.file.path, false);
  s.reopened.add(ref.change.key);
  s.current = ref.change.key;
  syncReview(ctx);
  ref.el.scrollIntoView({ block: "center" });
}

export function moveCurrent(ctx: ViewerCtx, delta: number): void {
  const all = allChanges(ctx.s);
  if (all.length === 0) return;
  const at = all.findIndex((c) => c.key === ctx.s.current);
  const next =
    at < 0 ? (delta > 0 ? 0 : all.length - 1) : Math.min(all.length - 1, Math.max(0, at + delta));
  const target = all[next] as Location;
  showChange(ctx, target.fi, target.ci);
}

function currentLocation(s: ViewerState): Location | undefined {
  return allChanges(s).find((c) => c.key === s.current);
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "TEXTAREA" ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.tagName === "BUTTON" || target.tagName === "SUMMARY")
  );
}

function shiftX(ctx: ViewerCtx): void {
  const at = currentLocation(ctx.s);
  if (!at) return;
  const file = ctx.s.body?.files[at.fi];
  if (!file) return;
  tickFile(ctx, at.fi, fileTick(file.model, ctx.s.ticks).state !== "all");
}

function plainKey(ctx: ViewerCtx, event: KeyboardEvent): boolean {
  const at = currentLocation(ctx.s);
  switch (event.key) {
    case "j":
      moveCurrent(ctx, 1);
      return true;
    case "k":
      moveCurrent(ctx, -1);
      return true;
    case " ":
      if (isControl(event.target) || !at) return false;
      flip(ctx, at.key);
      return true;
    case "x":
      if (!at) return false;
      toggleChangeTick(ctx, at.key);
      return true;
    default:
      return false;
  }
}

export function onReviewKey(ctx: ViewerCtx, event: KeyboardEvent): boolean {
  if (ctx.s.view !== "review" || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isTextField(event.target)) return false;
  if (event.key === "X" && event.shiftKey) {
    shiftX(ctx);
    return true;
  }
  return plainKey(ctx, event);
}
