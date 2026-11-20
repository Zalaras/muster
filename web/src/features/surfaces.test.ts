// `select`'s shell-spawn round trip only (review.maintainability.e-webui.md Minor 8):
// a stale `createShell` response landing after a newer selection for the same session
// must never override that newer selection. `createApp()` (app.ts's own doc comment:
// "pure enough to unit-test, no DOM") stands in for the real App — `select`'s shell
// branch only calls `app.render()`, and with `state.focusedId` left at its default
// `null` the registered render phase's `visibleSessionIds()` returns `[]`, so the render
// phase never reaches `openMissingSurfaces` (which would construct a real
// `TerminalSurface` and need a DOM this file's no-jsdom Vitest config doesn't have — same
// reasoning as render/dead.test.ts's header comment). Mocking ../api/sessions keeps this a
// pure logic test, same shape as render/dead.test.ts's `fetchPane` mock.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../api/http";
import { createApp } from "../app";
import { getSurfaceState } from "../terminal/surfaceswitch";
import { initSurfaces } from "./surfaces";

vi.mock("../api/sessions", () => ({
  createShell: vi.fn(),
  createTerminal: vi.fn(),
  renameTerminal: vi.fn(),
  closeTerminal: vi.fn(),
}));

vi.mock("../render/dead", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../render/dead")>()),
  showDeadSurfaceNotice: vi.fn(),
}));

import { showDeadSurfaceNotice } from "../render/dead";
import {
  closeTerminal,
  createShell,
  createTerminal,
  renameTerminal,
  type CreateShellResult,
  type NewTerminalResult,
} from "../api/sessions";
import { makeSnapshot } from "../protocol/testfixtures";
import { makeSession } from "../sessions/testfixtures";

const createShellMock = vi.mocked(createShell);
const createTerminalMock = vi.mocked(createTerminal);
const renameTerminalMock = vi.mocked(renameTerminal);
const closeTerminalMock = vi.mocked(closeTerminal);

const noDeadRefs = () => null;

/** A `createShell` call this test controls the resolution of, distinct per session id so
 * two ids' in-flight calls can be resolved independently and out of order. */
