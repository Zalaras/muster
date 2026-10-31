// Pins the fix landed in web-implementation.md's "Fix Attempt 1" (plan
// ui-text-and-focus, pre-review): `renderMainhead`'s no-session branch used to run
// `elements.nameEl.textContent = ""`, which — on the real DOM — replaces every child of
// `#mainhead h2.name` with a single text node, permanently detaching the
// `button.rename` child (Testable UI Elements: "Mainhead heading ... always contains the
// rename button"). `main.ts` resolves `nameEl` and `renameBtn` as two
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

function textNode(text: string): FakeNode {
  const node = new FakeNode();
  node.nodeType = 3;
  node.nodeValue = text;
  node.textWrites = 0;
  return node;
}

/** A class-addressable tree node: enough of Element for `renderMeta` and `renderRepoLines`
 * (`querySelector` by one class, `append`, `remove`, `hidden`, `title`, `textContent`). */
class FakeNode {
  className = "";
  hidden = false;
  title = "";
  parent: FakeNode | null = null;
  readonly kids: FakeNode[] = [];
  /** 3 for a text node (`Node.TEXT_NODE`, stubbed below), 1 for an element. */
  nodeType = 1;
  private own = "";
  /** Counts every write to this node's text, so a test can assert "no DOM write". */
  textWrites = 0;
  // `fitMainheadMeta` measures layout, which this environment has none of: a null
  // `offsetParent` is a node not laid out, so it only clears `--loc-cap` and returns. Its
  // trim is asserted against real layout in web/e2e/card-location.spec.ts.
  readonly offsetParent = null;
  readonly props = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  tag = "";
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, force: boolean) => {
      if (force) this.classes.add(name);
      else this.classes.delete(name);
    },
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  readonly style = {
    setProperty: (name: string, value: string) => this.props.set(name, value),
    removeProperty: (name: string) => this.props.delete(name),
  };

  constructor(className = "", ...kids: FakeNode[]) {
    this.className = className;
    for (const kid of kids) this.append(kid);
  }

  /** As the real DOM: a node's `textContent` is the concatenation of its descendants' text
   * (a text node's own); writing it on an element replaces all its children with one text. */
  get textContent(): string {
    if (this.nodeType === 3 || this.kids.length === 0) return this.own;
    return this.kids.map((kid) => kid.textContent).join("");
  }

  set textContent(text: string) {
    this.textWrites++;
    for (const kid of this.kids) kid.parent = null;
    this.kids.length = 0;
    this.own = text;
  }

  get nodeValue(): string | null {
    return this.nodeType === 3 ? this.own : null;
  }

  set nodeValue(text: string | null) {
    this.textWrites++;
    this.own = text ?? "";
  }

  get firstChild(): FakeNode | null {
    return this.kids[0] ?? null;
  }

  append(kid: FakeNode): void {
    kid.parent = this;
    this.kids.push(kid);
  }

  /** `renderModel` / `renderEffortStrip` rebuild a slot with strings and nodes: strings read
   * as text, nodes keep their own text, and `textContent` is the concatenation, as in the
   * real DOM. */
  replaceChildren(...nodes: (FakeNode | string)[]): void {
    for (const kid of this.kids) kid.parent = null;
    this.kids.length = 0;
    this.own = "";
    for (const node of nodes) {
      const kid = typeof node === "string" ? textNode(node) : node;
      kid.parent = this;
      this.kids.push(kid);
    }
  }

  remove(): void {
    const siblings = this.parent?.kids;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parent = null;
  }

  querySelector(selector: string): FakeNode | null {
    if (selector.startsWith(":scope > ")) {
      const direct = selector.slice(":scope > .".length);
      return this.kids.find((kid) => kid.className.split(" ").includes(direct)) ?? null;
    }
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
 * .claude-at > [.lead, .rf], .sep]`, then `.model`, `.ended-at > .ended`. `.loc`
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
    new FakeNode("ended-at", new FakeNode("ended")),
  );
}

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

function fakeButton(): HTMLButtonElement {
  const attrs: Record<string, string> = {};
  return {
    disabled: false,
    textContent: "",
    title: "",
    dataset: {} as Record<string, string | undefined>,
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
  } as unknown as HTMLButtonElement;
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
    effortStrip: new FakeNode("effort-strip", new FakeNode("sentence")) as unknown as HTMLElement,
    renameBtn,
    groupBtn: fakeGroupBtn(),
    surfaceSegment: fakeSurfaceSegmentRefs(),
    attached: nameEl.attached,
  };
}

// renderModel and renderRepoLines create nodes on first need; the stub serves every describe.
beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      const node = new FakeNode(tag === "span" ? "" : tag);
      node.tag = tag;
      return node;
    },
    createTextNode: textNode,
  });
  vi.stubGlobal("Node", { TEXT_NODE: 3 });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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
    addedDirs: [],
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
    effort: null,
    effortWarning: null,
    note: null,
    cache: null,
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

// The group control: its name span carries the label the caller composed
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

// The Focus header's `.meta` is filled in place from card.ts's `mainheadMeta`:
// `document.createElement` is stubbed because `renderRepoLines`
// creates the `.rb` branch line on first need.
describe("renderMainhead — structured meta (REQ-13, REQ-14, REQ-17)", () => {
  type Slots = {
    meta: FakeNode;
    loc: FakeNode;
    repo: FakeNode;
    claudeAt: FakeNode;
    // `.loc`'s direct `.sep` children in document order: [between the blocks, before the model].
    locSeps: FakeNode[];
    model: FakeNode;
    endedAt: FakeNode;
    strip: FakeNode;
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
      strip: elements.effortStrip as unknown as FakeNode,
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

  it("not moved: two repo lines, the `↳` block and the first `.loc` separator hidden (the last stays), no title", () => {
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
    expect(s.loc.title).toBe("");
  });

  it("moved into a worktree: the `↳` block shows the bare branch and `.loc` still has no title", () => {
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
    expect(s.loc.title).toBe("");
  });

  it("moved to a non-git directory: the `↳` block is one basename line and `.loc` has no title", () => {
    const { s } = render(
      makeSession({
        id: 1,
        claudeLocation: { directory: "/tmp/scratch", repo: null },
      }),
    );
    expect(lines(s.claudeAt).map((n) => n.textContent)).toEqual(["scratch"]);
    expect(s.loc.title).toBe("");
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

  // `.rf` holds `.rf-name` + `.plus` while directories are added; plain text at 0.
  describe("the `+N` suffix on the folder line", () => {
    const mainRepo = { name: "muster", branch: "main", isWorktree: false };
    const dirs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ directory: `/tmp/d${i}`, repo: null }));
    const rf = (elements: MainheadElements) => lines(slots(elements).repo)[0] as FakeNode;
    const draw = (elements: MainheadElements, n: number) =>
      renderMainhead(
        elements,
        makeSession({ id: 1, repo: mainRepo, addedDirs: dirs(n) }),
        NOW,
        true,
        DEFAULT_SURFACE_STATE,
        "none",
        false,
        "no group",
      );

    it("N = 0: plain text `muster /`, no span, no has-plus class", () => {
      const { s } = render(makeSession({ id: 1, repo: mainRepo }));
      const node = lines(s.repo)[0] as FakeNode;
      expect(node.textContent).toBe("muster /");
      expect(node.kids).toHaveLength(0);
      expect(node.classes.has("has-plus")).toBe(false);
    });

    it("N = 2: name and plus spans, textContent `muster+2`, has-plus set", () => {
      const elements = fakeMainheadElements();
      draw(elements, 2);
      const node = rf(elements);
      expect(node.kids.map((k) => [k.className, k.textContent])).toEqual([
        ["rf-name", "muster"],
        ["plus", "+2"],
      ]);
      expect(node.textContent).toBe("muster+2");
      expect(node.classes.has("has-plus")).toBe(true);
    });

    it("a render tick with the same count reuses both spans and writes no text", () => {
      const elements = fakeMainheadElements();
      draw(elements, 2);
      const node = rf(elements);
      const [name, plus] = node.kids as [FakeNode, FakeNode];
      const writes = [name.textWrites, plus.textWrites, node.textWrites];
      draw(elements, 2);
      expect(node.kids[0]).toBe(name);
      expect(node.kids[1]).toBe(plus);
      expect([name.textWrites, plus.textWrites, node.textWrites]).toEqual(writes);
    });

    it("a count change updates the plus text in place, keeping the spans", () => {
      const elements = fakeMainheadElements();
      draw(elements, 2);
      const [name, plus] = rf(elements).kids as [FakeNode, FakeNode];
      draw(elements, 3);
      expect(rf(elements).kids[0]).toBe(name);
      expect(rf(elements).kids[1]).toBe(plus);
      expect(plus.textContent).toBe("+3");
    });

    it("dropping back to 0 restores the plain `muster /` and clears has-plus", () => {
      const elements = fakeMainheadElements();
      draw(elements, 2);
      draw(elements, 0);
      const node = rf(elements);
      expect(node.kids).toHaveLength(0);
      expect(node.textContent).toBe("muster /");
      expect(node.classes.has("has-plus")).toBe(false);
    });

    it("a session with no repo reads `<basename>+N`", () => {
      const { s } = render(makeSession({ id: 1, addedDirs: dirs(1) }));
      expect((lines(s.repo)[0] as FakeNode).textContent).toBe("muster+1");
    });
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
    const bare = { effort: { level: null } } as const;
    expect(render(makeSession({ id: 1, model: null, ...bare })).s.model.textContent).toBe(
      "unknown",
    );
    expect(
      render(
        makeSession({
          id: 1,
          model: { id: "claude-opus-4-1", displayName: "opus" },
          ...bare,
        }),
      ).s.model.textContent,
    ).toBe("opus");
  });

  // The effort readout sits in a `.eff` child of `.model`; it is absent (not
  // hidden) when there are no brackets, and `warn` while a warning is set.
  describe("the effort readout in `.model`", () => {
    const opus = { id: "claude-opus-4-5", displayName: "Opus 4.5" };
    const cases: {
      name: string;
      session: Partial<Session>;
      text: string;
      eff: string | null;
      cls?: string;
      holds: boolean;
    }[] = [
      {
        name: "a level reads in brackets after the model",
        session: { effort: { level: "high" } },
        text: "Opus 4.5 (high)",
        eff: " (high)",
        cls: "eff",
        holds: false,
      },
      {
        name: "an alive session with no report yet reads `(…)`",
        session: { effort: null },
        text: "Opus 4.5 (…)",
        eff: " (…)",
        cls: "eff",
        holds: false,
      },
      {
        name: "a model with no effort setting reads no brackets and no `.eff` node",
        session: { effort: { level: null } },
        text: "Opus 4.5",
        eff: null,
        holds: false,
      },
      {
        name: "a dead session that never reported reads no brackets but holds the width",
        session: { effort: null, alive: false, endedAt: "2026-08-22T00:00:00Z" },
        text: "Opus 4.5",
        eff: null,
        holds: true,
      },
      {
        name: "a set warning marks the readout `warn`",
        session: {
          effort: { level: "high" },
          effortWarning: { requested: "max", actual: "high", model: "Opus 4.5" },
        },
        text: "Opus 4.5 (high)",
        eff: " (high)",
        cls: "eff warn",
        holds: false,
      },
    ];
    it.each(cases)("$name", ({ session, text, eff, cls, holds }) => {
      const { s } = render(makeSession({ id: 1, model: opus, ...session }));
      expect(s.model.textContent).toBe(text);
      const node = s.model.querySelector(".eff");
      if (eff === null) {
        expect(node).toBeNull();
      } else {
        expect(node?.textContent).toBe(eff);
        expect(node?.className).toBe(cls);
      }
      expect(s.model.classes.has("holds-eff")).toBe(holds);
    });

    // Browser Major 1: a pass with nothing changed leaves the nodes alone, and a change
    // touches only the text or class that differs.
    describe("across render passes", () => {
      const pass = (elements: MainheadElements, session: Session) =>
        renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "g");
      const warned = { requested: "max", actual: "high", model: "Opus 4.5" };
      const warnedSession = (extra: Partial<Session> = {}) =>
        makeSession({
          id: 1,
          model: opus,
          effort: { level: "high" },
          effortWarning: warned,
          ...extra,
        });

      it("keeps the text node and `.eff` element and writes nothing when unchanged", () => {
        const elements = fakeMainheadElements();
        const model = slots(elements).model;
        pass(elements, warnedSession());
        const text = model.firstChild;
        const eff = model.querySelector(".eff");
        expect(text?.nodeType).toBe(3);
        expect(eff).not.toBeNull();
        if (!text || !eff) return;
        const writes = [text.textWrites, eff.textWrites];
        pass(elements, warnedSession());
        pass(elements, warnedSession());
        expect(model.firstChild).toBe(text);
        expect(model.querySelector(".eff")).toBe(eff);
        expect(model.kids).toHaveLength(2);
        expect([text.textWrites, eff.textWrites]).toEqual(writes);
        expect(eff.className).toBe("eff warn");
      });

      it("rewrites only the brackets text when the level changes", () => {
        const elements = fakeMainheadElements();
        const model = slots(elements).model;
        pass(elements, warnedSession());
        const text = model.firstChild;
        const eff = model.querySelector(".eff");
        const textWrites = text?.textWrites;
        pass(elements, warnedSession({ effort: { level: "max" } }));
        expect(model.firstChild).toBe(text);
        expect(model.querySelector(".eff")).toBe(eff);
        expect(text?.textWrites).toBe(textWrites);
        expect(eff?.textContent).toBe(" (max)");
        expect(model.textContent).toBe("Opus 4.5 (max)");
      });

      it("flips only the class when the warning clears", () => {
        const elements = fakeMainheadElements();
        const model = slots(elements).model;
        pass(elements, warnedSession());
        const eff = model.querySelector(".eff");
        const writes = eff?.textWrites;
        pass(elements, warnedSession({ effortWarning: null }));
        expect(model.querySelector(".eff")).toBe(eff);
        expect(eff?.className).toBe("eff");
        expect(eff?.textWrites).toBe(writes);
      });

      it("rewrites only the model name's text node when the model changes", () => {
        const elements = fakeMainheadElements();
        const model = slots(elements).model;
        pass(elements, warnedSession());
        const text = model.firstChild;
        const eff = model.querySelector(".eff");
        pass(
          elements,
          warnedSession({ model: { id: "claude-sonnet-5", displayName: "Sonnet 5" } }),
        );
        expect(model.firstChild).toBe(text);
        expect(model.querySelector(".eff")).toBe(eff);
        expect(model.textContent).toBe("Sonnet 5 (high)");
      });
    });

    it("drops a stale `.eff` node when the brackets go away on the next pass", () => {
      const elements = fakeMainheadElements();
      const pass = (session: Session) =>
        renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "g");
      pass(makeSession({ id: 1, model: opus, effort: { level: "high" } }));
      expect(slots(elements).model.querySelector(".eff")).not.toBeNull();
      pass(makeSession({ id: 1, model: opus, effort: { level: null } }));
      expect(slots(elements).model.querySelector(".eff")).toBeNull();
    });
  });

  // The strip shows only while a warning is set, worded from the warning.
  describe("the effort strip", () => {
    const warning = { requested: "max", actual: "high", model: "Opus 4.5" };
    it("is hidden with no warning and shown with the sentence while one is set", () => {
      const none = render(makeSession({ id: 1 })).s.strip;
      expect(none.hidden).toBe(true);
      const set = render(makeSession({ id: 1, effortWarning: warning })).s.strip;
      expect(set.hidden).toBe(false);
      expect(set.querySelector(".sentence")?.textContent).toBe(
        "Asked for max \u2014 Opus 4.5 started at high.",
      );
    });

    it("hides again when the warning clears, and on the no-session pass", () => {
      const elements = fakeMainheadElements();
      const strip = elements.effortStrip as unknown as FakeNode;
      const pass = (session: Session | null) =>
        renderMainhead(elements, session, NOW, true, DEFAULT_SURFACE_STATE, "none", false, "g");
      pass(makeSession({ id: 1, effortWarning: warning }));
      expect(strip.hidden).toBe(false);
      pass(makeSession({ id: 1 }));
      expect(strip.hidden).toBe(true);
      pass(makeSession({ id: 1, effortWarning: warning }));
      pass(null);
      expect(strip.hidden).toBe(true);
    });
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
