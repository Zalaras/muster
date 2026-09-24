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
}));

import { createShell, type CreateShellResult } from "../api/sessions";

const createShellMock = vi.mocked(createShell);

const noDeadRefs = () => null;

/** A `createShell` call this test controls the resolution of, distinct per session id so
 * two ids' in-flight calls can be resolved independently and out of order. */
function deferred(): {
  promise: Promise<ApiResult<CreateShellResult>>;
  resolve: (result: ApiResult<CreateShellResult>) => void;
} {
  let resolve!: (result: ApiResult<CreateShellResult>) => void;
  const promise = new Promise<ApiResult<CreateShellResult>>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function okResult(target = "muster-shell:1"): ApiResult<CreateShellResult> {
  return { ok: true, value: { target, created: true } };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("initSurfaces select() — stale shell-spawn response guard (Minor 8)", () => {
  it("does not override a newer selection for the same session once the stale spawn resolves", async () => {
    const app = createApp();
    const handle = initSurfaces(app, { getTilesLive: () => [] });
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
    const handle = initSurfaces(app, { getTilesLive: () => [] });
    const spawnA = deferred();
    const spawnB = deferred();
    createShellMock.mockReturnValueOnce(spawnA.promise).mockReturnValueOnce(spawnB.promise);

    handle.select(1, "shell", noDeadRefs);
    handle.select(2, "shell", noDeadRefs);
    expect(createShellMock).toHaveBeenCalledTimes(2);

    // Bumps session 1's own request counter only — a single shared counter (rather than
    // one per session id) would wrongly invalidate session 2's still-current spawn too.
    handle.select(1, "docs", noDeadRefs);

    spawnB.resolve(okResult("muster-shell:2"));
    await spawnB.promise;
    await Promise.resolve();

    expect(getSurfaceState(handle.state(), 2).selected).toBe("shell");
    expect(getSurfaceState(handle.state(), 2).shellRunning).toBe(true);
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
