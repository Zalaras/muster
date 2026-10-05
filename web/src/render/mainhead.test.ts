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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../protocol/session";
import { DEFAULT_SURFACE_STATE } from "../terminal/surfaceswitch";
import { renderMainhead, type MainheadElements } from "./mainhead";
import type { SurfaceSegmentRefs } from "./surfaceseg";

/** A class-addressable tree node: enough of Element for `renderMeta` and `renderRepoLines`
 * (`querySelector` by one class, `append`, `remove`, `hidden`, `title`, `textContent`). */
class FakeNode {
  className = "";
  textContent = "";
  hidden = false;
  title = "";
  parent: FakeNode | null = null;
  readonly kids: FakeNode[] = [];
  // `fitMainheadMeta` measures layout, which this environment has none of: a null
  // `offsetParent` is a node not laid out, so it only clears `--loc-cap` and returns. Its
  // trim is asserted against real layout in web/e2e/card-location.spec.ts.
  readonly offsetParent = null;
  readonly props = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string) => this.props.set(name, value),
    removeProperty: (name: string) => this.props.delete(name),
  };

  constructor(className = "", ...kids: FakeNode[]) {
    this.className = className;
    for (const kid of kids) this.append(kid);
  }

  append(kid: FakeNode): void {
    kid.parent = this;
    this.kids.push(kid);
  }

  remove(): void {
    const siblings = this.parent?.kids;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  querySelector(selector: string): FakeNode | null {
    const cls = selector.slice(1);
    for (const kid of this.kids) {
      if (kid.className.split(" ").includes(cls)) return kid;
      const deeper = kid.querySelector(selector);
      if (deeper) return deeper;
    }
    return null;
  }
}

/** `#mainhead .meta`'s static markup (index.html): `.loc > [.repo > .rf, .sep,
 * .claude-at > [.lead, .rf], .sep]`, then `.model`, `.ended-at > [.sep, .ended]`. `.loc`
 * holds two `.sep`s, as in the real tree: `renderMeta` must toggle the first (between the
 * blocks) and leave the last (before the model) shown, and `querySelector(".sep")` on
 * `.loc` finds the first. */
function fakeMeta(): FakeNode {
  return new FakeNode(
    "meta",
    new FakeNode(
      "loc",
      new FakeNode("repo", new FakeNode("rf")),
      new FakeNode("sep"),
      new FakeNode("claude-at", new FakeNode("lead"), new FakeNode("rf")),
      new FakeNode("sep"),
    ),
    new FakeNode("model"),
    new FakeNode("ended-at", new FakeNode("sep"), new FakeNode("ended")),
  );
}

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

/** The group control: a button holding a `.ig-name` span (index.html), which is the only child
 * `renderMainhead` writes the group's name into. */
function fakeGroupBtn(): HTMLButtonElement & { nameSpan: HTMLElement } {
  const nameSpan = fakeElement();
  return Object.assign(fakeButton(), {
    querySelector: (selector: string) => (selector === ".ig-name" ? nameSpan : null),
    nameSpan,
  });
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

/** `#mainhead` itself: `renderMainhead` toggles `.hidden` on it directly and looks up its
 * `.chip-danger` child (render/mainhead.ts's bypass-chip toggle) via a real `querySelector`
 * rather than a dedicated `MainheadElements` field — see that file's own comment. */
function fakeMainheadRoot(): HTMLElement {
  const chip = fakeElement();
  return {
    textContent: "",
    hidden: false,
    querySelector: (selector: string) => (selector === ".chip-danger" ? chip : null),
  } as unknown as HTMLElement;
}

function fakeMainheadElements(): MainheadElements & {
  attached: () => boolean;
  groupBtn: ReturnType<typeof fakeGroupBtn>;
} {
  const renameBtn = fakeButton();
  const nameEl = fakeNameEl(renameBtn);
  return {
    root: fakeMainheadRoot(),
    nameEl,
    metaEl: fakeMeta() as unknown as HTMLElement,
    endBtn: fakeButton(),
    resumeBtn: fakeButton(),
    removeBtn: fakeButton(),
    renameBtn,
    groupBtn: fakeGroupBtn(),
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
    claudeLocation: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    backgroundTasks: 0,
    claudeSessionId: "claude-sess",
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-22T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    unread: false,
    lastPrompt: null,
    groupId: null,
    ...overrides,
  };
}

describe("renderMainhead — no-session branch must not detach the rename button (Fix Attempt 1 regression pin)", () => {
  it("leaves button.rename attached to nameEl after a render with no focused session", () => {
    const elements = fakeMainheadElements();

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");

    expect(elements.root.hidden).toBe(true);
    expect(elements.attached()).toBe(true);
    expect(elements.nameEl.querySelector("button.rename")).toBe(elements.renameBtn);
  });

  it("survives repeated zero-session render passes (the dashboard's actual startup shape: one or more empty ticks before the first sessionUpsert)", () => {
    const elements = fakeMainheadElements();

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    renderMainhead(elements, null, NOW, false, DEFAULT_SURFACE_STATE, "none", false, "no group");
    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");

    expect(elements.attached()).toBe(true);
  });

  it("writes the session title into that same button once a session arrives after a no-session pass", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, title: "fix the thing" });

    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group"); // the startup zero-session tick
    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group"); // the first sessionUpsert

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

    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");

    expect(elements.resumeBtn.disabled).toBe(true);
    expect(resumeDisabledReason(elements.resumeBtn)).not.toBe("");
  });

  it("enables Resume with no disabling reason for a dead session with a bound Claude session id", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, alive: false, claudeSessionId: "claude-sess" });

    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");

    expect(elements.resumeBtn.disabled).toBe(false);
    expect(resumeDisabledReason(elements.resumeBtn)).toBe("");
  });
});

