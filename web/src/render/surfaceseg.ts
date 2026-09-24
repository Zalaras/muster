// The segmented `claude | shell | docs` control's DOM half
// (kb:adr/surfaces-shell-is-attach-target-not-session; `docs` added per
// kb:adr/reader-docs-is-third-surface-segment) — split out of
// `terminal/surfaceswitch.ts` (`terminal/` holds pure logic only, per
// docs/conventions.md § Composition roots; this builder belongs with the other DOM
// builders in `render/`). One component rendered in two places: the Focus mainhead
// (`.mainhead .surfseg`) and every tile's footer (`.tfoot .acts .surfseg`). Built once per
// host (features/focus.ts at startup for the mainhead; render/tiles.ts's buildTile for
// each tile) and only ever mutated afterward — never rebuilt on a render tick, per
// docs/conventions.md's "Focusable controls inside the render tick are reused, never
// rebuilt" rule (precedent: render/tiles.ts's rename button, built once in buildTile and
// only ever text-updated by updateTileChrome; the tile drag handle follows the same rule).
// The reducer (which surface is selected, is a shell running) stays in
// `terminal/surfaceswitch.ts`, the only owner that mutates it.
import type { ShellActivityIndicator } from "../terminal/shellactivity";
import type { SessionSurfaceState, SurfaceKind } from "../terminal/surfaceswitch";

export interface SurfaceSegmentRefs {
  root: HTMLElement;
  claudeBtn: HTMLButtonElement;
  shellBtn: HTMLButtonElement;
  /** The third `docs` segment (kb:adr/reader-docs-is-third-surface-segment), a native
   * `<button>` exactly like its siblings — no indicator, no `shellRunning`-style flag of
   * its own. */
  docsBtn: HTMLButtonElement;
  /** The activity indicator `<span class="shellact">`, `aria-hidden` so the shell
   * button's accessible name stays exactly "shell" in every indicator state — kept
   * detached from `shellBtn` (via `.remove()`) until `updateSurfaceSegment` re-attaches
   * it, rather than toggled via `hidden`/`display`, so presence and `data-act` value are
   * the contract a caller asserts (`toHaveCount`/`toHaveAttribute`, not visibility). */
  shellActEl: HTMLElement;
}

/** Builds the segmented control once: `role="group" aria-label="Surface"`, native
 * `<button>`s named exactly `claude`/`shell`. `onSelect` fires on every click of either
 * segment, including the currently-selected one — callers short-circuit a same-surface
 * click themselves (features/surfaces.ts's `select`), same shape as the existing
 * Focus/Tiles view-switch buttons. */
export function buildSurfaceSegment(onSelect: (kind: SurfaceKind) => void): SurfaceSegmentRefs {
  const root = document.createElement("div");
  root.className = "surfseg";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Surface");

  const claudeBtn = document.createElement("button");
  claudeBtn.type = "button";
  claudeBtn.dataset["surf"] = "claude";
  claudeBtn.textContent = "claude";

  const shellBtn = document.createElement("button");
  shellBtn.type = "button";
  shellBtn.dataset["surf"] = "shell";
  const shellActEl = document.createElement("span");
  shellActEl.className = "shellact";
  // Never contributes to the button's accessible name in any indicator state.
  shellActEl.setAttribute("aria-hidden", "true");
  shellBtn.append(shellActEl, document.createTextNode("shell"));
  // States: "no data yet ... no indicator" — starts absent; updateSurfaceSegment
  // re-attaches it once the reducer reports "busy" or "done".
  shellActEl.remove();

  const docsBtn = document.createElement("button");
  docsBtn.type = "button";
  docsBtn.dataset["surf"] = "docs";
  docsBtn.textContent = "docs";

  root.append(claudeBtn, shellBtn, docsBtn);

  claudeBtn.addEventListener("click", () => onSelect("claude"));
  shellBtn.addEventListener("click", () => onSelect("shell"));
  docsBtn.addEventListener("click", () => onSelect("docs"));

  return { root, claudeBtn, shellBtn, docsBtn, shellActEl };
}

/** Every render pass: `aria-pressed` on all three segments, the activity indicator's
 * presence and `data-act` value, and `disabled` on all three while the WS is down
 * (States: "the segment buttons are disabled while the WS is down" — the same gate every
 * other action control uses; never gated on `alive`, since `shell` must stay clickable on
 * a dead session). `activity` is `features/surfaces.ts`'s
 * `terminal/shellactivity.ts` verdict for this session — `"none"` removes the indicator
 * entirely (States: "no data yet" / an idle shell are deliberately indistinguishable),
 * `"busy"`/`"done"` attach it and set `data-act` accordingly. */
export function updateSurfaceSegment(
  refs: SurfaceSegmentRefs,
  state: SessionSurfaceState,
  connected: boolean,
  activity: ShellActivityIndicator,
): void {
  refs.claudeBtn.setAttribute("aria-pressed", String(state.selected === "claude"));
  refs.shellBtn.setAttribute("aria-pressed", String(state.selected === "shell"));
  refs.docsBtn.setAttribute("aria-pressed", String(state.selected === "docs"));
  refs.claudeBtn.disabled = !connected;
  refs.shellBtn.disabled = !connected;
  refs.docsBtn.disabled = !connected;
  const hasIndicator = refs.shellBtn.contains(refs.shellActEl);
  if (activity === "none") {
    if (hasIndicator) refs.shellActEl.remove();
    return;
  }
  if (!hasIndicator) refs.shellBtn.prepend(refs.shellActEl);
  refs.shellActEl.dataset["act"] = activity;
}
