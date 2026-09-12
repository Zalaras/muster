// Plan v1-cleanup REQ-12: the shared show/clear/auto-hide logic for the one
// `role="status"` notice each terminal-style surface owns — extracted from what the
// plain-terminal-session review recorded as the same fifteen lines twice
// (`terminal/pane.ts`'s `TerminalSurface.showNotice` and `render/dead.ts`'s
// `showDeadSurfaceNotice`, "mirrors ... exactly"). Operates on the minimal
// `{ hidden, textContent }` shape rather than `HTMLElement`, so it needs no DOM and
// `dead.test.ts`'s existing `fakeRefs()`/`fakeNoticeEl()` stubs can drive it directly
// (docs/conventions.md: keep logic in pure modules separate from DOM code).
export interface NoticeTarget {
  // `boolean | "until-found"` matches lib.dom.d.ts's `HTMLElement.hidden` exactly (the
  // HTML spec's content-visibility addition) so a real element is assignable here without
  // a cast; this module only ever assigns the two boolean values.
  hidden: boolean | "until-found";
  textContent: string;
}

/** REQ-13: an `"outcome"` notice auto-hides ~5s after it appears, as every notice used
 * to. An `"inflight"` notice (`terminal/pane.ts`'s `Locating <name>…` text while a
 * locate request is running) stays visible until something else replaces it — no timer
 * is armed for it at all. Only `terminal/pane.ts` ever passes `"inflight"`; every
 * `showDeadSurfaceNotice` caller is a failure outcome (plan Implementation Notes), so
 * `render/dead.ts` never needs the distinction and relies on the `"outcome"` default. */
export type NoticeKind = "outcome" | "inflight";

const AUTO_HIDE_MS = 5000;

// Edge case 8: keyed per notice target (WeakMap), not one module-level timer, so two
// surfaces' notices (e.g. two dead tiles, or a dead tile and a live pane) time out
// independently of each other — the property `dead.ts`'s own WeakMap already had, and
// which this extraction must not collapse away.
const timers = new WeakMap<NoticeTarget, ReturnType<typeof setTimeout>>();

/** Shows (or, given `null`, clears) one surface's notice, cancelling any pending
 * auto-hide timer first — edge cases 6/7: a new notice (whether it's a fresh outcome
 * replacing an in-flight one, or a second outcome replacing a first) or an explicit
 * clear must never leave a stale timer armed that later fires against unrelated,
 * newer content. */
export function showNotice(
  target: NoticeTarget,
  text: string | null,
  kind: NoticeKind = "outcome",
): void {
  const pending = timers.get(target);
  if (pending !== undefined) clearTimeout(pending);
  timers.delete(target);

  if (text === null) {
    target.hidden = true;
    target.textContent = "";
    return;
  }

  target.textContent = text;
  target.hidden = false;

  if (kind === "inflight") return;

  const timer = setTimeout(() => {
    target.hidden = true;
    target.textContent = "";
    timers.delete(target);
  }, AUTO_HIDE_MS);
  timers.set(target, timer);
}
