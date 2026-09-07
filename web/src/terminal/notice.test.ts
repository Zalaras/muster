import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showNotice, type NoticeTarget } from "./notice";

// Plan v1-cleanup REQ-12/REQ-13: the shared show/clear/auto-hide notice logic extracted
// from terminal/pane.ts's TerminalSurface.showNotice and render/dead.ts's
// showDeadSurfaceNotice (the "mirrors ... exactly" duplication the plain-terminal-session
// review recorded). render/dead.test.ts already covers the delegation through
// showDeadSurfaceNotice's plain-object fakes; this file tests the extracted module
// directly, including the "inflight" kind render/dead.ts's caller never exercises.

function fakeTarget(): NoticeTarget {
  return { hidden: true, textContent: "" };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("showNotice — default 'outcome' kind (REQ-13: every notice's prior behaviour)", () => {
  it("un-hides the target and sets its text", () => {
    const target = fakeTarget();
    showNotice(target, "pasted /Users/damian/file.png");

    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("pasted /Users/damian/file.png");
  });

  it("auto-hides after exactly 5s", () => {
    const target = fakeTarget();
    showNotice(target, "not_located");

    vi.advanceTimersByTime(4999);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("not_located");

    vi.advanceTimersByTime(1);
    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");
  });

  it("passing null clears an already-shown notice immediately, without waiting for the timer", () => {
    const target = fakeTarget();
    showNotice(target, "ambiguous");
    showNotice(target, null);

    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");
  });

  it("calling with null when nothing was ever shown is a safe no-op (no pending timer to clear)", () => {
    const target = fakeTarget();
    showNotice(target, null);

    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");
  });

  it("edge case 6: a second outcome replaces a first and resets the auto-hide timer — the stale first timer must not fire against the new text", () => {
    const target = fakeTarget();
    showNotice(target, "first outcome");

    vi.advanceTimersByTime(4000); // first call's timer would fire 1000ms from here
    showNotice(target, "second outcome");

    vi.advanceTimersByTime(1000); // if the first timer weren't cleared, this would hide it early
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("second outcome");

    vi.advanceTimersByTime(4000); // 5000ms after the SECOND call
    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");
  });
});

describe("showNotice — 'inflight' kind (REQ-13: stays visible until replaced, no timer armed)", () => {
  it("shows the text and un-hides the target, same as an outcome", () => {
    const target = fakeTarget();
    showNotice(target, "Locating file.png…", "inflight");

    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("Locating file.png…");
  });

  it("never auto-hides, no matter how much time passes", () => {
    const target = fakeTarget();
    showNotice(target, "Locating file.png…", "inflight");

    vi.advanceTimersByTime(5000);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("Locating file.png…");

    vi.advanceTimersByTime(60_000);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("Locating file.png…");
  });

  it("edge case 6: an outcome arriving after an inflight notice replaces it and DOES auto-hide after 5s from the outcome call", () => {
    const target = fakeTarget();
    showNotice(target, "Locating file.png…", "inflight");

    vi.advanceTimersByTime(30_000); // inflight text sits on screen indefinitely
    showNotice(target, "pasted file.png"); // default "outcome" kind

    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("pasted file.png");

    vi.advanceTimersByTime(4999);
    expect(target.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");
  });

  it("edge case 7: showNotice(null) while an inflight notice is showing clears it and leaves no timer armed for later content", () => {
    const target = fakeTarget();
    showNotice(target, "Locating file.png…", "inflight");
    showNotice(target, null);

    expect(target.hidden).toBe(true);
    expect(target.textContent).toBe("");

    // No timer should be armed from the inflight call (there never was one) nor from the
    // clear itself — advancing time must not touch a later, unrelated notice.
    vi.advanceTimersByTime(10_000);
    showNotice(target, "unrelated later outcome", "inflight");
    vi.advanceTimersByTime(10_000);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("unrelated later outcome");
  });

  it("a second inflight call replaces the first's text and still arms no timer", () => {
    const target = fakeTarget();
    showNotice(target, "Locating a.png…", "inflight");
    showNotice(target, "Locating b.png…", "inflight");

    expect(target.textContent).toBe("Locating b.png…");
    vi.advanceTimersByTime(60_000);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe("Locating b.png…");
  });
});

describe("showNotice — edge case 8: independent timers per target (WeakMap keying)", () => {
  it("two targets' auto-hide timers do not interfere with each other", () => {
    const targetA = fakeTarget();
    const targetB = fakeTarget();

    showNotice(targetA, "notice A");
    vi.advanceTimersByTime(2000);
    showNotice(targetB, "notice B"); // B's timer starts 2s after A's

    vi.advanceTimersByTime(3000); // 5s since A, 3s since B
    expect(targetA.hidden).toBe(true);
    expect(targetA.textContent).toBe("");
    expect(targetB.hidden).toBe(false);
    expect(targetB.textContent).toBe("notice B");

    vi.advanceTimersByTime(2000); // 5s since B
    expect(targetB.hidden).toBe(true);
    expect(targetB.textContent).toBe("");
  });

  it("clearing one target's notice does not touch another target's pending timer", () => {
    const targetA = fakeTarget();
    const targetB = fakeTarget();

    showNotice(targetA, "notice A");
    showNotice(targetB, "notice B");
    showNotice(targetA, null);

    expect(targetA.hidden).toBe(true);
    expect(targetB.hidden).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(targetB.hidden).toBe(true);
    expect(targetB.textContent).toBe("");
  });
});
