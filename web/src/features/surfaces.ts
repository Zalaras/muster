// The `TerminalSurface` manager: which sessions are live in the current view (Focus's
// one pane, or Tiles' grid) and which `terminal/pane.ts` instances exist for them — the
// only place a `TerminalSurface` is ever constructed or disposed. No render path opens a
// socket outside this manager, and never for an `alive:false` session. Also owns
// per-session surface-switch state (`claude`/`shell`/`docs` selection, the terminal shown) and
// the daemon-reported terminal lists it is derived from.
//
// `deps.tilesLive` is `tiles.liveIds` passed straight through — `tiles` is already
// constructed by the time `surfaces` is (main.ts's init order: `tiles` itself takes a
// forward-reference `get<Noun>` thunk for `surfaces`, the other half of that pair), so
// this is a real value, not a thunk, even though the value itself is a getter function.
import type { App, RenderFrame } from "../app";
import type { Snapshot } from "../protocol/messages";
import type { Session } from "../protocol/session";
import type { TerminalInfo } from "../protocol/terminals";
import { closeTerminal, createShell, createTerminal, renameTerminal } from "../api/sessions";
import type { ApiErrorBody } from "../api/http";
import { showDeadSurfaceNotice, type DeadSurfaceRefs } from "../render/dead";
import { focusIsOnSwitchOrPage, type SurfaceTerminalsView } from "../render/surfaceseg";
import { visibleIds } from "../sessions/live";
import { installTerminalDrop } from "../terminal/dropwire";
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
  showTerminal,
  surfaceKey,
  terminalsChanged,
  type SurfaceKind,
  type SurfaceSwitchState,
} from "../terminal/surfaceswitch";
import {
  anyBusy,
  EMPTY_TERMINALS,
  forgetTerminals,
  getTerminals,
  setTerminals,
  terminalsFromSnapshot,
  type TerminalsState,
} from "../terminal/terminals";

export interface SurfacesDeps {
  tilesLive(): readonly number[];
}

export interface SurfacesHandle {
  state(): SurfaceSwitchState;
  get(id: number, kind: SurfaceKind): TerminalSurface | undefined;
  /** The one dispatcher every `claude`/`shell`/`docs` segment (mainhead + every tile) routes
   * through. `findDeadRefs` is consulted only on a shell-creation failure with no live
   * surface to route the notice through. */
  select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void;
  focusSelected(id: number): void;
  activityFor(id: number): ShellActivityIndicator;
  terminalsViewFor(id: number): SurfaceTerminalsView;
  terminals(id: number): readonly TerminalInfo[];
  shownTerminal(id: number): number | null;
  showTerminal(id: number, n: number): void;
  newTerminal(id: number, findDeadRefs: () => DeadSurfaceRefs | null): void;
  renameTerminal(id: number, n: number, name: string): void;
  closeTerminal(id: number, n: number): void;
}

