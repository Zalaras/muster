// The segmented `claude | shell` control (plan plain-terminal-session, REQ-4) — one
// component rendered in two places: the Focus mainhead (`.mainhead .surfseg`) and every
// tile's footer (`.tfoot .acts .surfseg`). Built once per host (features/focus.ts at
// startup for the mainhead; render/tiles.ts's buildTile for each tile) and only ever mutated
// afterward — never rebuilt on a render tick, per docs/conventions.md's "Focusable
// controls inside the render tick are reused, never rebuilt" rule (precedent:
// render/tiles.ts's rename button, built once in buildTile and only ever text-updated by
// updateTileChrome; the tile drag handle follows the same rule).
//
// The per-session "which surface is selected, is a shell running" state is a small pure
// Map held by features/surfaces.ts — this module never reads a Session or touches a
// socket, so it's Vitest-testable without a DOM (Implementation Notes > Testability). A
// session's shell has no representation in the Session wire object (kb:anchor/sessions.shell), so
// this state exists nowhere else; features/surfaces.ts is the only owner and mutates it
// only via the functions below.

export type SurfaceKind = "claude" | "shell";

export interface SessionSurfaceState {
  selected: SurfaceKind;
  shellRunning: boolean;
}

export type SurfaceSwitchState = ReadonlyMap<number, SessionSurfaceState>;

/** States: "before the first switch: claude selected, shell unselected, no pip" — the
 * value every session starts at and returns to once a shell ends (REQ-8). */
export const DEFAULT_SURFACE_STATE: SessionSurfaceState = {
  selected: "claude",
  shellRunning: false,
};

export function getSurfaceState(state: SurfaceSwitchState, id: number): SessionSurfaceState {
  return state.get(id) ?? DEFAULT_SURFACE_STATE;
}

/** User flow 2/3: switches which surface is selected for `id`. Never changes
 * `shellRunning` — that only ever changes via `setShellRunning`/`shellEnded` below, which
 * keep it in step with what the daemon actually reports (POST success/failure, PTY EOF).
 * Identity (same map) when `kind` is already selected, so a caller can call this
 * unconditionally without a redundant re-render. */
export function selectSurface(
  state: SurfaceSwitchState,
  id: number,
  kind: SurfaceKind,
): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  if (current.selected === kind) return state;
  const next = new Map(state);
  next.set(id, { ...current, selected: kind });
  return next;
}

/** REQ-1/REQ-8: records whether `id`'s shell tmux session is known to be running — set
 * `true` on a successful `POST .../shell` (created or not), `false` by `shellEnded` below.
 * Identity when already at `running`. */
export function setShellRunning(
  state: SurfaceSwitchState,
  id: number,
  running: boolean,
): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  if (current.shellRunning === running) return state;
  const next = new Map(state);
  next.set(id, { ...current, shellRunning: running });
  return next;
}

/** REQ-8: the shell ended (`exit`, an external kill, or any other PTY EOF on the shell
 * socket) — clears `shellRunning` and, in the same step, reverts `selected` to `claude`
 * if `shell` was showing (the swap-back and the pip clearing are one atomic state
 * change, never two renders). Identity if the session was already at the default state. */
export function shellEnded(state: SurfaceSwitchState, id: number): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  if (!current.shellRunning && current.selected === "claude") return state;
  const next = new Map(state);
  next.set(id, { selected: "claude", shellRunning: false });
  return next;
}

/** Drops a removed session's entry so this map never accumulates state for a session
 * Muster no longer knows about. Identity if `id` has no entry. */
export function forgetSession(state: SurfaceSwitchState, id: number): SurfaceSwitchState {
  if (!state.has(id)) return state;
  const next = new Map(state);
  next.delete(id);
  return next;
}

/** Whether the currently-selected surface for `id` should have a live `TerminalSurface`
 * mounted: `claude` follows the session's own `alive`; `shell` follows `shellRunning`
 * (REQ-7 — never `alive`, in either direction). */
export function isSurfaceAttachable(
  state: SurfaceSwitchState,
  id: number,
  alive: boolean,
): boolean {
  const current = getSurfaceState(state, id);
  return current.selected === "shell" ? current.shellRunning : alive;
}

const SURFACE_KEY_SEPARATOR = ":";

/** The composite key features/surfaces.ts's surface manager keys its `TerminalSurface` map by (id,
 * kind) — a session's Claude pane and its shell are independent attach targets (INV-3)
 * that may each need their own live surface, so a plain session id is not a unique key. */
export function surfaceKey(id: number, kind: SurfaceKind): string {
  return `${id}${SURFACE_KEY_SEPARATOR}${kind}`;
}

export function parseSurfaceKey(key: string): { id: number; kind: SurfaceKind } {
  const [idPart, kindPart] = key.split(SURFACE_KEY_SEPARATOR);
  return { id: Number(idPart), kind: kindPart === "shell" ? "shell" : "claude" };
}

// ── DOM: the segmented control itself ──────────────────────────────────────────────────

export interface SurfaceSegmentRefs {
  root: HTMLElement;
  claudeBtn: HTMLButtonElement;
  shellBtn: HTMLButtonElement;
  /** The pip `<span>` (Testable UI Elements: "the pip inside the shell button is an
   * empty `<span>`, so the button's accessible name is exactly shell") — kept detached
   * from `shellBtn` (via `.remove()`) until `updateSurfaceSegment` re-attaches it, rather
   * than toggled via `hidden`/`display`, per the table's "the pip's presence in the DOM
   * is the only indicator a shell is running" (a caller asserts `toHaveCount`, not
   * visibility). */
  pipEl: HTMLElement;
}

/** Builds the segmented control once (Testable UI Elements: `role="group"
 * aria-label="Surface"`, native `<button>`s named exactly `claude`/`shell`). `onSelect`
 * fires on every click of either segment, including the currently-selected one — callers
 * short-circuit a same-surface click themselves (features/surfaces.ts's `select`), same
 * shape as the existing Focus/Tiles view-switch buttons. */
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
  const pipEl = document.createElement("span");
  pipEl.className = "pip";
  shellBtn.append(pipEl, document.createTextNode("shell"));
  // States: "no data yet ... no pip" — starts absent; updateSurfaceSegment re-attaches
  // it once a shell is known to be running.
  pipEl.remove();

  root.append(claudeBtn, shellBtn);

  claudeBtn.addEventListener("click", () => onSelect("claude"));
  shellBtn.addEventListener("click", () => onSelect("shell"));

  return { root, claudeBtn, shellBtn, pipEl };
}

/** Every render pass: `aria-pressed` on both segments, the pip's presence in the DOM, and
 * `disabled` on both while the WS is down (States: "the segment buttons are disabled
 * while the WS is down" — the same gate every other action control uses; never gated on
 * `alive`, since `shell` must stay clickable on a dead session — REQ-7). */
export function updateSurfaceSegment(
  refs: SurfaceSegmentRefs,
  state: SessionSurfaceState,
  connected: boolean,
): void {
  refs.claudeBtn.setAttribute("aria-pressed", String(state.selected === "claude"));
  refs.shellBtn.setAttribute("aria-pressed", String(state.selected === "shell"));
  refs.claudeBtn.disabled = !connected;
  refs.shellBtn.disabled = !connected;
  const hasPip = refs.shellBtn.contains(refs.pipEl);
  if (state.shellRunning && !hasPip) refs.shellBtn.prepend(refs.pipEl);
  else if (!state.shellRunning && hasPip) refs.pipEl.remove();
}
