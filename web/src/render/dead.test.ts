// render/dead.ts is DOM-only now (renderDeadSurface, collectDeadSurfaceRefs,
// buildDeadSurfaceFromTemplate construct/query real DOM and have no jsdom configured —
// docs/conventions.md defers DOM construction to Playwright; see web/e2e/actions.spec.ts
// for REQ-13's dead-surface coverage). `loadPane`, the one export with no DOM involved,
// moved to `features/actions.ts` — its tests live in `../features/actions.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol/session";
import {
  renderDeadSurface,
  showDeadSurfaceNotice,
  type DeadSurfaceRefs,
  type PaneState,
} from "./dead";

/** Shared across every describe block below (renderDeadSurface, showDeadSurfaceNotice,
 * the Resume-disabled-reason block) — a plain-fake `DeadSurfaceRefs`, matching this file's
 * no-jsdom convention. `overrides` lets a block swap in a richer fake for the one field it
 * actually exercises (e.g. a `resumeBtn` with `setAttribute`/`getAttribute`, or a real
 * `noticeEl`) without rebuilding the other four fields. */
function fakeDeadSurfaceRefs(overrides: Partial<DeadSurfaceRefs> = {}): DeadSurfaceRefs {
  return {
    root: {} as HTMLElement,
    endbarEl: { textContent: "" } as unknown as HTMLElement,
    snapshotEl: { textContent: "" } as unknown as HTMLElement,
    capBodyEl: { textContent: "" } as unknown as HTMLElement,
    resumeBtn: { dataset: {}, disabled: false } as unknown as HTMLButtonElement,
    noticeEl: { hidden: true, textContent: "" } as unknown as HTMLElement,
    ...overrides,
  };
}

// review m4-reconcile cycle-3 Minor 5: REQ-19's "· captured <age>" clause (nice-to-have,
// design-system §6.8: possibly-stale state shows its age) had no test on either side —
// `renderDeadSurface` is pure enough (it only assigns `.textContent`/`.dataset`/
// `.disabled` on already-built refs, no querySelector/cloneNode involved) to test
// directly against plain stub refs, matching this file's existing no-jsdom convention.
describe("renderDeadSurface — REQ-19's '· captured <age>' clause", () => {
  const NOW = new Date("2026-08-27T00:10:00Z");

  const fakeRefs = fakeDeadSurfaceRefs;

  function makeSession(overrides: Partial<Session> & { id: number }): Session {
    return {
      title: "some-session",
      titleOverride: null,
      plan: null,
      state: "idle",
      stateSince: "2026-08-27T00:00:00Z",
      alive: false,
      endedAt: "2026-08-27T00:00:00Z",
      attention: null,
      failure: null,
      directory: "/Users/bob/code/muster",
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
      unread: false,
      lastPrompt: null,
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
    return fakeDeadSurfaceRefs({ noticeEl });
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
});

// REQ-17/W3 (plan session-lifecycle): a session that never bound a Claude session id is
// refused Resume forever (409 not_resumable) — the dead surface's own Resume button (the
// one on a live tile/Focus's `#dead-surface`, mainhead.test.ts covers the mainhead's own
// button) must say why. Own fixtures, matching this file's per-describe-block convention
// (see showDeadSurfaceNotice above).
describe("renderDeadSurface — Resume disabled reason (REQ-17/W3)", () => {
  const NOW = new Date("2026-08-27T00:10:00Z");

  function fakeRefs(): DeadSurfaceRefs {
    const attrs: Record<string, string> = {};
    return fakeDeadSurfaceRefs({
      resumeBtn: {
        dataset: {},
        disabled: false,
        title: "",
        setAttribute(name: string, value: string) {
          attrs[name] = value;
        },
        getAttribute(name: string) {
          return attrs[name] ?? null;
        },
      } as unknown as HTMLButtonElement,
    });
  }

  // See mainhead.test.ts's identical helper for why both mechanisms are accepted.
  function resumeDisabledReason(btn: HTMLButtonElement): string {
    return (
      (btn as unknown as { title?: string }).title ||
      btn.getAttribute("aria-description") ||
      btn.getAttribute("title") ||
      ""
    );
  }

  function makeSession(overrides: Partial<Session> & { id: number }): Session {
    return {
      title: "some-session",
      titleOverride: null,
      plan: null,
      state: "idle",
      stateSince: "2026-08-27T00:00:00Z",
      alive: false,
      endedAt: "2026-08-27T00:00:00Z",
      attention: null,
      failure: null,
      directory: "/Users/bob/code/muster",
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
      unread: false,
      lastPrompt: null,
      ...overrides,
    };
  }

  it("disables Resume with a non-empty reason when the session never bound a Claude session id", () => {
    const refs = fakeRefs();
    const session = makeSession({ id: 1, claudeSessionId: null });

    renderDeadSurface(refs, session, { status: "missing" }, NOW, true);

    expect(refs.resumeBtn.disabled).toBe(true);
    expect(resumeDisabledReason(refs.resumeBtn)).not.toBe("");
  });

  it("enables Resume with no disabling reason once a Claude session id is bound", () => {
    const refs = fakeRefs();
    const session = makeSession({ id: 1, claudeSessionId: "claude-sess" });

    renderDeadSurface(refs, session, { status: "missing" }, NOW, true);

    expect(refs.resumeBtn.disabled).toBe(false);
    expect(resumeDisabledReason(refs.resumeBtn)).toBe("");
  });
});
