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
import { createShell } from "../api/sessions";
import type { ApiErrorBody } from "../api/http";
import { showDeadSurfaceNotice, type DeadSurfaceRefs } from "../render/dead";
import { TerminalSurface } from "../terminal/pane";
import {
  clearOnSelect,
  EMPTY_SHELL_ACTIVITY,
  getShellActivity,
  observeBusy,
  observeIdle,
  resolveOnset,
  resolveSelfClear,
  restoreBusy,
  restoreIdle,
  shellGone,
  type ActivityResult,
  type ScheduledTimer,
  type ShellActivityIndicator,
  type ShellActivityState,
} from "../terminal/shellactivity";
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
  /** Plan terminal-fixes-cleanup: the `shell` segment's busy/done verdict for `id`, per
   * `terminal/shellactivity.ts`'s reducer — `render/mainhead.ts` and `features/tiles.ts`
   * read this on every render pass to drive `span.shellact` (Testable UI Elements). */
  activityFor(id: number): ShellActivityIndicator;
}

export function initSurfaces(app: App, deps: SurfacesDeps): SurfacesHandle {
  // Keyed by `surfaceKey(id, kind)`, not by session id alone — a session's Claude pane
  // and its shell are independent attach targets (INV-3), and only the currently-selected
  // kind ever has a live entry (REQ-5 disposes the hidden one on every switch).
  const surfaces = new Map<string, TerminalSurface>();
  let surfaceSwitchState: SurfaceSwitchState = new Map();
  let activityState: ShellActivityState = EMPTY_SHELL_ACTIVITY;
  // Stale-response guard for `select`'s shell-spawn round trip — same shape as
  // `features/launch.ts`'s `browseRequestId` and `features/issue.ts`'s `captureRequestId`,
  // but keyed per session id: `select` runs for independent sessions concurrently, and a
  // newer selection on session A must never drop a still-current spawn on session B.
  const selectRequestId = new Map<number, number>();

  function isShellSelected(id: number): boolean {
    return getSurfaceState(surfaceSwitchState, id).selected === "shell";
  }

  /** Glue for `shellactivity.ts`'s epoch-guarded timers (module header comment): applies
   * the reducer's new state immediately and, if it asked for one, arranges the delayed
   * callback with a real `setTimeout` — a late/superseded firing is a harmless no-op on
   * the reducer side, so nothing here needs to track or cancel a timer handle. */
  function applyActivity(result: ActivityResult): void {
    activityState = result.state;
    if (result.timer) scheduleActivityTimer(result.timer);
  }

  function scheduleActivityTimer(timer: ScheduledTimer): void {
    setTimeout(() => {
      activityState =
        timer.kind === "onset"
          ? resolveOnset(activityState, timer.id, timer.epoch)
          : resolveSelfClear(activityState, timer.id, timer.epoch);
      app.render();
    }, timer.delayMs);
  }

  function handleShellEnded(id: number): void {
    surfaceSwitchState = shellEnded(surfaceSwitchState, id);
    // REQ-8/edge cases 1-2: the shell itself is gone — clears unconditionally, no
    // transient tick (shellactivity.ts's `shellGone` vs. `observeIdle`).
    activityState = shellGone(activityState, id);
    app.render();
  }

  /** A shell-spawn POST failed: surface the message on whichever `claude` surface is live,
   * or through the dead-surface notice when nothing is. Split out of `select` to keep its
   * cognitive complexity under the lint ceiling. */
  function reportShellSpawnFailure(
    id: number,
    error: ApiErrorBody,
    findDeadRefs: () => DeadSurfaceRefs | null,
  ): void {
    // http.ts's `logApiFailure` already logged this under its own route (e-m5).
    const liveSurface = surfaces.get(surfaceKey(id, "claude"));
    if (liveSurface) {
      liveSurface.showNotice(error.message);
      return;
    }
    const deadRefs = findDeadRefs();
    if (deadRefs) showDeadSurfaceNotice(deadRefs, error.message);
  }

  function select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void {
    const current = getSurfaceState(surfaceSwitchState, id);
    if (current.selected === kind) return;

    // Plan markdown-viewing REQ-1/Affected Files: `docs` is a pure selection, same as
    // `claude` — no daemon round trip, unlike `shell`'s lazy spawn below.
    const requestId = (selectRequestId.get(id) ?? 0) + 1;
    selectRequestId.set(id, requestId);

    if (kind === "claude" || kind === "docs") {
      surfaceSwitchState = selectSurface(surfaceSwitchState, id, kind);
      app.render();
      return;
    }

    void createShell(id).then((result) => {
      // A newer selection for this id landed first — drop this stale response
      // (features/launch.ts's `navigate` guard, same shape).
      if (selectRequestId.get(id) !== requestId) return;
      if (!result.ok) {
        reportShellSpawnFailure(id, result.error, findDeadRefs);
        return;
      }
      surfaceSwitchState = setShellRunning(surfaceSwitchState, id, true);
      surfaceSwitchState = selectSurface(surfaceSwitchState, id, "shell");
      // REQ-4: selecting `shell` clears a showing tick immediately.
      activityState = clearOnSelect(activityState, id);
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
      const state = getSurfaceState(surfaceSwitchState, id);
      if (isSurfaceAttachable(surfaceSwitchState, id, session.alive)) {
        entries.push({ id, kind: state.selected });
      }
      // Plan markdown-viewing INV-1: `docs` never has a `TerminalSurface` of its own,
      // but a shell still running underneath it must stay attached in the background
      // (never mounted — focus.ts/tiles.ts only ever ask for the *selected* kind) so its
      // `onShellEnded` still fires and reverts `shellRunning`/`selected` state even while
      // it isn't the displayed surface.
      if (state.selected === "docs" && state.shellRunning) {
        entries.push({ id, kind: "shell" });
      }
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
    // dropping whichever of the composite-keyed surfaces exists. `docs` never has a
    // mounted `TerminalSurface` (INV-1) — included for symmetry, always a no-op `.get`.
    for (const kind of ["claude", "shell", "docs"] as const) {
      const key = surfaceKey(id, kind);
      surfaces.get(key)?.dispose();
      surfaces.delete(key);
    }
    surfaceSwitchState = forgetSession(surfaceSwitchState, id);
    activityState = shellGone(activityState, id);
    selectRequestId.delete(id);
  });

  // Plan terminal-fixes-cleanup: a live `shellActivity` transition for one session —
  // Protocol Contract's `/ws` broadcast, independent of whichever shell socket (if any)
  // is currently attached (E12).
  app.on("shellActivity", (sessionId, busy) => {
    applyActivity(
      busy
        ? observeBusy(activityState, sessionId)
        : observeIdle(activityState, sessionId, isShellSelected(sessionId)),
    );
  });

  /** After the daemon connection is restored, every currently-mounted surface gets a
   * chance to reattach — a no-op unless it's showing the "disconnected" overlay for a
   * still-attachable target. Plan plain-terminal-session, edge case 14: a shell surface's
   * "attachable" is `shellRunning`, never `session.alive`.
   *
   * Plan terminal-fixes-cleanup: also re-syncs the activity indicator from
   * `snapshot.shellsBusy` (W9) — every id it lists is busy right now, immediately, no
   * onset delay; every id this module still shows "busy" for but the snapshot omits gets
   * `restoreIdle`'s treatment, never `observeIdle`'s (that one is for a *live*
   * `shellActivity` message only) — see `restoreIdle`'s own doc comment for why a
   * snapshot gap always schedules the self-clear regardless of the current surface
   * selection, which is what lets this same branch satisfy both W6/edge case 3 and edge
   * case 4's daemon-restart-mid-command. */
  app.on("snapshot", (snapshot) => {
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

    const busyNow = new Set(snapshot.shellsBusy ?? []);
    for (const id of busyNow) applyActivity(restoreBusy(activityState, id));
    // Snapshotting `.keys()` up front (rather than re-reading the reassigned
    // `activityState` mid-loop): `applyActivity` replaces `activityState` with a new Map
    // on every call (shellactivity.ts's immutable-update pattern), but the iterator this
    // produces stays bound to the Map instance captured here, so it safely walks the
    // pre-diff id set exactly once regardless of reassignment.
    for (const id of activityState.keys()) {
      if (!busyNow.has(id) && getShellActivity(activityState, id) === "busy") {
        applyActivity(restoreIdle(activityState, id));
      }
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
    activityFor(id) {
      return getShellActivity(activityState, id);
    },
  };
}
