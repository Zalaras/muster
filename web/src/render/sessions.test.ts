import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Session } from "../protocol";
import { reconcileCards, renderFocusMain, renderSessions, renderSizenote, type FocusMainElements } from "./sessions";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: false } as unknown as HTMLElement;
}

// The non-empty branch now clones real `<template>` DOM (`#session-card-template`) via
// `buildCardViewModel` (docs/conventions.md: rendering/DOM is Playwright's job, not
// Vitest's) — see web/e2e/sessions.spec.ts for card-rendering coverage and
// ../sessions/card.test.ts for the pure view-model logic it's built from. Only the
// honest-empty-state branch is DOM-free enough to unit test here.
describe("renderSessions", () => {
  it("renders the honest empty state when there are no sessions", () => {
    const el = fakeElement();
    renderSessions(el, []);
    expect(el.textContent).toBe("No sessions yet");
  });
});

describe("renderFocusMain — toggles between the empty state and the terminal slot", () => {
  function elements(): FocusMainElements {
    return { emptyEl: fakeElement(), slotEl: fakeElement() };
  }

  it("shows the empty state and hides the terminal slot when there are no sessions", () => {
    const els = elements();
    renderFocusMain(els, false);
    expect(els.emptyEl.hidden).toBe(false);
    expect(els.slotEl.hidden).toBe(true);
  });

  it("hides the empty state and shows the terminal slot when sessions exist", () => {
    const els = elements();
    renderFocusMain(els, true);
    expect(els.emptyEl.hidden).toBe(true);
    expect(els.slotEl.hidden).toBe(false);
  });
});