function deferred<T = ApiResult<CreateShellResult>>(): {
  promise: Promise<T>;
  resolve: (result: T) => void;
} {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function okResult(target = "muster-shell:1", n = 1): ApiResult<CreateShellResult> {
  return { ok: true, value: { target, n, created: true } };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("initSurfaces select() — stale shell-spawn response guard (Minor 8)", () => {
  it("does not override a newer selection for the same session once the stale spawn resolves", async () => {
    const app = createApp();
    const handle = initSurfaces(app, { tilesLive: () => [] });
    const spawn = deferred();
    createShellMock.mockReturnValueOnce(spawn.promise);

    handle.select(1, "shell", noDeadRefs);
    expect(createShellMock).toHaveBeenCalledTimes(1);

    // A newer selection lands before the shell-spawn response does — pure/sync, no
    // round trip (surfaces.ts's `docs`/`claude` branch).
    handle.select(1, "docs", noDeadRefs);
    expect(getSurfaceState(handle.state(), 1).selected).toBe("docs");

    spawn.resolve(okResult());
    await spawn.promise;
    await Promise.resolve(); // flush the `.then` microtask surfaces.ts's guard runs in

    // On the pre-fix code this fails: the stale spawn's `.then` unconditionally sets
    // `selected` back to "shell".
    expect(getSurfaceState(handle.state(), 1).selected).toBe("docs");
  });

  it("keeps each session's spawn guard independent — resolving one id's stale spawn never touches another id's pending one", async () => {
    const app = createApp();
    const handle = initSurfaces(app, { tilesLive: () => [] });
    const spawnA = deferred();
    const spawnB = deferred();
    createShellMock.mockReturnValueOnce(spawnA.promise).mockReturnValueOnce(spawnB.promise);

    handle.select(1, "shell", noDeadRefs);
    handle.select(2, "shell", noDeadRefs);
    expect(createShellMock).toHaveBeenCalledTimes(2);

    // Bumps session 1's own request counter only — a single shared counter (rather than
    // one per session id) would wrongly invalidate session 2's still-current spawn too.
    handle.select(1, "docs", noDeadRefs);

    spawnB.resolve(okResult("muster-shell:2", 1));
    await spawnB.promise;
    await Promise.resolve();

    expect(getSurfaceState(handle.state(), 2).selected).toBe("shell");
    expect(getSurfaceState(handle.state(), 2).shell).toBe(1);
    // Session 1's own (now stale) spawn hasn't resolved yet; its selection is still what
    // the sync `docs` call set.
    expect(getSurfaceState(handle.state(), 1).selected).toBe("docs");

    spawnA.resolve(okResult("muster-shell:1"));
    await spawnA.promise;
    await Promise.resolve();

    // Session 1's spawn was stale by the time it resolved (superseded by the `docs`
    // call above) — it must not flip `selected` back to "shell" either.
    expect(getSurfaceState(handle.state(), 1).selected).toBe("docs");
  });
});

const term = (n: number, name = `shell ${n}`, busy = false) => ({
  n,
  name,
  busy,
});

/** An app that knows sessions 1 and 2, with surfaces initialised on it. */
function knownApp() {
  const app = createApp();
  app.store.replaceAll([makeSession({ id: 1 }), makeSession({ id: 2 })]);
  const handle = initSurfaces(app, { tilesLive: () => [] });
  return { app, handle };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("initSurfaces select('shell') — always asks the daemon (E3, REQ-1)", () => {
  it("shows the terminal the response names when none was shown before", async () => {
    const { handle } = knownApp();
    createShellMock.mockResolvedValueOnce(okResult("t", 3));
    handle.select(1, "shell", noDeadRefs);
    await flush();
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 3,
    });
  });

  it("returns to the last-shown terminal when the daemon list still holds it", async () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2)]);
    handle.showTerminal(1, 2);
    handle.select(1, "claude", noDeadRefs);
    createShellMock.mockResolvedValueOnce(okResult("t", 1));
    handle.select(1, "shell", noDeadRefs);
    expect(createShellMock).toHaveBeenCalledTimes(1);
    await flush();
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 2,
    });
  });

  it("shows the response's terminal when the last-shown one left the list before the message arrived", async () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2)]);
    handle.showTerminal(1, 2);
    handle.select(1, "claude", noDeadRefs);
    app.emit("terminals", 1, [term(1)]);
    createShellMock.mockResolvedValueOnce(okResult("t", 1));
    handle.select(1, "shell", noDeadRefs);
    await flush();
    expect(getSurfaceState(handle.state(), 1).shell).toBe(1);
  });

  it("a failed spawn leaves the selection where it was", async () => {
    const { handle } = knownApp();
    createShellMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "shell_spawn_failed", message: "tmux: boom" },
    });
    handle.select(1, "shell", noDeadRefs);
    await flush();
    expect(getSurfaceState(handle.state(), 1).selected).toBe("claude");
  });
});

describe("initSurfaces — the terminals list is the one source (W2, REQ-6, INV-5)", () => {
  it("a terminals message sets the session's list and view count and shown name", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2, "build", true)]);
    expect(handle.terminals(1)).toEqual([term(1), term(2, "build", true)]);
    handle.showTerminal(1, 2);
    expect(handle.terminalsViewFor(1)).toEqual({
      count: 2,
      shownName: "build",
    });
  });

  it("shownName is null while another surface is selected", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2, "build")]);
    handle.showTerminal(1, 2);
    handle.select(1, "claude", noDeadRefs);
    expect(handle.terminalsViewFor(1).shownName).toBeNull();
    expect(handle.terminalsViewFor(1).count).toBe(2);
  });

  it("a terminals message for an unknown session is ignored", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 99, [term(1)]);
    expect(handle.terminals(99)).toEqual([]);
    expect(handle.state().has(99)).toBe(false);
  });

  it("the shown terminal ending moves the window to the lowest remaining one, staying on shell", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2), term(3)]);
    handle.showTerminal(1, 2);
    app.emit("terminals", 1, [term(1), term(3)]);
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 1,
    });
  });

  it("the last terminal ending reverts shell to claude and the view reads no count", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1)]);
    handle.showTerminal(1, 1);
    app.emit("terminals", 1, []);
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "claude",
      shell: null,
    });
    expect(handle.terminalsViewFor(1)).toEqual({ count: 0, shownName: null });
  });

  it("a terminals message for one session never touches another's list or shown terminal", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1)]);
    app.emit("terminals", 2, [term(1), term(2)]);
    handle.showTerminal(2, 2);
    app.emit("terminals", 1, []);
    expect(handle.terminals(2)).toEqual([term(1), term(2)]);
    expect(getSurfaceState(handle.state(), 2)).toEqual({
      selected: "shell",
      shell: 2,
    });
  });

  it("snapshot.terminals replaces every list whole and drops the ones it omits", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1)]);
    app.emit("terminals", 2, [term(1), term(2)]);
    app.emit("snapshot", makeSnapshot({ terminals: { 2: [term(2, "build")] } }));
    expect(handle.terminals(1)).toEqual([]);
    expect(handle.terminals(2)).toEqual([term(2, "build")]);
  });

  it("a snapshot without terminals (older fixture) empties every list and reverts a shown shell", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1)]);
    handle.showTerminal(1, 1);
    app.emit("snapshot", makeSnapshot());
    expect(handle.terminals(1)).toEqual([]);
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "claude",
      shell: null,
    });
  });

  it("a snapshot that lost the shown terminal falls back to the lowest remaining", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1), term(2)]);
    handle.showTerminal(1, 2);
    app.emit("snapshot", makeSnapshot({ terminals: { 1: [term(1), term(3)] } }));
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 1,
    });
  });

  it("sessionRemoved forgets the session's list and surface state", () => {
    const { app, handle } = knownApp();
    app.emit("terminals", 1, [term(1)]);
    handle.showTerminal(1, 1);
    app.emit("sessionRemoved", 1);
    expect(handle.terminals(1)).toEqual([]);
    expect(handle.state().has(1)).toBe(false);
  });
});

