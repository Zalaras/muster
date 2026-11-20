// The per-session "which surface is selected, which terminal is shown" reducer for the
// segmented `claude | shell | ▾ | docs` control
// (kb:adr/surfaces-shell-is-attach-target-not-session; `docs` added by
// kb:adr/reader-docs-is-third-surface-segment). A small pure Map held by
// features/surfaces.ts — this module never reads a Session, touches a socket, or builds
// DOM (`terminal/` holds pure logic only; the control's DOM half moved to
// `render/surfaceseg.ts`), so it's Vitest-testable without a DOM. A session's shell has no
// representation in the Session wire object (kb:anchor/sessions.shell), so this state
// exists nowhere else; features/surfaces.ts is the only owner and mutates it only via the
// functions below.

// kb:adr/reader-docs-is-third-surface-segment: `docs` joins the segment as a third kind —
// a reader, never a `TerminalSurface`. It carries no shell-like "is it running" flag of
// its own; `isSurfaceAttachable` below always answers `false` for it.

export type SurfaceKind = "claude" | "shell" | "docs";

export interface SessionSurfaceState {
  selected: SurfaceKind;
  shell: number | null;
}

export type SurfaceSwitchState = ReadonlyMap<number, SessionSurfaceState>;

export const DEFAULT_SURFACE_STATE: SessionSurfaceState = {
  selected: "claude",
  shell: null,
};

export function getSurfaceState(state: SurfaceSwitchState, id: number): SessionSurfaceState {
  return state.get(id) ?? DEFAULT_SURFACE_STATE;
}

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

export function showTerminal(state: SurfaceSwitchState, id: number, n: number): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  if (current.shell === n) return state;
  const next = new Map(state);
  next.set(id, { ...current, shell: n });
  return next;
}

export function terminalsChanged(
  state: SurfaceSwitchState,
  id: number,
  list: readonly { n: number }[],
): SurfaceSwitchState {
  const current = getSurfaceState(state, id);
  if (current.shell !== null && list.some((t) => t.n === current.shell)) return state;
  const shell = list.reduce<number | null>(
    (low, t) => (low === null || t.n < low ? t.n : low),
    null,
  );
  const selected = shell === null && current.selected === "shell" ? "claude" : current.selected;
  if (shell === current.shell && selected === current.selected) return state;
  const next = new Map(state);
  next.set(id, { selected, shell });
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

export function isSurfaceAttachable(
  state: SurfaceSwitchState,
  id: number,
  alive: boolean,
): boolean {
  const current = getSurfaceState(state, id);
  if (current.selected === "docs") return false;
  return current.selected === "shell" ? current.shell !== null : alive;
}

/** What a session's slot should show right now: the reader (`docs`,
 * regardless of `alive` — the reader replaces the pane either way), the dead-surface
 * cap (`claude` selected on a session that has exited), or the live/attachable surface
 * itself (including a `shell` on a dead session — shell never consults `alive`).
 * `features/focus.ts` and `features/tiles.ts` each re-derived this branch, in a different
 * order and with inverted conditions — this is the one decision both call. */
export type SurfaceBodyKind = "dead" | "docs" | "surface";

export function surfaceBodyKind(selected: SurfaceKind, alive: boolean): SurfaceBodyKind {
  if (selected === "docs") return "docs";
  if (selected === "claude" && !alive) return "dead";
  return "surface";
}

const SURFACE_KEY_SEPARATOR = ":";

export function surfaceKey(id: number, kind: SurfaceKind, n?: number | null): string {
  const base = `${id}${SURFACE_KEY_SEPARATOR}${kind}`;
  return kind === "shell" && n != null ? `${base}${SURFACE_KEY_SEPARATOR}${n}` : base;
}

function toSurfaceKind(kindPart: string | undefined): SurfaceKind {
  if (kindPart === "shell") return "shell";
  if (kindPart === "docs") return "docs";
  return "claude";
}

export function parseSurfaceKey(key: string): { id: number; kind: SurfaceKind; n: number | null } {
  const [idPart, kindPart, nPart] = key.split(SURFACE_KEY_SEPARATOR);
  return {
    id: Number(idPart),
    kind: toSurfaceKind(kindPart),
    n: nPart === undefined ? null : Number(nPart),
  };
}