describe("renderSizenote — REQ-15's '<cols>×<rows> · one live client · geometry owned by this pane'", () => {
  it("hides the line entirely when geometry is null (no focused session / not yet laid out)", () => {
    const el = fakeElement();
    renderSizenote(el, null);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("renders the exact sizenote text (byte-for-byte × character) when geometry is present", () => {
    const el = fakeElement();
    renderSizenote(el, { cols: 210, rows: 52 });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("210×52 · one live client · geometry owned by this pane");
  });

  it("re-shows a previously-hidden line once geometry arrives", () => {
    const el = fakeElement();
    renderSizenote(el, null);
    renderSizenote(el, { cols: 80, rows: 24 });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("80×24 · one live client · geometry owned by this pane");
  });
});

// review m4-reconcile cycle-3 Minor 4: `reconcileCards` (id-matching, reorder-in-place,
// insert, remove, and — as of cycle-3's Fix Attempt 3 — focus capture/restore across a
// reorder) had no unit coverage at all. This Vitest environment has no jsdom
// (docs/conventions.md defers DOM *construction* to Playwright — see
// web/e2e/reconcile.spec.ts and web/e2e/actions.spec.ts's keyboard cases for the
// rendered-behaviour coverage), so — following render/masthead.test.ts's existing
// `FakeDomNode` convention (the one place this codebase already stubs enough of
// Element/Document for a renderer's real DOM calls to run) — this builds a slightly
// richer shim: a real (if minimal) tree with `insertBefore`/`querySelector`/`cloneNode`/
// `contains`/`focus`, because `reconcileCards` itself (not just a leaf renderer) needs
// all of those to run for real. This is deliberately the one thing left untested here:
// a genuine multi-client 60fps profile, or anything about actual layout/paint — that
// stays Playwright's job. What this pins is the *contract*: which nodes get reused vs.
// rebuilt vs. removed, and whether focus survives a reorder.
class FakeTextNode {
  readonly nodeType = 3;
  parent: FakeDomNode | null = null;

  remove(): void {
    this.parent?.removeChild(this);
    this.parent = null;
  }
}

type FakeChild = FakeDomNode | FakeTextNode;

function parseSimpleSelector(selector: string): { tag: string | null; classes: string[]; attrs: Array<{ key: string; value: string }> } {
  const tagMatch = /^[a-zA-Z0-9-]+/.exec(selector);
  const tag = tagMatch ? tagMatch[0] : null;
  const classes = Array.from(selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)).map((m) => m[1] as string);
  const attrs = Array.from(selector.matchAll(/\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/g)).map((m) => ({
    key: (m[1] as string).replace(/^data-/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
    value: (m[2] as string) ?? "",
  }));
  return { tag, classes, attrs };
}

class FakeDomNode {
  readonly tagName: string;
  className = "";
  hidden = false;
  disabled = false;
  tabIndex = -1;
  // Plan order-sidebar: `updateSessionCardContent` writes the pin button's `.title`
  // directly (not via `setAttribute`, matching real HTMLElement.title) — not read by any
  // pre-existing test in this file, so it was never needed on the shim until now.
  title = "";
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string | undefined> = {};
  private readonly attrs: Record<string, string> = {};
  parent: FakeDomNode | null = null;
  private nodeChildren: FakeChild[] = [];
  private ownText = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  // REQ-1 (plan ui-text-and-focus): `updateSessionCardContent` removes `aria-current`
  // outright on a non-current card (never sets it to `"false"` — INV-3), so the shim
  // needs a real remove, not just an absent `setAttribute` call.
  removeAttribute(name: string): void {
    delete this.attrs[name];
  }

  hasAttribute(name: string): boolean {
    return Object.hasOwn(this.attrs, name);
  }

  // Vitest's DOM-element pretty-printer (used by matchers like `toContain`'s failure
  // diff) probes for this — harmless to implement for real, avoids a serializer crash
  // on assertion failure.
  getAttributeNames(): string[] {
    return Object.keys(this.attrs);
  }

  get textContent(): string {
    return this.nodeChildren.length > 0 ? this.nodeChildren.map((c) => (c instanceof FakeDomNode ? c.textContent : "")).join("") : this.ownText;
  }

  set textContent(value: string) {
    this.ownText = value;
    this.nodeChildren = [];
  }

  get childNodes(): FakeChild[] {
    return [...this.nodeChildren];
  }

  get children(): FakeDomNode[] {
    return this.nodeChildren.filter((c): c is FakeDomNode => c instanceof FakeDomNode);
  }

  get firstElementChild(): FakeDomNode | null {
    return this.children[0] ?? null;
  }

  get nextElementSibling(): FakeDomNode | null {
    if (!this.parent) return null;
    const siblings = this.parent.children;
    const index = siblings.indexOf(this);
    return index === -1 ? null : (siblings[index + 1] ?? null);
  }

  private detach(): void {
    if (!this.parent) return;
    const idx = this.parent.nodeChildren.indexOf(this);
    if (idx !== -1) this.parent.nodeChildren.splice(idx, 1);
    this.parent = null;
    // Chrome blurs a focused descendant the moment its subtree is detached, even when
    // `insertBefore` reattaches it synchronously — that is the measured mechanism behind
    // review m4-reconcile cycle-3 Minor 1 / cycle-4 Minor 2. Mirror it here so the focus
    // capture/restore tests below exercise the restore branch for real (cycle-4 Minor 1
    // found two of them vacuous: with no blur on detach, the branch never ran and a
    // no-op `focus()` still passed).
    const doc = (globalThis as unknown as { document: { activeElement: FakeDomNode | null } }).document;
    if (doc.activeElement && (doc.activeElement === this || this.contains(doc.activeElement))) {
      doc.activeElement = null;
    }
  }

  appendChild(child: FakeChild): FakeChild {
    if (child instanceof FakeDomNode) child.detach();
    this.nodeChildren.push(child);
    child.parent = this;
    return child;
  }

  insertBefore(newNode: FakeChild, referenceNode: FakeChild | null): FakeChild {
    if (newNode instanceof FakeDomNode) newNode.detach();
    const index = referenceNode ? this.nodeChildren.indexOf(referenceNode) : -1;
    if (referenceNode === null || index === -1) this.nodeChildren.push(newNode);
    else this.nodeChildren.splice(index, 0, newNode);
    if (newNode instanceof FakeDomNode) newNode.parent = this;
    return newNode;
  }

  replaceChildren(...nodes: FakeChild[]): void {
    for (const c of this.nodeChildren) if (c instanceof FakeDomNode) c.parent = null;
    this.nodeChildren = nodes;
    for (const c of nodes) if (c instanceof FakeDomNode) c.parent = this;
  }

  remove(): void {
    this.detach();
  }

  removeChild(child: FakeChild): void {
    if (child instanceof FakeDomNode) child.detach();
    else {
      const idx = this.nodeChildren.indexOf(child);
      if (idx !== -1) this.nodeChildren.splice(idx, 1);
    }
  }

  contains(node: FakeChild | null): boolean {
    if (!node) return false;
    if (node === (this as unknown as FakeChild)) return true;
    for (const c of this.nodeChildren) {
      if (c === node) return true;
      if (c instanceof FakeDomNode && c.contains(node)) return true;
    }
    return false;
  }

  private matchesSelf(sel: ReturnType<typeof parseSimpleSelector>): boolean {
    if (sel.tag && this.tagName.toLowerCase() !== sel.tag.toLowerCase()) return false;
    const classList = this.className.split(/\s+/).filter(Boolean);
    if (!sel.classes.every((c) => classList.includes(c))) return false;
    if (!sel.attrs.every((a) => this.dataset[a.key] === a.value)) return false;
    return true;
  }

  querySelector(selector: string): FakeDomNode | null {
    const sel = parseSimpleSelector(selector);
    for (const c of this.nodeChildren) {
      if (c instanceof FakeDomNode) {
        if (c.matchesSelf(sel)) return c;
        const found = c.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  addEventListener(): void {
    // Not exercised — reconcileCards's own tests never simulate a click/keydown, only
    // the reconciliation contract (Playwright drives real events; e2e/actions.spec.ts).
  }

  focus(): void {
    (globalThis as unknown as { document: { activeElement: FakeDomNode | null } }).document.activeElement = this;
  }

  clone(deep: boolean): FakeDomNode {
    const copy = new FakeDomNode(this.tagName);
    copy.className = this.className;
    copy.hidden = this.hidden;
    Object.assign(copy.dataset, this.dataset);
    copy.ownText = this.ownText;
    if (deep) {
      for (const c of this.nodeChildren) {
        if (c instanceof FakeDomNode) copy.appendChild(c.clone(true));
        else copy.appendChild(new FakeTextNode());
      }
    }
    return copy;
  }

  cloneNode(deep: boolean): FakeDomNode {
    return this.clone(deep);
  }
}

/** Mirrors `index.html`'s `#session-card-template` markup (article.card > [.stripe,
 * .card-in > [.r1 > [.name, .badge, .timer], .r2, .r3, .activity, .note, .acts-row]])
 * closely enough for `buildSessionCardElement`/`updateSessionCardContent`'s real
 * `querySelector` calls to resolve every field they touch. */
function buildCardTemplateFragment(): FakeDomNode {
  const fragment = new FakeDomNode("#document-fragment");
  const card = new FakeDomNode("article");
  card.className = "card";
  const stripe = new FakeDomNode("div");
  stripe.className = "stripe";
  const cardIn = new FakeDomNode("div");
  cardIn.className = "card-in";
  const r1 = new FakeDomNode("div");
  r1.className = "r1";
  const name = new FakeDomNode("span");
  name.className = "name";
  const badge = new FakeDomNode("span");
  badge.className = "badge";
  const timer = new FakeDomNode("span");
  timer.className = "timer";
  r1.appendChild(name);
  r1.appendChild(badge);
  r1.appendChild(timer);
  // Plan order-sidebar REQ-8: the pin button appended to `.r1` in
  // `session-card-template` (index.html) — mirrored here so
  // `updateSessionCardContent`'s real `querySelector(".pin")` resolves it.
  const pin = new FakeDomNode("button");
  pin.className = "pin";
  r1.appendChild(pin);
  const r2 = new FakeDomNode("div");
  r2.className = "r2";
  const r3 = new FakeDomNode("div");
  r3.className = "r3";
  const activity = new FakeDomNode("div");
  activity.className = "activity";
  activity.hidden = true;
  const note = new FakeDomNode("div");
  note.className = "note";
  note.hidden = true;
  const actsRow = new FakeDomNode("div");
  actsRow.className = "acts-row";
  actsRow.hidden = true;
  cardIn.appendChild(r1);
  cardIn.appendChild(r2);
  cardIn.appendChild(r3);
  cardIn.appendChild(activity);
  cardIn.appendChild(note);
  cardIn.appendChild(actsRow);
  card.appendChild(stripe);
  card.appendChild(cardIn);
  fragment.appendChild(card);
  return fragment;
}

function fakeTemplate(): HTMLTemplateElement {
  const fragmentRoot = buildCardTemplateFragment();
  return {
    content: {
      cloneNode: (deep: boolean) => fragmentRoot.cloneNode(deep),
    },
  } as unknown as HTMLTemplateElement;
}

const NOW = new Date("2026-08-27T00:00:10Z");

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: `session-${overrides.id}`,
    titleOverride: null,
    state: "idle",
    stateSince: "2026-08-27T00:00:00Z",
    alive: true,
    endedAt: null,
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
    createdAt: "2026-08-27T00:00:00Z",
    pinned: false,
    railPos: overrides.id,
    ...overrides,
  };
}

describe("reconcileCards (review m4-reconcile cycle-3 Minor 4)", () => {
  let fakeDocument: { activeElement: FakeDomNode | null; createElement: (tag: string) => FakeDomNode };

  beforeEach(() => {
    fakeDocument = { activeElement: null, createElement: (tag: string) => new FakeDomNode(tag) };
    vi.stubGlobal("HTMLElement", FakeDomNode);
    vi.stubGlobal("HTMLButtonElement", FakeDomNode);
    vi.stubGlobal("document", fakeDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNode {
    return new FakeDomNode("div");
  }

  it("builds one card per session, in the given order, on first reconcile (insert case)", () => {
    const el = container();
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 }), makeSession({ id: 3 })];
    reconcileCards(el as unknown as HTMLElement, sessions, NOW, fakeTemplate(), undefined, undefined, true);

    expect(el.children.map((c) => c.dataset["sessionId"])).toEqual(["1", "2", "3"]);
    expect(el.children.map((c) => c.querySelector(".name")?.textContent)).toEqual(["session-1", "session-2", "session-3"]);
  });

  it("reuses the same DOM node for a session that survives a reconcile, only updating its content (update-in-place, not rebuild)", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, title: "first" })], NOW, fakeTemplate(), undefined, undefined, true);
    const before = el.children[0];

    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, title: "second" })], NOW, fakeTemplate(), undefined, undefined, true);
    const after = el.children[0];

    expect(after).toBe(before);
    expect(after?.querySelector(".name")?.textContent).toBe("second");
  });

  it("reorders existing cards in place (same node identity, new position) rather than rebuilding when priority changes", () => {
    const el = container();
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1 }), makeSession({ id: 2 })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    const [cardA, cardB] = el.children;

    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 2 }), makeSession({ id: 1 })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );

    expect(el.children.map((c) => c.dataset["sessionId"])).toEqual(["2", "1"]);
    // Same nodes, just moved — not a new element built for either id.
    expect(el.children).toContain(cardA);
    expect(el.children).toContain(cardB);
  });

  it("removes only the departed session's card, leaving the others' node identity untouched", () => {
    const el = container();
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1 }), makeSession({ id: 2 }), makeSession({ id: 3 })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    const survivor1 = el.children[0];
    const survivor3 = el.children[2];

    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 }), makeSession({ id: 3 })], NOW, fakeTemplate(), undefined, undefined, true);

    expect(el.children.map((c) => c.dataset["sessionId"])).toEqual(["1", "3"]);
    expect(el.children[0]).toBe(survivor1);
    expect(el.children[1]).toBe(survivor3);
  });

  it("drops a stray non-element child (the honest-empty-state's text node) before reconciling", () => {
    const el = container();
    el.appendChild(new FakeTextNode());
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true);

    expect(el.childNodes).toHaveLength(1);
    expect(el.children).toHaveLength(1);
  });

  // Fix Attempt 3 (cycle 3, Minor 1): insertBefore on an already-mounted node detaches
  // it first per the DOM spec, which blurs a focused descendant in real Chrome even
  // though the reattach is synchronous — reconcileCards now captures the focused card's
  // logical identity before the reorder loop and re-focuses the same logical target
  // afterwards if the move blurred it.
  describe("focus capture/restore across a reorder (Fix Attempt 3)", () => {
    it("shim contract: detaching a node that contains the focused element blurs it (the Chrome behaviour under test)", () => {
      const el = container();
      reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 }), makeSession({ id: 2 })], NOW, fakeTemplate(), undefined, undefined, true);
      const endBtn = el.children[1]?.querySelector('[data-action="end"]');
      endBtn?.focus();
      expect(fakeDocument.activeElement).toBe(endBtn);
      // Move card 2 ahead of card 1 with a raw insertBefore, bypassing reconcileCards.
      el.insertBefore(el.children[1] as FakeDomNode, el.children[0] as FakeDomNode);
      expect(fakeDocument.activeElement).toBeNull();
    });

    it("the restore branch does the work: with focus() stubbed to a no-op, a reorder leaves focus lost", () => {
      const el = container();
      reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 }), makeSession({ id: 2 })], NOW, fakeTemplate(), undefined, undefined, true);
      const endBtn = el.children[1]?.querySelector('[data-action="end"]') as FakeDomNode;
      endBtn.focus();
      const realFocus = endBtn.focus.bind(endBtn);
      endBtn.focus = () => {};
      reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 2 }), makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true);
      expect(fakeDocument.activeElement).toBeNull();
      endBtn.focus = realFocus;
    });

    it("restores focus to the same session's action button after a reorder moves its card", () => {
      const el = container();
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 1, alive: false, endedAt: "2026-08-27T00:00:00Z" }), makeSession({ id: 2 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );
      const endBtn = el.children[1]?.querySelector('[data-action="end"]');
      expect(endBtn).toBeTruthy();
      endBtn?.focus();
      expect(fakeDocument.activeElement).toBe(endBtn);

      // Session 2 moves ahead of session 1 — a real reorder, not just a content update.
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 2 }), makeSession({ id: 1, alive: false, endedAt: "2026-08-27T00:00:00Z" })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );

      const activeAfter = fakeDocument.activeElement;
      expect(activeAfter).not.toBeNull();
      expect(activeAfter?.dataset["action"]).toBe("end");
      expect(activeAfter?.dataset["id"]).toBe("2");
    });

    it("restores focus to the card itself (not a button) after a reorder, when the card was the focused element", () => {
      const el = container();
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 1 }), makeSession({ id: 2 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );
      const cardTwo = el.children[1];
      cardTwo?.focus();
      expect(fakeDocument.activeElement).toBe(cardTwo);

      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 2 }), makeSession({ id: 1 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );

      expect(fakeDocument.activeElement?.dataset["sessionId"]).toBe("2");
    });

    it("does not touch document.activeElement when nothing inside the container was focused", () => {
      const el = container();
      const outsideEl = new FakeDomNode("button");
      fakeDocument.activeElement = outsideEl;

      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 1 }), makeSession({ id: 2 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 2 }), makeSession({ id: 1 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );

      expect(fakeDocument.activeElement).toBe(outsideEl);
    });

    it("does not force a re-focus when the reorder didn't actually blur the focused card (position unchanged)", () => {
      const el = container();
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 1 }), makeSession({ id: 2 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );
      const cardOne = el.children[0];
      cardOne?.focus();

      // Same order again — a steady-state tick, no reorder, so insertBefore's
      // detach-and-reattach never runs and focus never moves in the first place.
      reconcileCards(
        el as unknown as HTMLElement,
        [makeSession({ id: 1 }), makeSession({ id: 2 })],
        NOW,
        fakeTemplate(),
        undefined,
        undefined,
        true,
      );

      expect(fakeDocument.activeElement).toBe(cardOne);
    });
  });
});

