// Pure focus-restore decision — the DOM
// effect (remembering `document.activeElement` before a disconnect render, calling
// `.focus()` after a reconnect render) lives in `features/connection.ts`, its one caller;
// this module lives beside it (docs/conventions.md § Composition roots: a DOM-free
// decision one controller calls lives in `features/`, not `render/`). These two functions
// are its unit surface, deliberately typed on a minimal duck-typed shape rather than
// `Element` so Vitest can drive them with a plain object, no jsdom.

/** The subset of `Element` a restore decision needs. A real `document.activeElement`
 * satisfies this structurally. */
export interface RestorableCandidate {
  tagName: string;
  closest(selector: string): unknown;
}

/** True for a `button`/`select` inside `#app` — the two control kinds a render disables
 * with `disabled = !connected` (mainhead, tiles, the segment control, the Issue button,
 * rail cards). False for anything else, including a terminal's textarea, a link, or
 * `body` itself. */
export function isRestorableControl(el: RestorableCandidate | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();
  if (tag !== "BUTTON" && tag !== "SELECT") return false;
  return el.closest("#app") !== null;
}

export interface FocusRestoreInput {
  /** `document.activeElement === document.body` on the render that just returned to
   * "connected" — a control the user tabbed elsewhere from after reconnecting is left
   * alone: otherwise focus is wherever the browser left it, never forced
   * elsewhere. */
  activeIsBody: boolean;
  /** The remembered element's `.isConnected` — false when the reconnect render replaced
   * it. */
  stillInDocument: boolean;
  /** The remembered element's `.disabled` — true when it's still disabled after
   * reconnect (e.g. Resume on a still-live session). */
  disabled: boolean;
}

export function shouldRestoreFocus(input: FocusRestoreInput): boolean {
  return input.activeIsBody && input.stillInDocument && !input.disabled;
}
