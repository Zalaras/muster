// The per-session "which surface is selected, is a shell running" reducer for the
// segmented `claude | shell | docs` control (plan plain-terminal-session, REQ-4; `docs`
// added by plan markdown-viewing, REQ-1). A small pure Map held by features/surfaces.ts —
// this module never reads a Session, touches a socket, or builds DOM (review Minor 17:
// `terminal/` holds pure logic only; the control's DOM half moved to
// `render/surfaceseg.ts`), so it's Vitest-testable without a DOM (Implementation Notes >
// Testability). A session's shell has no representation in the Session wire object
// (kb:anchor/sessions.shell), so this state exists nowhere else; features/surfaces.ts is
// the only owner and mutates it only via the functions below.

// Plan markdown-viewing REQ-1: `docs` joins the segment as a third kind — a reader,
// never a `TerminalSurface` (INV-1). It carries no shell-like "is it running" flag of
// its own; `isSurfaceAttachable` below always answers `false` for it.

export type SurfaceKind = "claude" | "shell" | "docs";

export interface SessionSurfaceState {
  selected: SurfaceKind;
  shellRunning: boolean;
}

export type SurfaceSwitchState = ReadonlyMap<number, SessionSurfaceState>;

/** The value every session starts at and returns to once a shell ends (REQ-8): `claude`
 * selected, no shell running. */
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
 * if `shell` was showing (one atomic state change, never two renders). `shellRunning` is
 * what `features/surfaces.ts`'s `isSurfaceAttachable`/`desiredSurfaceEntries` read to
 * decide whether a shell `TerminalSurface` should be mounted at all — including, while
 * `docs` is selected, mounted invisibly in the background so this same handler still
 * fires when the shell it's tracking ends underneath the reader. Plan markdown-viewing
 * edge case 20/INV-1: a `docs` selection is left untouched here — only `shellRunning`
 * clears — since `docs` was never the shell surface to begin with. Identity if the
 * session was already at the default state. */
export function shellEnded(state: SurfaceSwitchState, id: number): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  const selected = current.selected === "shell" ? "claude" : current.selected;
  if (!current.shellRunning && selected === current.selected) return state;
  const next = new Map(state);
  next.set(id, { selected, shellRunning: false });
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
 * (REQ-7 — never `alive`, in either direction); `docs` is never attachable — the reader
 * replaces the pane, it never has a `TerminalSurface` (plan markdown-viewing INV-1). */
export function isSurfaceAttachable(
  state: SurfaceSwitchState,
  id: number,
  alive: boolean,
): boolean {
  const current = getSurfaceState(state, id);
  if (current.selected === "docs") return false;
  return current.selected === "shell" ? current.shellRunning : alive;
}

/** What a session's slot should show right now (review Major 3): the reader (`docs`,
 * regardless of `alive` — INV-1 — the reader replaces the pane either way), the dead-surface
 * cap (`claude` selected on a session that has exited), or the live/attachable surface
 * itself (including a `shell` on a dead session — REQ-7 never consults `alive` for shell).
 * `features/focus.ts` and `features/tiles.ts` each re-derived this branch, in a different
 * order and with inverted conditions — this is the one decision both call. */
export type SurfaceBodyKind = "dead" | "docs" | "surface";

export function surfaceBodyKind(selected: SurfaceKind, alive: boolean): SurfaceBodyKind {
  if (selected === "docs") return "docs";
  if (selected === "claude" && !alive) return "dead";
  return "surface";
}

const SURFACE_KEY_SEPARATOR = ":";

/** The composite key features/surfaces.ts's surface manager keys its `TerminalSurface` map by (id,
 * kind) — a session's Claude pane and its shell are independent attach targets (INV-3)
 * that may each need their own live surface, so a plain session id is not a unique key. */
export function surfaceKey(id: number, kind: SurfaceKind): string {
  return `${id}${SURFACE_KEY_SEPARATOR}${kind}`;
}

function toSurfaceKind(kindPart: string | undefined): SurfaceKind {
  if (kindPart === "shell") return "shell";
  if (kindPart === "docs") return "docs";
  return "claude";
}

export function parseSurfaceKey(key: string): { id: number; kind: SurfaceKind } {
  const [idPart, kindPart] = key.split(SURFACE_KEY_SEPARATOR);
  return { id: Number(idPart), kind: toSurfaceKind(kindPart) };
}
