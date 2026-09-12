// loadPane is the one export in render/dead.ts with no DOM involved at all (it's a bare
// fetch-result mapper) — everything else here (renderDeadSurface, collectDeadSurfaceRefs,
// buildDeadSurfaceFromTemplate) constructs/queries real DOM and has no jsdom configured
// (docs/conventions.md defers DOM construction to Playwright; see web/e2e/actions.spec.ts
// for REQ-13's dead-surface coverage). Mocking ../api keeps this a pure logic test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, PaneSnapshot } from "../api";
import type { Session } from "../protocol";
import {
  loadPane,
  renderDeadSurface,
  showDeadSurfaceNotice,
  type DeadSurfaceRefs,
  type PaneState,
} from "./dead";

vi.mock("../api", () => ({
  fetchPane: vi.fn(),
}));

import { fetchPane } from "../api";

const fetchPaneMock = vi.mocked(fetchPane);

afterEach(() => {
  vi.resetAllMocks();
});

describe("loadPane (REQ-13, plan m4-reconcile): wraps GET /api/sessions/{id}/pane into the three-state PaneState", () => {
  it("maps a successful fetch to status 'ok' carrying the text and capturedAt", async () => {
    const pane: PaneSnapshot = { text: "$ claude\nWorking...", capturedAt: "2026-08-22T00:05:00Z" };
    fetchPaneMock.mockResolvedValue({ ok: true, value: pane } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "ok", text: pane.text, capturedAt: pane.capturedAt });
  });

  it("maps a 404 no_snapshot error to status 'missing' — the 'unknown, not empty' honesty case (edge case 13)", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "no_snapshot", message: "no capture yet" },
    } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "missing" });
  });

  it("maps any other error (e.g. unknown_session, a network-level fallback) to 'missing' too — never distinguishes error causes", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "unknown_session", message: "no such session" },
    } as ApiResult<PaneSnapshot>);
    const result = await loadPane(999);
    expect(result).toEqual({ status: "missing" });
  });

  it("preserves an empty-string snapshot text as 'ok', not 'missing' (an empty pane is still a captured pane)", async () => {
    const pane: PaneSnapshot = { text: "", capturedAt: "2026-08-22T00:05:00Z" };
    fetchPaneMock.mockResolvedValue({ ok: true, value: pane } as ApiResult<PaneSnapshot>);
    const result = await loadPane(1);
    expect(result).toEqual({ status: "ok", text: "", capturedAt: pane.capturedAt });
  });

  it("calls fetchPane with the given session id", async () => {
    fetchPaneMock.mockResolvedValue({
      ok: false,
      error: { code: "no_snapshot", message: "no capture yet" },
    } as ApiResult<PaneSnapshot>);
    await loadPane(42);
    expect(fetchPaneMock).toHaveBeenCalledWith(42);
  });
});