// Plan order-sidebar: the pin button (REQ-8/REQ-17/W13), the pinned-block visual
// (REQ-9/W14) and the draggable attribute (REQ-10/W15/W16) all live in
// updateSessionCardContent, exercised through reconcileCards exactly like the rest of
// this file's coverage.
describe("reconcileCards — pin button attributes (plan order-sidebar REQ-8/REQ-17/W13)", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeDomNode);
    vi.stubGlobal("HTMLButtonElement", FakeDomNode);
    vi.stubGlobal("document", { activeElement: null, createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNode {
    return new FakeDomNode("div");
  }

  it("sets aria-label 'Pin', aria-pressed 'false' and title 'Pin to top' on an unpinned card's first build", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: false })], NOW, fakeTemplate(), undefined, undefined, true);
    const pin = el.children[0]?.querySelector(".pin");
    expect(pin?.getAttribute("aria-label")).toBe("Pin");
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    expect(pin?.title).toBe("Pin to top");
  });

  it("sets aria-label 'Unpin', aria-pressed 'true' and title 'Unpin' on a pinned card's first build", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: true })], NOW, fakeTemplate(), undefined, undefined, true);
    const pin = el.children[0]?.querySelector(".pin");
    expect(pin?.getAttribute("aria-label")).toBe("Unpin");
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
    expect(pin?.title).toBe("Unpin");
  });

  it("updates the pin button's attributes in place (same node) when pinned flips false -> true on an existing card", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: false })], NOW, fakeTemplate(), undefined, undefined, true);
    const pinBefore = el.children[0]?.querySelector(".pin");

    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: true })], NOW, fakeTemplate(), undefined, undefined, true);
    const pinAfter = el.children[0]?.querySelector(".pin");

    expect(pinAfter).toBe(pinBefore);
    expect(pinAfter?.getAttribute("aria-label")).toBe("Unpin");
    expect(pinAfter?.getAttribute("aria-pressed")).toBe("true");
    expect(pinAfter?.title).toBe("Unpin");
  });

  it("updates the pin button's attributes in place when pinned flips true -> false on an existing card", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: true })], NOW, fakeTemplate(), undefined, undefined, true);
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1, pinned: false })], NOW, fakeTemplate(), undefined, undefined, true);
    const pin = el.children[0]?.querySelector(".pin");
    expect(pin?.getAttribute("aria-label")).toBe("Pin");
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    expect(pin?.title).toBe("Pin to top");
  });

  it("carries the pin button's data-action/data-id for the focus-capture contract, same convention as an .acts-row button", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 7, pinned: false })], NOW, fakeTemplate(), undefined, undefined, true);
    const pin = el.children[0]?.querySelector(".pin");
    expect(pin?.dataset["action"]).toBe("pin");
    expect(pin?.dataset["id"]).toBe("7");
  });
});