describe("initSurfaces — activity follows any-terminal-busy (REQ-13)", () => {
  it("a snapshot whose list has a busy terminal restores busy immediately, no onset delay", () => {
    const { app, handle } = knownApp();
    app.emit("snapshot", makeSnapshot({ terminals: { 1: [term(1, "shell 1", true)] } }));
    expect(handle.activityFor(1)).toBe("busy");
  });

  it("a live busy flip on one of two terminals shows busy after the onset delay", () => {
    vi.useFakeTimers();
    try {
      const { app, handle } = knownApp();
      app.emit("terminals", 1, [term(1), term(2, "build", true)]);
      vi.advanceTimersByTime(60000);
      expect(handle.activityFor(1)).toBe("busy");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the list emptying clears the activity at once", () => {
    const { app, handle } = knownApp();
    app.emit("snapshot", makeSnapshot({ terminals: { 1: [term(1, "shell 1", true)] } }));
    expect(handle.activityFor(1)).toBe("busy");
    app.emit("terminals", 1, []);
    expect(handle.activityFor(1)).toBe("none");
  });
});

describe("initSurfaces — terminal actions (REQ-1..5)", () => {
  it("newTerminal shows the spawned terminal and selects shell", async () => {
    const { handle } = knownApp();
    createTerminalMock.mockResolvedValueOnce({
      ok: true,
      value: { target: "t", n: 4, name: "shell 4" },
    });
    handle.newTerminal(1, noDeadRefs);
    await flush();
    expect(getSurfaceState(handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 4,
    });
  });

  it("a stale newTerminal response does not override a later selection", async () => {
    const { handle } = knownApp();
    const spawn = deferred<ApiResult<NewTerminalResult>>();
    createTerminalMock.mockReturnValueOnce(spawn.promise);
    handle.newTerminal(1, noDeadRefs);
    handle.select(1, "docs", noDeadRefs);
    spawn.resolve({ ok: true, value: { target: "t", n: 2, name: "shell 2" } });
    await flush();
    expect(getSurfaceState(handle.state(), 1).selected).toBe("docs");
  });

  it("rename and close forward the session id, number and name to the API", () => {
    const { handle } = knownApp();
    renameTerminalMock.mockResolvedValue({ ok: true, value: null });
    closeTerminalMock.mockResolvedValue({ ok: true, value: null });
    handle.renameTerminal(1, 2, "build");
    handle.closeTerminal(1, 2);
    expect(renameTerminalMock).toHaveBeenCalledWith(1, 2, "build");
    expect(closeTerminalMock).toHaveBeenCalledWith(1, 2);
  });

  it.each([
    ["rename", (h: ReturnType<typeof knownApp>["handle"]) => h.renameTerminal(1, 2, "x")],
    ["close", (h: ReturnType<typeof knownApp>["handle"]) => h.closeTerminal(1, 2)],
  ])("a 404 no_shell from %s is swallowed: no notice, nothing thrown", async (_name, act) => {
    const { handle } = knownApp();
    const stale: ApiResult<null> = { ok: false, error: { code: "no_shell", message: "gone" } };
    renameTerminalMock.mockResolvedValue(stale);
    closeTerminalMock.mockResolvedValue(stale);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    expect(() => act(handle)).not.toThrow();
    await flush();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(vi.mocked(showDeadSurfaceNotice)).not.toHaveBeenCalled();
  });
});