// review m4-reconcile cycle-3 Minor 5: REQ-19's "· captured <age>" clause (nice-to-have,
// design-system §6.8: possibly-stale state shows its age) had no test on either side —
// `renderDeadSurface` is pure enough (it only assigns `.textContent`/`.dataset`/
// `.disabled` on already-built refs, no querySelector/cloneNode involved) to test
// directly against plain stub refs, matching this file's existing no-jsdom convention.
describe("renderDeadSurface — REQ-19's '· captured <age>' clause", () => {
  const NOW = new Date("2026-08-27T00:10:00Z");

  function fakeRefs(): DeadSurfaceRefs {
    return {
      root: {} as HTMLElement,
      endbarEl: { textContent: "" } as unknown as HTMLElement,
      snapshotEl: { textContent: "" } as unknown as HTMLElement,
      capBodyEl: { textContent: "" } as unknown as HTMLElement,
      resumeBtn: { dataset: {}, disabled: false } as unknown as HTMLButtonElement,
    };
  }

  function makeSession(overrides: Partial<Session> & { id: number }): Session {
    return {
      title: "some-session",
      titleOverride: null,
      state: "idle",
      stateSince: "2026-08-27T00:00:00Z",
      alive: false,
      endedAt: "2026-08-27T00:00:00Z",
      attention: null,
      failure: null,
      directory: "/Users/damian/code/muster",
      repo: null,
      model: null,
      permissionMode: { value: "default", source: "seed" },
      context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
      lastActivity: null,
      claudeSessionId: "claude-sess",
      tmuxTarget: "muster:@1",
      firstLaunchHere: false,
      createdAt: "2026-08-26T23:00:00Z",
      pinned: false,
      railPos: overrides.id,
      ...overrides,
    };
  }

  function okPane(capturedAt: string, text = "$ claude\nWorking..."): PaneState {
    return { status: "ok", text, capturedAt };
  }

  it("appends ' · captured <age>' after the base endbar text when the pane fetch succeeded", () => {
    const refs = fakeRefs();
    const session = makeSession({ id: 1, state: "idle", endedAt: "2026-08-27T00:05:00Z" });
    renderDeadSurface(refs, session, okPane("2026-08-27T00:04:00Z"), NOW, true);

    expect(refs.endbarEl.textContent).toBe(
      "ended 5m ago · last state idle · last captured screen, not a live client · captured 6m ago",
    );
  });

  it("never renders 'captured now ago' — sub-minute capture age reads 'captured now' (mirrors the endbar age's own honesty rule)", () => {
    const refs = fakeRefs();
    const session = makeSession({ id: 1, endedAt: "2026-08-27T00:09:55Z" });
    // capturedAt 10s before now — elapsed 10s, well under the 60s "now" bucket.
    renderDeadSurface(refs, session, okPane("2026-08-27T00:09:50Z"), NOW, true);

    expect(refs.endbarEl.textContent).toMatch(/· captured now$/);
    expect(refs.endbarEl.textContent).not.toContain("captured now ago");
  });

  it("crosses the now/1m-ago boundary at exactly 60 elapsed seconds", () => {
    const justUnder = fakeRefs();
    renderDeadSurface(justUnder, makeSession({ id: 1 }), okPane("2026-08-27T00:09:01Z"), NOW, true); // 59s elapsed
    expect(justUnder.endbarEl.textContent).toMatch(/· captured now$/);

    const atBoundary = fakeRefs();
    renderDeadSurface(
      atBoundary,
      makeSession({ id: 1 }),
      okPane("2026-08-27T00:09:00Z"),
      NOW,
      true,
    ); // 60s elapsed
    expect(atBoundary.endbarEl.textContent).toMatch(/· captured 1m ago$/);
  });

  it("renders an hour bucket once the capture is over an hour old", () => {
    const refs = fakeRefs();
    // 3661s elapsed (1h 1m 1s) — falls in the "<86400" hour bucket.
    renderDeadSurface(refs, makeSession({ id: 1 }), okPane("2026-08-26T23:08:59Z"), NOW, true);
    expect(refs.endbarEl.textContent).toMatch(/· captured 1h ago$/);
  });

  it("does not append a captured clause when the pane is 'missing' (no snapshot captured) — the base copy's own 'last captured screen' wording is unaffected", () => {
    const refs = fakeRefs();
    renderDeadSurface(refs, makeSession({ id: 1 }), { status: "missing" }, NOW, true);

    expect(refs.endbarEl.textContent).toBe(
      "ended 10m ago · last state idle · last captured screen, not a live client",
    );
    expect(refs.capBodyEl.textContent).toBe("no snapshot captured");
  });

  it("does not append a captured clause while the pane fetch is still 'loading'", () => {
    const refs = fakeRefs();
    renderDeadSurface(refs, makeSession({ id: 1 }), { status: "loading" }, NOW, true);

    expect(refs.endbarEl.textContent).toBe(
      "ended 10m ago · last state idle · last captured screen, not a live client",
    );
    expect(refs.capBodyEl.textContent).toBe("loading last screen…");
  });

  it("still appends the captured clause when the session's own endedAt is null (defensive branch, no leading age)", () => {
    const refs = fakeRefs();
    const session = makeSession({ id: 1, endedAt: null });
    renderDeadSurface(refs, session, okPane("2026-08-27T00:09:00Z"), NOW, true);

    expect(refs.endbarEl.textContent).toBe(
      "ended · last state idle · last captured screen, not a live client · captured 1m ago",
    );
  });

  it("the captured age can differ from the endbar's own ended age — snapshot capture and End don't share a clock (design-system §6.8)", () => {
    const refs = fakeRefs();
    // Session ended 10 minutes ago; the last capture was taken 3 minutes before *that*.
    const session = makeSession({ id: 1, endedAt: "2026-08-27T00:00:00Z" });
    renderDeadSurface(refs, session, okPane("2026-08-26T23:57:00Z"), NOW, true);

    expect(refs.endbarEl.textContent).toBe(
      "ended 10m ago · last state idle · last captured screen, not a live client · captured 13m ago",
    );
  });
});