// The group control (plan groups): its name span carries the label the caller composed
// (sessions/sections.ts's `groupLabel`), and the whole control follows the connection.
describe("renderMainhead — group control", () => {
  it("writes the caller's group text into the name span", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1, groupId: 3 });
    renderMainhead(
      elements,
      session,
      NOW,
      true,
      DEFAULT_SURFACE_STATE,
      "none",
      false,
      "PR reviews",
    );
    expect(elements.groupBtn.nameSpan.textContent).toBe("PR reviews");
    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    expect(elements.groupBtn.nameSpan.textContent).toBe("no group");
  });

  it("is disabled while the socket is down and enabled again on reconnect", () => {
    const elements = fakeMainheadElements();
    const session = makeSession({ id: 1 });
    renderMainhead(elements, session, NOW, false, DEFAULT_SURFACE_STATE, "none", false, "no group");
    expect(elements.groupBtn.disabled).toBe(true);
    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    expect(elements.groupBtn.disabled).toBe(false);
  });

  it("is untouched by the no-session pass", () => {
    const elements = fakeMainheadElements();
    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    expect(elements.groupBtn.nameSpan.textContent).toBe("");
  });
});

// The Focus header's `.meta` is filled in place from card.ts's `mainheadMeta`
// (REQ-13, REQ-14, REQ-17). `document.createElement` is stubbed because `renderRepoLines`
// creates the `.rb` branch line on first need.
describe("renderMainhead — structured meta (REQ-13, REQ-14, REQ-17)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => new FakeNode(tag),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type Slots = {
    meta: FakeNode;
    loc: FakeNode;
    repo: FakeNode;
    claudeAt: FakeNode;
    // `.loc`'s direct `.sep` children in document order: [between the blocks, before the model].
    locSeps: FakeNode[];
    model: FakeNode;
    endedAt: FakeNode;
  };
  function slots(elements: MainheadElements): Slots {
    const meta = elements.metaEl as unknown as FakeNode;
    const loc = meta.querySelector(".loc") as FakeNode;
    return {
      meta,
      loc,
      repo: loc.querySelector(".repo") as FakeNode,
      claudeAt: loc.querySelector(".claude-at") as FakeNode,
      locSeps: loc.kids.filter((k) => k.className === "sep"),
      model: meta.querySelector(".model") as FakeNode,
      endedAt: meta.querySelector(".ended-at") as FakeNode,
    };
  }
  const lines = (host: FakeNode) => host.kids.filter((k) => /\b(rf|rb)\b/.test(k.className));
  const render = (session: Session | null) => {
    const elements = fakeMainheadElements();
    renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    return { elements, s: slots(elements) };
  };

  const worktreeAt = {
    directory: "/Users/bob/code/muster/.claude/worktrees/e7b",
    repo: { name: "e7b", branch: "worktree-e7b", isWorktree: true },
  };

  it("not moved: two repo lines, the `↳` block and the first `.loc` separator hidden (the last stays), hover is lines 1-2", () => {
    const { s } = render(
      makeSession({
        id: 1,
        repo: { name: "muster", branch: "main", isWorktree: false },
      }),
    );
    expect(lines(s.repo).map((n) => [n.className, n.textContent])).toEqual([
      ["rf", "muster /"],
      ["rb", "main"],
    ]);
    expect(s.claudeAt.hidden).toBe(true);
    expect(s.locSeps.map((n) => n.hidden)).toEqual([true, false]);
    expect(s.loc.title).toBe("muster / main\n/Users/bob/code/muster");
  });

  it("moved into a worktree: the `↳` block shows the bare branch and the hover grows to four lines", () => {
    const { s } = render(
      makeSession({
        id: 1,
        repo: { name: "muster", branch: "main", isWorktree: false },
        claudeLocation: worktreeAt,
      }),
    );
    expect(s.claudeAt.hidden).toBe(false);
    expect(s.locSeps.map((n) => n.hidden)).toEqual([false, false]);
    expect(lines(s.claudeAt).map((n) => n.textContent)).toEqual(["e7b /", "worktree-e7b"]);
    expect(s.loc.title).toBe(
      "muster / main\n/Users/bob/code/muster\nClaude is in /Users/bob/code/muster/.claude/worktrees/e7b\non worktree-e7b",
    );
  });

  it("moved to a non-git directory: the `↳` block is one basename line and the hover has three lines", () => {
    const { s } = render(
      makeSession({
        id: 1,
        claudeLocation: { directory: "/tmp/scratch", repo: null },
      }),
    );
    expect(lines(s.claudeAt).map((n) => n.textContent)).toEqual(["scratch"]);
    expect(s.loc.title).toBe("muster\n/Users/bob/code/muster\nClaude is in /tmp/scratch");
  });

  it("a session with no repo renders one folder line, the basename, and removes a stale branch line", () => {
    const elements = fakeMainheadElements();
    const withRepo = makeSession({
      id: 1,
      repo: { name: "muster", branch: "main", isWorktree: false },
    });
    renderMainhead(elements, withRepo, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    renderMainhead(
      elements,
      makeSession({ id: 1 }),
      NOW,
      true,
      DEFAULT_SURFACE_STATE,
      "none",
      false,
      "no group",
    );
    expect(lines(slots(elements).repo).map((n) => n.textContent)).toEqual(["muster"]);
  });

  it("returning to the launch checkout hides the `↳` block again", () => {
    const elements = fakeMainheadElements();
    const moved = makeSession({ id: 1, claudeLocation: worktreeAt });
    renderMainhead(elements, moved, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    renderMainhead(
      elements,
      makeSession({ id: 1 }),
      NOW,
      true,
      DEFAULT_SURFACE_STATE,
      "none",
      false,
      "no group",
    );
    const s = slots(elements);
    expect(s.claudeAt.hidden).toBe(true);
    expect(s.locSeps.map((n) => n.hidden)).toEqual([true, false]);
  });

  it("the model slot reads `unknown` for a null model and the display name otherwise (W4)", () => {
    expect(render(makeSession({ id: 1, model: null })).s.model.textContent).toBe("unknown");
    expect(
      render(
        makeSession({
          id: 1,
          model: { id: "claude-opus-4-1", displayName: "opus" },
        }),
      ).s.model.textContent,
    ).toBe("opus");
  });

  it("the ended slot shows only for a dead session with an end time", () => {
    const alive = render(makeSession({ id: 1 })).s.endedAt;
    expect(alive.hidden).toBe(true);
    const dead = render(makeSession({ id: 1, alive: false, endedAt: "2026-08-22T00:00:00Z" })).s
      .endedAt;
    expect(dead.hidden).toBe(false);
    expect((dead.querySelector(".ended") as FakeNode).textContent).toMatch(/^ended /);
  });

  it("the session name button carries its full title as a hover (REQ-17), including the `untitled` fallback", () => {
    const named = render(makeSession({ id: 1, title: "a very long session name" }));
    expect((named.elements.renameBtn as unknown as { title: string }).title).toBe(
      "a very long session name",
    );
    const untitled = render(makeSession({ id: 1, title: null }));
    expect((untitled.elements.renameBtn as unknown as { title: string }).title).toBe("untitled");
  });

  it("the no-session pass leaves the meta slots in place for the next focused pass", () => {
    const elements = fakeMainheadElements();
    renderMainhead(elements, null, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "no group");
    expect(slots(elements).repo).not.toBeNull();
    renderMainhead(
      elements,
      makeSession({ id: 1 }),
      NOW,
      true,
      DEFAULT_SURFACE_STATE,
      "none",
      false,
      "no group",
    );
    expect(lines(slots(elements).repo).map((n) => n.textContent)).toEqual(["muster"]);
  });
});