describe("reconcileCards — pinned block visual: `pinned`/`pinned-last` classes (plan order-sidebar REQ-9/W14)", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeDomNode);
    vi.stubGlobal("HTMLButtonElement", FakeDomNode);
    vi.stubGlobal("document", { activeElement: null, createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNode {
    return new FakeDomNode("div");
  }

  it("gives every pinned card the `pinned` class and no unpinned card that class", () => {
    const el = container();
    // Caller supplies sessions already in orderRail order (pinned block first) — this
    // reconciler has no notion of sort mode, only display order + each session's own flag.
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1, pinned: true }), makeSession({ id: 2, pinned: true }), makeSession({ id: 3, pinned: false })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    expect(el.children[0]?.className.split(/\s+/)).toContain("pinned");
    expect(el.children[1]?.className.split(/\s+/)).toContain("pinned");
    expect(el.children[2]?.className.split(/\s+/)).not.toContain("pinned");
  });

  it("gives only the last pinned card in display order `pinned-last`, no other card", () => {
    const el = container();
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1, pinned: true }), makeSession({ id: 2, pinned: true }), makeSession({ id: 3, pinned: false })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    expect(el.children[0]?.className.split(/\s+/)).not.toContain("pinned-last");
    expect(el.children[1]?.className.split(/\s+/)).toContain("pinned-last");
    expect(el.children[2]?.className.split(/\s+/)).not.toContain("pinned-last");
  });

  it("gives no card `pinned-last` when nothing is pinned", () => {
    const el = container();
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1, pinned: false }), makeSession({ id: 2, pinned: false })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    for (const card of el.children) {
      expect(card.className.split(/\s+/)).not.toContain("pinned-last");
    }
  });

  it("moves pinned-last to the new last pinned card once a session is unpinned (a re-render after an upsert)", () => {
    const el = container();
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1, pinned: true }), makeSession({ id: 2, pinned: true }), makeSession({ id: 3, pinned: false })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    // Session 2 is unpinned; the caller re-renders with the new orderRail-ordered list
    // (pinned block first) — id 1 is now the sole pinned session.
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1, pinned: true }), makeSession({ id: 2, pinned: false }), makeSession({ id: 3, pinned: false })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
    );
    expect(el.children[0]?.className.split(/\s+/)).toContain("pinned-last");
    expect(el.children[1]?.className.split(/\s+/)).not.toContain("pinned-last");
    expect(el.children[2]?.className.split(/\s+/)).not.toContain("pinned-last");
  });
});