// review plain-terminal-session cycle-1 Major 1 (Fix Attempt 1): showDeadSurfaceNotice is,
// like renderDeadSurface above, pure enough to test against plain stub refs — it only
// assigns `.textContent`/`.hidden` and schedules/clears a setTimeout keyed on the notice
// element's own identity (module-level WeakMap in dead.ts). No querySelector/cloneNode
// involved, so this stays inside the file's existing no-jsdom convention.
describe("showDeadSurfaceNotice (review Major 1): the dead surface's own role=status notice, mirroring TerminalSurface.showNotice's contract exactly", () => {
  function fakeNoticeEl(): HTMLElement {
    return { hidden: true, textContent: "" } as unknown as HTMLElement;
  }

  function fakeRefsWithNotice(noticeEl: HTMLElement): DeadSurfaceRefs {
    return {
      root: {} as HTMLElement,
      endbarEl: { textContent: "" } as unknown as HTMLElement,
      snapshotEl: { textContent: "" } as unknown as HTMLElement,
      capBodyEl: { textContent: "" } as unknown as HTMLElement,
      resumeBtn: { dataset: {}, disabled: false } as unknown as HTMLButtonElement,
      noticeEl,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the given text and un-hides the notice", () => {
    const noticeEl = fakeNoticeEl();
    showDeadSurfaceNotice(fakeRefsWithNotice(noticeEl), "spawn failed: directory no longer exists");

    expect(noticeEl.hidden).toBe(false);
    expect(noticeEl.textContent).toBe("spawn failed: directory no longer exists");
  });

  it("auto-hides after 5s, same as TerminalSurface.showNotice's own timeout", () => {
    const noticeEl = fakeNoticeEl();
    showDeadSurfaceNotice(fakeRefsWithNotice(noticeEl), "spawn failed");

    vi.advanceTimersByTime(4999);
    expect(noticeEl.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(noticeEl.hidden).toBe(true);
    expect(noticeEl.textContent).toBe("");
  });

  it("passing null clears an already-shown notice immediately, without waiting for the timer", () => {
    const noticeEl = fakeNoticeEl();
    const refs = fakeRefsWithNotice(noticeEl);
    showDeadSurfaceNotice(refs, "spawn failed");
    showDeadSurfaceNotice(refs, null);

    expect(noticeEl.hidden).toBe(true);
    expect(noticeEl.textContent).toBe("");
  });

  it("a new outcome replaces whatever text was there and resets the auto-hide timer (the stale first timer must not fire)", () => {
    const noticeEl = fakeNoticeEl();
    const refs = fakeRefsWithNotice(noticeEl);
    showDeadSurfaceNotice(refs, "first failure");

    vi.advanceTimersByTime(4000); // first call's timer would fire 1000ms from here
    showDeadSurfaceNotice(refs, "second failure");

    vi.advanceTimersByTime(1000); // if the first timer weren't cleared, this would hide it
    expect(noticeEl.hidden).toBe(false);
    expect(noticeEl.textContent).toBe("second failure");

    vi.advanceTimersByTime(4000); // 5000ms after the SECOND call
    expect(noticeEl.hidden).toBe(true);
    expect(noticeEl.textContent).toBe("");
  });

  it("calling with null when nothing was ever shown is a safe no-op (no pending timer to clear)", () => {
    const noticeEl = fakeNoticeEl();
    showDeadSurfaceNotice(fakeRefsWithNotice(noticeEl), null);

    expect(noticeEl.hidden).toBe(true);
    expect(noticeEl.textContent).toBe("");
  });

  it("is a safe no-op when refs.noticeEl is undefined — dead.test.ts's own pre-existing fakeRefs() fixture (renderDeadSurface's describe block above) predates this field", () => {
    const refsWithoutNotice: DeadSurfaceRefs = {
      root: {} as HTMLElement,
      endbarEl: { textContent: "" } as unknown as HTMLElement,
      snapshotEl: { textContent: "" } as unknown as HTMLElement,
      capBodyEl: { textContent: "" } as unknown as HTMLElement,
      resumeBtn: { dataset: {}, disabled: false } as unknown as HTMLButtonElement,
    };

    expect(() => showDeadSurfaceNotice(refsWithoutNotice, "text")).not.toThrow();
    expect(() => showDeadSurfaceNotice(refsWithoutNotice, null)).not.toThrow();
  });
});
