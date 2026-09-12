// The `TerminalSurface` manager: which sessions are live in the current view (Focus's
// one pane, or Tiles' grid) and which `terminal/pane.ts` instances exist for them — the
// only place a `TerminalSurface` is ever constructed or disposed (W7/W8: no render path
// opens a socket outside this manager, and never for an `alive:false` session). Also owns
// per-session surface-switch state (`claude`/`shell` selection) — plan
// plain-terminal-session (plan code-breakup vocabulary: "surfaces").
//
// `deps.tilesLive` is a thunk: `tiles` is constructed after `surfaces` (main.ts's init
// order — tiles needs `surfaces.get`/`select` at render time), so this closes over the
// later `const` rather than taking a value now.
import type { App, RenderFrame } from "../app";
import type { Session } from "../protocol";
import { createShell } from "../api";
import { showDeadSurfaceNotice, type DeadSurfaceRefs } from "../render/dead";
import { TerminalSurface } from "../terminal/pane";
import {
  forgetSession,
  getSurfaceState,
  isSurfaceAttachable,
  parseSurfaceKey,
  selectSurface,
  setShellRunning,
  shellEnded,
  surfaceKey,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";

export interface SurfacesDeps {
  tilesLive(): readonly number[];
}

export interface SurfacesHandle {
  state(): SurfaceSwitchState;
  get(id: number, kind: SurfaceKind): TerminalSurface | undefined;
  /** Plan plain-terminal-session REQ-4/REQ-5/REQ-8/REQ-12: the one dispatcher every
   * `claude`/`shell` segment (mainhead + every tile) routes through. `findDeadRefs` is
   * consulted only on a shell-creation failure with no live surface to route the notice
   * through. */
  select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void;
  applyTheme(): void;
  focusSelected(id: number): void;
}

export function initSurfaces(app: App, deps: SurfacesDeps): SurfacesHandle {
  // Keyed by `surfaceKey(id, kind)`, not by session id alone — a session's Claude pane
  // and its shell are independent attach targets (INV-3), and only the currently-selected
  // kind ever has a live entry (REQ-5 disposes the hidden one on every switch).
  const surfaces = new Map<string, TerminalSurface>();
  let surfaceSwitchState: SurfaceSwitchState = new Map();

  function handleShellEnded(id: number): void {
    surfaceSwitchState = shellEnded(surfaceSwitchState, id);
    app.render();
  }

  function select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void {
    const current = getSurfaceState(surfaceSwitchState, id);
    if (current.selected === kind) return;

    if (kind === "claude") {
      surfaceSwitchState = selectSurface(surfaceSwitchState, id, "claude");
      app.render();
      return;
    }

    void createShell(id).then((result) => {
      if (!result.ok) {
        console.error(
          `POST /api/sessions/${id}/shell failed: ${result.error.code} ${result.error.message}`,
        );
        const liveSurface = surfaces.get(surfaceKey(id, "claude"));
        if (liveSurface) {
          liveSurface.showNotice(result.error.message);
        } else {
          const deadRefs = findDeadRefs();
          if (deadRefs) showDeadSurfaceNotice(deadRefs, result.error.message);
        }
        return;
      }
      surfaceSwitchState = setShellRunning(surfaceSwitchState, id, true);
      surfaceSwitchState = selectSurface(surfaceSwitchState, id, "shell");
      app.render();
    });
  }

  /** The ids the current view can show a surface for: the focused one in focus view, every
   * live tile otherwise. */
  function visibleSessionIds(): readonly number[] {
    if (app.state.view !== "focus") return deps.tilesLive();
    return app.state.focusedId !== null ? [app.state.focusedId] : [];
  }

  /** The `(id, kind)` pairs that should have a mounted surface right now — a visible
   * session that still exists and is attachable, at whichever surface it has selected. */
  function desiredSurfaceEntries(
    sessions: readonly Session[],
  ): Array<{ id: number; kind: SurfaceKind }> {
    const entries: Array<{ id: number; kind: SurfaceKind }> = [];
    for (const id of visibleSessionIds()) {
      const session = sessions.find((s) => s.id === id);
      if (!session) continue;
      if (!isSurfaceAttachable(surfaceSwitchState, id, session.alive)) continue;
      entries.push({ id, kind: getSurfaceState(surfaceSwitchState, id).selected });
    }
    return entries;
  }

  /** Disposes every mounted surface the current frame no longer wants. */
  function closeSurfacesNotIn(desiredKeys: ReadonlySet<string>): void {
    for (const [key, surface] of surfaces) {
      if (!desiredKeys.has(key)) {
        surface.dispose();
        surfaces.delete(key);
      }
    }
  }

  /** Constructs a `TerminalSurface` for every wanted `(id, kind)` that has none yet — the
   * only place in the app one is ever constructed. */
  function openMissingSurfaces(
    entries: ReadonlyArray<{ id: number; kind: SurfaceKind }>,
    sessions: readonly Session[],
  ): void {
    for (const entry of entries) {
      const key = surfaceKey(entry.id, entry.kind);
      if (surfaces.has(key)) continue;
      const session = sessions.find((s) => s.id === entry.id);
      if (!session) continue;
      const onShellEnded = entry.kind === "shell" ? () => handleShellEnded(entry.id) : undefined;
      surfaces.set(key, new TerminalSurface(session, entry.kind, onShellEnded));
    }
  }

  // Render phase 7 (UI Specifications > Render phase order): open/close diff over
  // `(id, kind)` keys against the current view's visible ids.
  app.onRender((frame: RenderFrame) => {
    const { sessions } = frame;
    const desiredEntries = desiredSurfaceEntries(sessions);
    const desiredKeys = new Set(desiredEntries.map((entry) => surfaceKey(entry.id, entry.kind)));
    closeSurfacesNotIn(desiredKeys);
    openMissingSurfaces(desiredEntries, sessions);
  });

  app.on("sessionRemoved", (id) => {
    // REQ-9: Remove kills both tmux sessions server-side; the client mirrors that by
    // dropping whichever of the two composite-keyed surfaces exists.
    for (const kind of ["claude", "shell"] as const) {
      const key = surfaceKey(id, kind);
      surfaces.get(key)?.dispose();
      surfaces.delete(key);
    }
    surfaceSwitchState = forgetSession(surfaceSwitchState, id);
  });

  /** After the daemon connection is restored, every currently-mounted surface gets a
   * chance to reattach — a no-op unless it's showing the "disconnected" overlay for a
   * still-attachable target. Plan plain-terminal-session, edge case 14: a shell surface's
   * "attachable" is `shellRunning`, never `session.alive`. */
  app.on("snapshot", () => {
    const sessions = app.store.values();
    for (const [key, surface] of surfaces) {
      const { id, kind } = parseSurfaceKey(key);
      const session = sessions.find((s) => s.id === id);
      const attachable =
        kind === "shell"
          ? getSurfaceState(surfaceSwitchState, id).shellRunning
          : (session?.alive ?? false);
      surface.reattachIfDisconnected(attachable);
    }
  });

  return {
    state() {
      return surfaceSwitchState;
    },
    get(id, kind) {
      return surfaces.get(surfaceKey(id, kind));
    },
    select,
    applyTheme() {
      for (const surface of surfaces.values()) surface.applyTheme();
    },
    focusSelected(id) {
      surfaces.get(surfaceKey(id, getSurfaceState(surfaceSwitchState, id).selected))?.focus();
    },
  };
}
