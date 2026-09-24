// Pins the fix landed in web-implementation.md's "Fix Attempt 1" (plan
// ui-text-and-focus, pre-review): `renderMainhead`'s no-session branch used to run
// `elements.nameEl.textContent = ""`, which — on the real DOM — replaces every child of
// `#mainhead h2.name` with a single text node, permanently detaching the
// `button.rename` child (Testable UI Elements: "Mainhead heading ... always contains the
// rename button", REQ-13(a)). `main.ts` resolves `nameEl` and `renameBtn` as two
// separate `requireElement` calls at startup and wires `attachRenameEditor` to `nameEl`
// once, with no later rebuild path, and the dashboard always runs one zero-session
// render() pass before the first sessionUpsert — so the wipe fired on every page load.
//
// No jsdom in this Vitest environment (docs/conventions.md defers DOM construction to
// Playwright — see web/e2e/rename.spec.ts for the button<->input swap/focus/select
// coverage). Following render/tiles.test.ts's `fakeNameEl` convention (a plain object
// that proxies `.textContent` reads to a child it holds, so a parent-writes-textContent
// call can be modelled without a real DOM), this file's `fakeNameEl` goes one step
// further and treats *any* write to `.textContent` as detaching the child — mirroring
// `Node.textContent`'s real "replace all children with one text node" semantics — since
// that exact semantic is what the fixed code must no longer trigger on `nameEl`. This is
// squarely a "state derivation from DOM writes" contract (which nodes survive a render
// pass), not a rendering/interaction concern, so it belongs here rather than in
// Playwright per docs/conventions.md's split.
import { describe, expect, it } from "vitest";
import type { Session } from "../protocol/session";
import { DEFAULT_SURFACE_STATE } from "../terminal/surfaceswitch";
import { renderMainhead, type MainheadElements } from "./mainhead";
import type { SurfaceSegmentRefs } from "./surfaceseg";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

// `title`/`setAttribute`/`getAttribute` are here for REQ-17/W3's disabled-Resume-reason
// tests below — additive, harmless to the endBtn/removeBtn/rename-regression tests above
// that never read them.
function fakeButton(): HTMLButtonElement {
  const attrs: Record<string, string> = {};
  return {
    disabled: false,
    textContent: "",
    title: "",
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
  } as unknown as HTMLButtonElement;
}

/** REQ-17/W3's UI Specifications say the reason lives in "its title/aria-description"
 * without picking one — accept either a native `.title` write or a `setAttribute`
 * ("aria-description" or "title") so this test doesn't fail a correct implementation for
 * choosing the mechanism the plan left open (flagged in web-tests.md). */
function resumeDisabledReason(btn: HTMLButtonElement): string {
  return (
    (btn as unknown as { title?: string }).title ||
    btn.getAttribute("aria-description") ||
    btn.getAttribute("title") ||
    ""
  );
}

/** Models `#mainhead h2.name`: starts holding `renameBtn` as its one child (index.html's
 * static markup), and — like a real `HTMLElement` — any assignment to `.textContent`
 * detaches that child. `attached()` lets a test observe whether the button survived a
 * render pass without reimplementing a full DOM. */
function fakeNameEl(renameBtn: HTMLButtonElement): HTMLElement & { attached: () => boolean } {
  let attached = true;
  return {
    dataset: {} as Record<string, string | undefined>,
    set textContent(_v: string) {
      attached = false;
    },
    get textContent(): string {
      return attached ? (renameBtn.textContent as string) : "";
    },
    querySelector: <T extends Element>(selector: string): T | null =>
      attached && selector === "button.rename" ? (renameBtn as unknown as T) : null,
    attached: () => attached,
  } as unknown as HTMLElement & { attached: () => boolean };
}

/** A minimal `SurfaceSegmentRefs` fake — mainhead.test.ts never asserts on the surface
 * segment itself (render/surfaceseg.test.ts owns `updateSurfaceSegment`'s own contract);
 * this just needs to survive `renderMainhead`'s unconditional call into it without
 * throwing. */
function fakeSurfaceSegmentRefs(): SurfaceSegmentRefs {
  const shellActEl = { dataset: {}, remove() {} } as unknown as HTMLElement;
  const surfaceBtn = () =>
    ({
      setAttribute() {},
      disabled: false,
      contains: () => false,
      prepend() {},
    }) as unknown as HTMLButtonElement;
  return {
    root: fakeElement(),
    claudeBtn: surfaceBtn(),
    shellBtn: surfaceBtn(),
    docsBtn: surfaceBtn(),
    shellActEl,
  };
}

function fakeMainheadElements(): MainheadElements & { attached: () => boolean } {
  const renameBtn = fakeButton();
  const nameEl = fakeNameEl(renameBtn);
  return {
    root: fakeElement(),
    nameEl,
    metaEl: fakeElement(),
    endBtn: fakeButton(),
    resumeBtn: fakeButton(),
    removeBtn: fakeButton(),
    renameBtn,
    surfaceSegment: fakeSurfaceSegmentRefs(),
    attached: nameEl.attached,
  };
}

const NOW = new Date("2026-08-22T00:00:10Z");

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: `session-${overrides.id}`,
    titleOverride: null,
    plan: null,
    state: "idle",
    stateSince: "2026-08-22T00:00:00Z",
    alive: true,
    endedAt: null,
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
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    unread: false,
    lastPrompt: null,
    ...overrides,
  };
}

describe("renderMainhead — no-session branch must not detach the rename button (Fix Attempt 1 regression pin)", () => {
  it("leaves button.rename attached to nameEl after a render with no focused session", () => {
    const elements = fakeMainheadElements();

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false);

    expect(elements.root.hidden).toBe(true);
    expect(elements.attached()).toBe(true);
    expect(elements.nameEl.querySelector("button.rename")).toBe(elements.renameBtn);
  });

  it("survives repeated zero-session render passes (the dashboard's actual startup shape: one or more empty ticks before the first sessionUpsert)", () => {
    const elements = fakeMainheadElements();

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false);
    renderMainhead(elements, null, NOW, false, DEFAULT_SURFACE_STATE, "none", false);
    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false);

    expect(elements.attached()).toBe(true);
  });

  it("writes the session title into that same button once a session arrives after a no-session pass", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, title: "fix the thing" });

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false); // the startup zero-session tick
    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false); // the first sessionUpsert

    expect(elements.attached()).toBe(true);
    expect(elements.nameEl.querySelector("button.rename")).toBe(elements.renameBtn);
    expect(elements.renameBtn.textContent).toBe("fix the thing");
  });
});

// REQ-17/W3 (plan session-lifecycle): a session that never bound a Claude session id is
// refused Resume forever (409 not_resumable) — the button must say why, not just sit
// disabled next to a live session's disabled-for-being-alive Resume button.
describe("renderMainhead — Resume disabled reason (REQ-17/W3)", () => {
  it("disables Resume with a non-empty reason when the session has no bound Claude session id", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, alive: false, claudeSessionId: null });

    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false);

    expect(elements.resumeBtn.disabled).toBe(true);
    expect(resumeDisabledReason(elements.resumeBtn)).not.toBe("");
  });

  it("enables Resume with no disabling reason for a dead session with a bound Claude session id", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, alive: false, claudeSessionId: "claude-sess" });

    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false);

    expect(elements.resumeBtn.disabled).toBe(false);
    expect(resumeDisabledReason(elements.resumeBtn)).toBe("");
  });
});