export function initSurfaces(app: App, deps: SurfacesDeps): SurfacesHandle {
  const surfaces = new Map<string, TerminalSurface>();
  let surfaceSwitchState: SurfaceSwitchState = new Map();
  let terminalsState: TerminalsState = EMPTY_TERMINALS;
  let activityState: ShellActivityState = EMPTY_SHELL_ACTIVITY;
  // Stale-response guard for the terminal-spawn round trips — same shape as
  // `features/launch.ts`'s `browseRequestId` and `features/issue.ts`'s `captureRequestId`,
  // but keyed per session id: `select` runs for independent sessions concurrently, and a
  // newer selection on session A must never drop a still-current spawn on session B.
  const selectRequestId = new Map<number, number>();

  function isShellSelected(id: number): boolean {
    return getSurfaceState(surfaceSwitchState, id).selected === "shell";
  }

  function shownTerminalOf(id: number): number | null {
    const state = getSurfaceState(surfaceSwitchState, id);
    return state.selected === "shell" ? state.shell : null;
  }

  function surfaceFor(id: number, kind: SurfaceKind): TerminalSurface | undefined {
    const shell = getSurfaceState(surfaceSwitchState, id).shell;
    return surfaces.get(surfaceKey(id, kind, shell));
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

  function applyTerminalList(id: number, list: readonly TerminalInfo[]): void {
    const wasBusy = anyBusy(getTerminals(terminalsState, id));
    terminalsState = setTerminals(terminalsState, id, list);
    surfaceSwitchState = terminalsChanged(surfaceSwitchState, id, list);
    if (list.length === 0) {
      activityState = shellGone(activityState, id);
    } else if (anyBusy(list) && !wasBusy) {
      applyActivity(observeBusy(activityState, id));
    } else if (!anyBusy(list) && wasBusy) {
      applyActivity(observeIdle(activityState, id, isShellSelected(id)));
    }
  }

  function reportShellSpawnFailure(
    id: number,
    error: ApiErrorBody,
    findDeadRefs: () => DeadSurfaceRefs | null,
  ): void {
    // http.ts's `logApiFailure` already logged this under its own route.
    const liveSurface = surfaces.get(surfaceKey(id, "claude"));
    if (liveSurface) {
      liveSurface.showNotice(error.message);
      return;
    }
    const deadRefs = findDeadRefs();
    if (deadRefs) showDeadSurfaceNotice(deadRefs, error.message);
  }

  function showAndSelect(id: number, n: number): void {
    surfaceSwitchState = showTerminal(surfaceSwitchState, id, n);
    surfaceSwitchState = selectSurface(surfaceSwitchState, id, "shell");
    activityState = clearOnSelect(activityState, id);
    app.render();
    app.emit("surfaceSwitched", id, "shell");
  }

  function nextRequestId(id: number): number {
    const requestId = (selectRequestId.get(id) ?? 0) + 1;
    selectRequestId.set(id, requestId);
    return requestId;
  }

  function select(id: number, kind: SurfaceKind, findDeadRefs: () => DeadSurfaceRefs | null): void {
    const current = getSurfaceState(surfaceSwitchState, id);
    if (current.selected === kind) return;

    const requestId = nextRequestId(id);

    if (kind === "claude" || kind === "docs") {
      surfaceSwitchState = selectSurface(surfaceSwitchState, id, kind);
      app.render();
      app.emit("surfaceSwitched", id, kind);
      return;
    }

    // Always asks the daemon: `POST …/shell` is idempotent and starts terminal 1 when none
    // runs, so a last-shown terminal this window still believes in never outlives a terminal
    // that ended before its `terminals` message arrived.
    void createShell(id).then((result) => {
      // A newer selection for this id landed first — drop this stale response
      // (features/launch.ts's `navigate` guard, same shape).
      if (selectRequestId.get(id) !== requestId) return;
      if (!result.ok) {
        reportShellSpawnFailure(id, result.error, findDeadRefs);
        return;
      }
      showAndSelect(id, getSurfaceState(surfaceSwitchState, id).shell ?? result.value.n);
    });
  }

  function newTerminal(id: number, findDeadRefs: () => DeadSurfaceRefs | null): void {
    const requestId = nextRequestId(id);
    void createTerminal(id).then((result) => {
      if (selectRequestId.get(id) !== requestId) return;
      if (!result.ok) {
        reportShellSpawnFailure(id, result.error, findDeadRefs);
        return;
      }
      showAndSelect(id, result.value.n);
    });
  }

  function visibleSessionIds(): readonly number[] {
    return visibleIds(app.state.view, app.state.focusedId, deps.tilesLive());
  }

  /** The `(id, kind, n)` triples that should have a mounted surface right now — a visible
   * session that still exists and is attachable, at whichever surface it has selected. */
  function desiredSurfaceEntries(
    sessions: readonly Session[],
  ): Array<{ id: number; kind: SurfaceKind; n: number | null }> {
    const entries: Array<{ id: number; kind: SurfaceKind; n: number | null }> = [];
    for (const id of visibleSessionIds()) {
      const session = sessions.find((s) => s.id === id);
      if (!session) continue;
      const state = getSurfaceState(surfaceSwitchState, id);
      if (isSurfaceAttachable(surfaceSwitchState, id, session.alive)) {
        entries.push({
          id,
          kind: state.selected,
          n: state.selected === "shell" ? state.shell : null,
        });
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

  /** Constructs a `TerminalSurface` for every wanted `(id, kind, n)` that has none yet — the
   * only place in the app one is ever constructed, and so the one place its drop wiring
   * (`terminal/dropwire.ts`) is installed — never inside `TerminalSurface`'s own
   * constructor, the same "attaches from outside" shape `render/dragreorder.ts`'s and
   * `render/dropguard.ts`'s owners already follow. */
  function openMissingSurfaces(
    entries: ReadonlyArray<{ id: number; kind: SurfaceKind; n: number | null }>,
    sessions: readonly Session[],
  ): void {
    for (const entry of entries) {
      const key = surfaceKey(entry.id, entry.kind, entry.n);
      if (surfaces.has(key)) continue;
      const session = sessions.find((s) => s.id === entry.id);
      if (!session) continue;
      const surface = new TerminalSurface(session, entry.kind, entry.n);
      installTerminalDrop(surface.root, entry.id, surface);
      surfaces.set(key, surface);
    }
  }

  // Render phase 7 (main.ts's numbered render phase order): open/close diff over
  // `(id, kind, n)` keys against the current view's visible ids.
  app.onRender((frame: RenderFrame) => {
    const { sessions } = frame;
    const desiredEntries = desiredSurfaceEntries(sessions);
    const desiredKeys = new Set(
      desiredEntries.map((entry) => surfaceKey(entry.id, entry.kind, entry.n)),
    );
    closeSurfacesNotIn(desiredKeys);
    openMissingSurfaces(desiredEntries, sessions);
  });

  // The one theme-change signal features/theme.ts emits — re-themes every live terminal
  // in place.
  app.on("themeChanged", () => {
    for (const surface of surfaces.values()) surface.applyTheme();
  });

  app.on("surfaceSwitched", (id, kind) => {
    const surface = kind === "docs" ? undefined : surfaceFor(id, kind);
    if (surface && focusIsOnSwitchOrPage(document.activeElement)) surface.focus();
  });

  app.on("sessionRemoved", (id) => {
    for (const [key, surface] of surfaces) {
      if (parseSurfaceKey(key).id !== id) continue;
      surface.dispose();
      surfaces.delete(key);
    }
    surfaceSwitchState = forgetSession(surfaceSwitchState, id);
    terminalsState = forgetTerminals(terminalsState, id);
    activityState = shellGone(activityState, id);
    selectRequestId.delete(id);
  });

  app.on("terminals", (sessionId, terminals) => {
    if (!app.store.values().some((session) => session.id === sessionId)) return;
    applyTerminalList(sessionId, terminals);
  });

  function adoptSnapshotTerminals(snapshot: Snapshot): void {
    const known = new Set([...terminalsState.keys(), ...surfaceSwitchState.keys()]);
    terminalsState = terminalsFromSnapshot(snapshot.terminals ?? {});
    for (const id of terminalsState.keys()) known.add(id);
    for (const id of known) {
      surfaceSwitchState = terminalsChanged(
        surfaceSwitchState,
        id,
        getTerminals(terminalsState, id),
      );
    }
  }

  function reattachMountedSurfaces(): void {
    const sessions = app.store.values();
    for (const [key, surface] of surfaces) {
      const { id, kind } = parseSurfaceKey(key);
      const session = sessions.find((s) => s.id === id);
      const attachable =
        kind === "shell"
          ? getSurfaceState(surfaceSwitchState, id).shell !== null
          : (session?.alive ?? false);
      surface.reattachIfDisconnected(attachable);
    }
  }

  function restoreActivityFromTerminals(): void {
    const busyNow = new Set<number>();
    for (const [id, list] of terminalsState) if (anyBusy(list)) busyNow.add(id);
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
  }

  /** After the daemon connection is restored, every currently-mounted surface gets a
   * chance to reattach — a no-op unless it's showing the "disconnected" overlay for a
   * still-attachable target. A shell surface's "attachable" is a terminal being shown,
   * never `session.alive`.
   *
   * Also re-syncs from `snapshot.terminals`: every list is replaced whole, a shown terminal
   * that left falls back as for a live message, every session whose list has a busy terminal
   * is busy right now, immediately, no onset delay; every id this module still shows "busy"
   * for but the snapshot omits gets `restoreIdle`'s treatment, never `observeIdle`'s (that
   * one is for a *live* message only) — see `restoreIdle`'s own doc comment
   * for why a snapshot gap always schedules the self-clear regardless of the current
   * surface selection, which is what lets this same branch satisfy both a WS-blip
   * reconnect and a daemon restart mid-command
   * (kb:adr/surfaces-snapshot-restored-tick-always-self-clears). */
  app.on("snapshot", (snapshot) => {
    adoptSnapshotTerminals(snapshot);
    reattachMountedSurfaces();
    restoreActivityFromTerminals();
  });

  return {
    state() {
      return surfaceSwitchState;
    },
    get: surfaceFor,
    select,
    focusSelected(id) {
      const kind = getSurfaceState(surfaceSwitchState, id).selected;
      if (kind !== "docs") surfaceFor(id, kind)?.focus();
    },
    activityFor(id) {
      return getShellActivity(activityState, id);
    },
    terminalsViewFor(id) {
      const list = getTerminals(terminalsState, id);
      const shown = shownTerminalOf(id);
      return {
        count: list.length,
        shownName: list.find((terminal) => terminal.n === shown)?.name ?? null,
      };
    },
    terminals: (id) => getTerminals(terminalsState, id),
    shownTerminal: shownTerminalOf,
    showTerminal: showAndSelect,
    newTerminal,
    renameTerminal(id, n, name) {
      void renameTerminal(id, n, name);
    },
    closeTerminal(id, n) {
      void closeTerminal(id, n);
    },
  };
}