// REQ-1/REQ-3/INV-3/W6 (plan ui-text-and-focus): "the session the Focus pane is
// showing" marker — exactly one `#sessions` card carries `aria-current="true"` whenever
// `currentId` matches a card in the list, and the attribute is *removed* (not set to
// `"false"`) on every other card, including one that used to be current.
describe("reconcileCards — INV-3 marker: aria-current follows currentId (W6)", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeDomNode);
    vi.stubGlobal("HTMLButtonElement", FakeDomNode);
    vi.stubGlobal("document", { activeElement: null, createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNode {
    return new FakeDomNode("div");
  }

  it("with three sessions, only the currentId card has aria-current=\"true\"; the other two carry no such attribute at all", () => {
    const el = container();
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 }), makeSession({ id: 3 })];
    reconcileCards(el as unknown as HTMLElement, sessions, NOW, fakeTemplate(), undefined, undefined, true, false, undefined, 2);

    const [c1, c2, c3] = el.children;
    expect(c1?.hasAttribute("aria-current")).toBe(false);
    expect(c2?.getAttribute("aria-current")).toBe("true");
    expect(c3?.hasAttribute("aria-current")).toBe(false);
    expect(c1?.className.split(/\s+/)).not.toContain("current");
    expect(c2?.className.split(/\s+/)).toContain("current");
    expect(c3?.className.split(/\s+/)).not.toContain("current");
  });

  it("with currentId: null, no card carries aria-current", () => {
    const el = container();
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 })];
    reconcileCards(el as unknown as HTMLElement, sessions, NOW, fakeTemplate(), undefined, undefined, true, false, undefined, null);

    for (const card of el.children) {
      expect(card.hasAttribute("aria-current")).toBe(false);
      expect(card.className.split(/\s+/)).not.toContain("current");
    }
  });

  it("moves the marker to the new currentId on a later reconcile, removing it from the previous card (same nodes, updated in place)", () => {
    const el = container();
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 })];
    reconcileCards(el as unknown as HTMLElement, sessions, NOW, fakeTemplate(), undefined, undefined, true, false, undefined, 1);
    expect(el.children[0]?.getAttribute("aria-current")).toBe("true");
    expect(el.children[1]?.hasAttribute("aria-current")).toBe(false);

    reconcileCards(el as unknown as HTMLElement, sessions, NOW, fakeTemplate(), undefined, undefined, true, false, undefined, 2);
    expect(el.children[0]?.hasAttribute("aria-current")).toBe(false);
    expect(el.children[1]?.getAttribute("aria-current")).toBe("true");
  });

  it("keeps exactly one current card after a reorder moves the current session's card into a slot a bystander previously occupied (INV-3 with bystanders)", () => {
    const el = container();
    // Session 1 is current, in slot 0.
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 1 }), makeSession({ id: 2 }), makeSession({ id: 3 })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
      false,
      undefined,
      1,
    );
    expect(el.children.map((c) => c.getAttribute("aria-current"))).toEqual(["true", null, null]);

    // A manual-mode drag/attention re-rank moves session 1 (still current) into what was
    // session 2's slot; session 2 now takes slot 0 — it must not inherit the attribute.
    reconcileCards(
      el as unknown as HTMLElement,
      [makeSession({ id: 2 }), makeSession({ id: 1 }), makeSession({ id: 3 })],
      NOW,
      fakeTemplate(),
      undefined,
      undefined,
      true,
      false,
      undefined,
      1,
    );

    const currentCards = el.children.filter((c) => c.hasAttribute("aria-current"));
    expect(currentCards).toHaveLength(1);
    expect(currentCards[0]?.dataset["sessionId"]).toBe("1");
    expect(el.children[0]?.hasAttribute("aria-current")).toBe(false);
  });
});

describe("reconcileCards — draggable attribute (plan order-sidebar REQ-10/W15/W16)", () => {
  beforeEach(() => {
    vi.stubGlobal("HTMLElement", FakeDomNode);
    vi.stubGlobal("HTMLButtonElement", FakeDomNode);
    vi.stubGlobal("document", { activeElement: null, createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNode {
    return new FakeDomNode("div");
  }

  it("defaults every card to draggable=\"false\" when the caller omits the parameter", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true);
    expect(el.children[0]?.getAttribute("draggable")).toBe("false");
  });

  it("sets draggable=\"true\" on every card when the caller passes draggable:true (manual-mode rail)", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 }), makeSession({ id: 2 })], NOW, fakeTemplate(), undefined, undefined, true, true);
    expect(el.children[0]?.getAttribute("draggable")).toBe("true");
    expect(el.children[1]?.getAttribute("draggable")).toBe("true");
  });

  it("explicitly sets draggable=\"false\" (not just an absent attribute) when the caller passes draggable:false (attention-mode rail / strip)", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true, false);
    expect(el.children[0]?.getAttribute("draggable")).toBe("false");
  });

  it("flips an existing card's draggable attribute in place when the caller's mode changes between renders", () => {
    const el = container();
    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true, true);
    expect(el.children[0]?.getAttribute("draggable")).toBe("true");

    reconcileCards(el as unknown as HTMLElement, [makeSession({ id: 1 })], NOW, fakeTemplate(), undefined, undefined, true, false);
    expect(el.children[0]?.getAttribute("draggable")).toBe("false");
  });
});
