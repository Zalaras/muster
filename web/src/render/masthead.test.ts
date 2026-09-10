import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeCodeInfo, Density, ModelWindow, SessionModelInfo, Usage } from "../protocol";
import { formatResets } from "../sessions/format";
import {
  describeClaudeVersion,
  renderClaudeVersion,
  renderConnectionStatus,
  renderDensityControl,
  renderModelWeek,
  renderUsage,
  renderUsageModel,
  renderUsageTrack,
  renderViewSwitcher,
  type DensityControlElements,
  type UsageElements,
  type ViewSwitcherElements,
} from "./masthead";

function fakeElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
}

/** A minimal DOM stand-in for `renderUsage`/`renderUsageTrack` — this Vitest environment
 * has no jsdom (docs/conventions.md defers DOM *construction* to Playwright), but
 * `renderBucket` (masthead.ts) now unconditionally calls `document.createElement` even in
 * its "unknown" branch (it builds a permanent `.lbl`/`.num` pair every render pass), so a
 * plain `{ textContent: "" }` fake can no longer exercise it at all — every call throws
 * `ReferenceError: document is not defined`. Rather than lose the honesty-rule coverage to
 * Playwright (E2E has no test for the 0%/99.6% rounding boundary asserted below), this
 * stubs just enough of `Element`/`Document` — `createElement`, `appendChild`,
 * `insertBefore`, `replaceChildren`, `querySelector`, and a `textContent` that reflects
 * appended children — for these two renderers' actual DOM calls to run for real. */
class FakeDomNode {
  readonly tagName: string;
  className = "";
  hidden = false;
  readonly style: Record<string, string> = {};
  private children: FakeDomNode[] = [];
  private ownText = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  get textContent(): string {
    return this.children.length > 0 ? this.children.map((c) => c.textContent).join("") : this.ownText;
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  appendChild(child: FakeDomNode): FakeDomNode {
    this.children.push(child);
    return child;
  }

  insertBefore(newNode: FakeDomNode, referenceNode: FakeDomNode | null): FakeDomNode {
    const index = referenceNode ? this.children.indexOf(referenceNode) : -1;
    if (index === -1) this.children.push(newNode);
    else this.children.splice(index, 0, newNode);
    return newNode;
  }

  replaceChildren(...nodes: FakeDomNode[]): void {
    this.children = nodes;
  }

  querySelector(selector: string): FakeDomNode | null {
    const wanted = selector.replace(/^\./, "");
    return this.children.find((c) => c.className.split(" ").includes(wanted)) ?? null;
  }

  /** Child *classNames*, not `tagName` — `renderBucket`/`renderUsageTrack` build every
   * node as a `<span>` (only the track fill is an `<i>`), so `className` (`lbl`/`bar`/
   * `num`/`resets`) is what actually distinguishes them for an order assertion. */
  childClasses(): string[] {
    return this.children.map((c) => c.className);
  }
}

function fakeDomElement(): HTMLElement {
  return new FakeDomNode("div") as unknown as HTMLElement;
}

/** A fake element that records whether/how many times a child was appended, without
 * requiring a real `document` (this Vitest environment has none — DOM construction
 * itself, i.e. `renderUsageTrack`'s known-bucket branch, is Playwright's job per
 * docs/conventions.md; see web/e2e/gauges.spec.ts). Enough to prove the honesty-rule
 * early return: a null bucket must touch the element exactly zero times. */
function fakeAppendableElement(): HTMLElement & { appendChild: ReturnType<typeof vi.fn>; hidden: boolean } {
  return { textContent: "", hidden: false, appendChild: vi.fn() } as unknown as HTMLElement & {
    appendChild: ReturnType<typeof vi.fn>;
    hidden: boolean;
  };
}

/** A fake button that records `aria-pressed` the way a real HTMLButtonElement would
 * report it back via `getAttribute` — enough for renderViewSwitcher/renderDensityControl,
 * which never touch anything else on these elements. */
function fakeButton(): HTMLButtonElement {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    getAttribute: (name: string) => attrs.get(name) ?? null,
  } as unknown as HTMLButtonElement;
}

describe("renderConnectionStatus", () => {
  it.each([
    ["connected", "connected"],
    ["connecting", "connecting…"],
    ["reconnecting", "reconnecting…"],
  ] as const)("renders %s as %p", (status, expected) => {
    const el = fakeElement();
    renderConnectionStatus(el, status);
    expect(el.textContent).toBe(expected);
  });
});

describe("renderUsage — honesty rule: null renders 'unknown', never a gauge/percentage", () => {
  const unknown: Usage = { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" };

  function elements(): UsageElements {
    return { fiveHour: fakeDomElement(), sevenDay: fakeDomElement() };
  }

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Review cycle 1 / Major 2's fix splits the bucket into permanent `.lbl`/`.num` spans
  // (web-implementation.md Fix Attempt 1) with no space character between them — spacing
  // is CSS `gap`, not text content, so `el.textContent` concatenates to "5hunknown" /
  // "5h61%" with no separator. Verified live by web-impl against the real DOM; asserted
  // per-span here (via `.lbl`/`.num`) so the honesty-rule content is pinned without
  // depending on that concatenation detail.
  it("renders 'unknown' for both buckets when both are null (pre-hello / M0 state)", () => {
    const els = elements();
    renderUsage(els, unknown);
    expect((els.fiveHour as unknown as FakeDomNode).querySelector(".lbl")?.textContent).toBe("5h");
    expect((els.fiveHour as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("unknown");
    expect((els.sevenDay as unknown as FakeDomNode).querySelector(".lbl")?.textContent).toBe("7d");
    expect((els.sevenDay as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("unknown");
  });

  it("renders a rounded percentage when a bucket is present", () => {
    const els = elements();
    renderUsage(els, { ...unknown, fiveHour: { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" } });
    expect((els.fiveHour as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("61%");
    expect((els.sevenDay as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("unknown");
  });

  it("rounds the boundary values 0 and 99.6 correctly (0% and 100%, never blank)", () => {
    const els = elements();
    renderUsage(els, {
      ...unknown,
      fiveHour: { usedPct: 0, resetsAt: "2026-08-20T11:00:00Z" },
      sevenDay: { usedPct: 99.6, resetsAt: "2026-08-20T11:00:00Z" },
    });
    expect((els.fiveHour as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("0%");
    expect((els.sevenDay as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("100%");
  });

  it("only one bucket null renders independently ('unknown' for that bucket only)", () => {
    const els = elements();
    renderUsage(els, { ...unknown, sevenDay: { usedPct: 23, resetsAt: "2026-08-22T06:00:00Z" } });
    expect((els.fiveHour as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("unknown");
    expect((els.sevenDay as unknown as FakeDomNode).querySelector(".num")?.textContent).toBe("23%");
  });
});

// Review cycle 1 / Major 2: the masthead bucket's child order regressed to a fused
// "5h 61%" text node followed by the bar (bar rendering *after* the number). Fixed by
// splitting renderBucket into `.lbl`/`.num` spans so renderUsageTrack can insert the bar
// between them; this locks the reference order (mockups/a-instrument.html:199) in place
// so it can't silently regress again.
describe("renderUsage + renderUsageTrack — element order matches the reference render (Major 2 regression guard)", () => {
  const now = new Date("2026-08-23T09:00:00Z");

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeDomNode(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("orders children lbl, bar, num, resets for a known bucket — bar reads before the number", () => {
    const el = new FakeDomNode("div");
    const bucket = { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" };
    const usage: Usage = { fiveHour: bucket, sevenDay: null, sampledAt: "2026-08-23T08:59:00Z", source: "subscription" };

    renderUsage({ fiveHour: el as unknown as HTMLElement, sevenDay: fakeDomElement() }, usage);
    renderUsageTrack(el as unknown as HTMLElement, bucket, now);

    expect(el.childClasses()).toEqual(["lbl", "bar warn", "num", "resets"]);
    expect(el.querySelector(".lbl")?.textContent).toBe("5h");
    expect(el.querySelector(".num")?.textContent).toBe("61%");
    expect(el.querySelector(".resets")?.textContent).toBe(`· ${formatResets(bucket.resetsAt, now)}`);
  });

  it("applies the 'warn' modifier at or above the 60% threshold and omits it below", () => {
    const warnBucket = { usedPct: 61.2, resetsAt: "2026-08-20T11:00:00Z" };
    const warnEl = new FakeDomNode("div");
    renderUsage(
      { fiveHour: warnEl as unknown as HTMLElement, sevenDay: fakeDomElement() },
      { fiveHour: warnBucket, sevenDay: null, sampledAt: null, source: "subscription" },
    );
    renderUsageTrack(warnEl as unknown as HTMLElement, warnBucket, now);
    expect(warnEl.querySelector(".bar")?.className).toBe("bar warn");

    const plainBucket = { usedPct: 23, resetsAt: "2026-08-20T11:00:00Z" };
    const plainEl = new FakeDomNode("div");
    renderUsage(
      { fiveHour: plainEl as unknown as HTMLElement, sevenDay: fakeDomElement() },
      { fiveHour: plainBucket, sevenDay: null, sampledAt: null, source: "subscription" },
    );
    renderUsageTrack(plainEl as unknown as HTMLElement, plainBucket, now);
    expect(plainEl.querySelector(".bar")?.className).toBe("bar");
  });
});

// Plan version-claude-interface, UI Specifications > DOM: the six-row table
// `describeClaudeVersion` implements. Exercised directly (pure function, no DOM) so every
// row is pinned independently of how `renderClaudeVersion` happens to build markup.
const VERSION_NOT_TESTED = "This Claude Code version has not been tested with Muster";
const VERSION_NOT_TESTED_UPDATE = `${VERSION_NOT_TESTED} — please update Claude Code`;

describe("describeClaudeVersion — UI Specifications > DOM six-row table", () => {
  it("row 1: null (pre-hello) -> 'claude unknown', no warning", () => {
    expect(describeClaudeVersion(null)).toEqual({ text: "claude unknown", warning: null });
  });

  it("row 2: status 'unknown' (with a populated installed, which the daemon never actually sends alongside unknown) -> 'Claude installation unknown', no warning", () => {
    const info: ClaudeCodeInfo = { installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status: "unknown" };
    expect(describeClaudeVersion(info)).toEqual({ text: "Claude installation unknown", warning: null });
  });

  it("row 2 (installed genuinely null): status 'unknown' with installed null -> 'Claude installation unknown', no warning", () => {
    const info: ClaudeCodeInfo = { installed: null, floor: "2.1.246", verified: "2.1.267", status: "unknown" };
    expect(describeClaudeVersion(info)).toEqual({ text: "Claude installation unknown", warning: null });
  });

  it("row 3: status 'verified' -> 'claude <installed>', no warning", () => {
    const info: ClaudeCodeInfo = { installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status: "verified" };
    expect(describeClaudeVersion(info)).toEqual({ text: "claude 2.1.267", warning: null });
  });

  it("row 4: status 'above' -> 'claude <installed>' + the not-tested warning (no update wording)", () => {
    const info: ClaudeCodeInfo = { installed: "2.1.270", floor: "2.1.246", verified: "2.1.267", status: "above" };
    expect(describeClaudeVersion(info)).toEqual({ text: "claude 2.1.270", warning: VERSION_NOT_TESTED });
  });

  it("row 5: status 'below' -> 'claude <installed>' + the not-tested-please-update warning (em dash U+2014)", () => {
    const info: ClaudeCodeInfo = { installed: "2.1.200", floor: "2.1.246", verified: "2.1.267", status: "below" };
    const result = describeClaudeVersion(info);
    expect(result).toEqual({ text: "claude 2.1.200", warning: VERSION_NOT_TESTED_UPDATE });
    expect(result.warning).toContain("—"); // em dash, not a hyphen
  });

  it("row 6 (defensive): a non-'unknown' status with installed null -> 'Claude installation unknown', no warning (the daemon never sends this — INV-1 — but the parser only type-checks, so the renderer must not template 'claude null')", () => {
    for (const status of ["verified", "above", "below"] as const) {
      const info: ClaudeCodeInfo = { installed: null, floor: "2.1.246", verified: "2.1.267", status };
      expect(describeClaudeVersion(info)).toEqual({ text: "Claude installation unknown", warning: null });
    }
  });
});

/** Minimal DOM stand-in for `renderClaudeVersion`'s `replaceChildren`-based rebuild: text
 * nodes (`document.createTextNode`) and the warning `<span>` (`document.createElement`),
 * enough to assert child count/order/content and the span's `role`/`aria-label`/`title`
 * without jsdom (docs/conventions.md: DOM construction is Playwright's job in general, but
 * "which nodes, in which order, with which attributes" is pure logic worth pinning here,
 * same rationale as the FakeDomNode family above). */
class FakeVersionNode {
  className = "";
  title = "";
  private attrs = new Map<string, string>();
  private ownText: string;

  constructor(text: string) {
    this.ownText = text;
  }

  get textContent(): string {
    return this.ownText;
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
}

class FakeVersionElement {
  private children: FakeVersionNode[] = [];

  replaceChildren(...nodes: FakeVersionNode[]): void {
    this.children = nodes;
  }

  get textContent(): string {
    return this.children.map((c) => c.textContent).join("");
  }

  nodes(): FakeVersionNode[] {
    return this.children;
  }
}

describe("renderClaudeVersion — rebuilds #claude-version via replaceChildren (no innerHTML)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createTextNode: (text: string) => new FakeVersionNode(text),
      createElement: () => new FakeVersionNode(""),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function element(): FakeVersionElement {
    return new FakeVersionElement();
  }

  it("no warning: a lone text node, no glyph", () => {
    const el = element();
    const info: ClaudeCodeInfo = { installed: "2.1.267", floor: "2.1.246", verified: "2.1.267", status: "verified" };
    renderClaudeVersion(el as unknown as HTMLElement, info);
    expect(el.nodes()).toHaveLength(1);
    expect(el.textContent).toBe("claude 2.1.267");
  });

  it("pre-hello (null info): a lone 'claude unknown' text node", () => {
    const el = element();
    renderClaudeVersion(el as unknown as HTMLElement, null);
    expect(el.nodes()).toHaveLength(1);
    expect(el.textContent).toBe("claude unknown");
  });

  it("warning present: trailing-space text node followed by a role=img glyph whose aria-label and title both carry the warning sentence", () => {
    const el = element();
    const info: ClaudeCodeInfo = { installed: "2.1.270", floor: "2.1.246", verified: "2.1.267", status: "above" };
    renderClaudeVersion(el as unknown as HTMLElement, info);

    const [textNode, glyph] = el.nodes();
    expect(el.nodes()).toHaveLength(2);
    expect(textNode!.textContent).toBe("claude 2.1.270 ");
    expect(glyph!.textContent).toBe("⚠");
    expect(glyph!.className).toBe("version-warn");
    expect(glyph!.getAttribute("role")).toBe("img");
    expect(glyph!.getAttribute("aria-label")).toBe(VERSION_NOT_TESTED);
    expect(glyph!.title).toBe(VERSION_NOT_TESTED);
    // Resulting textContent per UI Specifications > DOM: "claude 2.1.270 ⚠".
    expect(el.textContent).toBe("claude 2.1.270 ⚠");
  });

  it("below-range warning uses the update wording, still matching aria-label to title", () => {
    const el = element();
    const info: ClaudeCodeInfo = { installed: "2.1.200", floor: "2.1.246", verified: "2.1.267", status: "below" };
    renderClaudeVersion(el as unknown as HTMLElement, info);

    const [, glyph] = el.nodes();
    expect(glyph!.getAttribute("aria-label")).toBe(VERSION_NOT_TESTED_UPDATE);
    expect(glyph!.title).toBe(VERSION_NOT_TESTED_UPDATE);
    expect(glyph!.getAttribute("aria-label")).toBe(glyph!.title);
  });

  it("re-renders cleanly across a warning -> no-warning transition (self-healing: no stale glyph left behind)", () => {
    const el = element();
    renderClaudeVersion(el as unknown as HTMLElement, {
      installed: "2.1.270",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "above",
    });
    expect(el.nodes()).toHaveLength(2);

    renderClaudeVersion(el as unknown as HTMLElement, {
      installed: "2.1.267",
      floor: "2.1.246",
      verified: "2.1.267",
      status: "verified",
    });
    expect(el.nodes()).toHaveLength(1);
    expect(el.textContent).toBe("claude 2.1.267");
  });
});

describe("renderViewSwitcher — Testable UI Elements: aria-pressed reflects selection", () => {
  function elements(): ViewSwitcherElements {
    return { focusButton: fakeButton(), tilesButton: fakeButton() };
  }

  it("marks Focus pressed and Tiles not pressed when view is 'focus'", () => {
    const els = elements();
    renderViewSwitcher(els, "focus");
    expect(els.focusButton.getAttribute("aria-pressed")).toBe("true");
    expect(els.tilesButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks Tiles pressed and Focus not pressed when view is 'tiles'", () => {
    const els = elements();
    renderViewSwitcher(els, "tiles");
    expect(els.focusButton.getAttribute("aria-pressed")).toBe("false");
    expect(els.tilesButton.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("renderDensityControl — renders only in Tiles; aria-pressed reflects density", () => {
  function elements(): DensityControlElements {
    return { container: fakeElement(), twoByTwoButton: fakeButton(), threeByTwoButton: fakeButton() };
  }

  it("hides the container in Focus regardless of density", () => {
    const els = elements();
    renderDensityControl(els, "focus", "2x2");
    expect(els.container.hidden).toBe(true);
  });

  it("shows the container in Tiles", () => {
    const els = elements();
    renderDensityControl(els, "tiles", "2x2");
    expect(els.container.hidden).toBe(false);
  });

  it("marks 2x2 pressed and 3x2 not pressed when density is '2x2'", () => {
    const els = elements();
    renderDensityControl(els, "tiles", "2x2");
    expect(els.twoByTwoButton.getAttribute("aria-pressed")).toBe("true");
    expect(els.threeByTwoButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks 3x2 pressed and 2x2 not pressed when density is '3x2'", () => {
    const els = elements();
    renderDensityControl(els, "tiles", "3x2");
    expect(els.twoByTwoButton.getAttribute("aria-pressed")).toBe("false");
    expect(els.threeByTwoButton.getAttribute("aria-pressed")).toBe("true");
  });

  it.each(["2x2", "3x2"] as Density[])("still sets aria-pressed correctly even while hidden in Focus (density %s)", (density) => {
    const els = elements();
    renderDensityControl(els, "focus", density);
    expect(els.twoByTwoButton.getAttribute("aria-pressed")).toBe(String(density === "2x2"));
    expect(els.threeByTwoButton.getAttribute("aria-pressed")).toBe(String(density === "3x2"));
  });
});

// M3 (plan m3-gauges REQ-11/W7): renderUsageTrack's known-bucket branch builds real DOM
// nodes via `document.createElement`, which this Vitest environment doesn't provide (no
// jsdom is configured — docs/conventions.md assigns rendering to Playwright). Only the
// null-bucket early return is DOM-construction-free, so that's what's covered here; the
// known-bucket honesty/warn-threshold behavior is covered end-to-end by
// web/e2e/gauges.spec.ts (E5/E12) against the real DOM.
describe("renderUsageTrack — honesty rule 1 (INV-3): a null bucket appends nothing at all", () => {
  it("touches the element zero times for a null bucket (no track, no resets text)", () => {
    const el = fakeAppendableElement();
    renderUsageTrack(el, null, new Date("2026-08-23T09:00:00Z"));
    expect(el.appendChild).not.toHaveBeenCalled();
  });

  it("is a true no-op regardless of the current time (no time-dependent path taken when bucket is null)", () => {
    const el = fakeAppendableElement();
    renderUsageTrack(el, null, new Date("2000-01-01T00:00:00Z"));
    renderUsageTrack(el, null, new Date("2099-01-01T00:00:00Z"));
    expect(el.appendChild).not.toHaveBeenCalled();
  });
});

describe("renderUsageModel (REQ-12): the masthead model readout", () => {
  it("hides and clears the element when model is null (no sample yet)", () => {
    const el = fakeElement() as HTMLElement & { hidden: boolean };
    el.hidden = false;
    el.textContent = "stale";
    renderUsageModel(el, null);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("hides and clears the element when model is undefined (pre-M3-shaped payload with no model key)", () => {
    const el = fakeElement() as HTMLElement & { hidden: boolean };
    el.hidden = false;
    renderUsageModel(el, undefined);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("shows the element with the model's displayName verbatim when present", () => {
    const el = fakeElement() as HTMLElement & { hidden: boolean };
    el.hidden = true;
    const model: SessionModelInfo = { id: "claude-haiku-4-5", displayName: "Haiku 4.5" };
    renderUsageModel(el, model);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("Haiku 4.5");
  });

  it("re-hides on a known -> null transition (e.g. daemon restart, REQ-7) — self-healing, no stale name left behind", () => {
    const el = fakeElement() as HTMLElement & { hidden: boolean };
    renderUsageModel(el, { id: "claude-opus-5", displayName: "Opus 5" });
    expect(el.textContent).toBe("Opus 5");
    renderUsageModel(el, null);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });
});

// Plan usage-model-bar: `renderModelWeek` needs more than the plain `.lbl`/`.num` span
// pair `FakeDomNode` above models — it builds a `<select>` with `disabled`/`value`
// properties and a `change` listener, and toggles `.stale`/`title` directly on the
// container. `FakeDomNodeRich` extends the same minimal-DOM-stand-in approach (see the
// comment on `FakeDomNode` above) with exactly those extra primitives, still without
// jsdom (docs/conventions.md: DOM construction is Playwright's job; this is pure logic —
// which child nodes exist, in which order, with which text/attributes).
class FakeDomNodeRich {
  readonly tagName: string;
  className = "";
  disabled = false;
  value = "";
  title = "";
  readonly style: Record<string, string> = {};
  private attrs = new Map<string, string>();
  private listeners = new Map<string, (() => void)[]>();
  private children: FakeDomNodeRich[] = [];
  private ownText = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  get textContent(): string {
    return this.children.length > 0 ? this.children.map((c) => c.textContent).join("") : this.ownText;
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  get classList(): { toggle: (name: string, force?: boolean) => void; contains: (name: string) => boolean } {
    return {
      toggle: (name: string, force?: boolean) => {
        const classes = new Set(this.className.split(" ").filter(Boolean));
        const shouldHave = force === undefined ? !classes.has(name) : force;
        if (shouldHave) classes.add(name);
        else classes.delete(name);
        this.className = Array.from(classes).join(" ");
      },
      contains: (name: string) => this.className.split(" ").filter(Boolean).includes(name),
    };
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
    if (name === "title") this.title = "";
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatch(type: string): void {
    (this.listeners.get(type) ?? []).forEach((l) => l());
  }

  appendChild(child: FakeDomNodeRich): FakeDomNodeRich {
    this.children.push(child);
    return child;
  }

  insertBefore(newNode: FakeDomNodeRich, referenceNode: FakeDomNodeRich | null): FakeDomNodeRich {
    const index = referenceNode ? this.children.indexOf(referenceNode) : -1;
    if (index === -1) this.children.push(newNode);
    else this.children.splice(index, 0, newNode);
    return newNode;
  }

  replaceChildren(...nodes: FakeDomNodeRich[]): void {
    this.children = nodes;
  }

  querySelector(selector: string): FakeDomNodeRich | null {
    const wanted = selector.replace(/^\./, "");
    return this.children.find((c) => c.className.split(" ").includes(wanted)) ?? null;
  }

  nodes(): FakeDomNodeRich[] {
    return this.children;
  }

  childClasses(): string[] {
    return this.children.map((c) => c.className);
  }

  optionTexts(): string[] {
    return this.children.filter((c) => c.tagName === "option").map((c) => c.textContent);
  }
}

describe("renderModelWeek (plan usage-model-bar REQ-9/REQ-10/REQ-11/REQ-12, INV-2/INV-3)", () => {
  const now = new Date("2026-08-30T10:00:00Z");
  const fable: ModelWindow = { displayName: "Fable", usedPct: 61.0, resetsAt: "2026-09-01T13:59:59Z" };
  const opus: ModelWindow = { displayName: "Opus", usedPct: 20.0, resetsAt: "2026-09-01T13:59:59Z" };
  const baseUsage: Usage = { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" };

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeDomNodeRich(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNodeRich {
    return new FakeDomNodeRich("div");
  }

  it("renders unknown with a disabled single-option select when modelScoped is null (no data yet)", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: null, modelScopedAt: null, modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());

    expect(el.childClasses()).toEqual(["lbl usage-model-select", "num"]);
    const [select, num] = el.nodes();
    expect(select!.getAttribute("aria-label")).toBe("Usage model");
    expect(select!.disabled).toBe(true);
    expect(select!.optionTexts()).toEqual(["Fable"]);
    expect(num!.textContent).toBe("unknown");
    expect(el.classList.contains("stale")).toBe(false);
  });

  it("renders unknown with a disabled select when modelScoped is undefined (pre-plan daemon payload)", () => {
    const el = container();
    renderModelWeek(el as unknown as HTMLElement, baseUsage, "Fable", now, vi.fn());

    const [select, num] = el.nodes();
    expect(select!.disabled).toBe(true);
    expect(select!.optionTexts()).toEqual(["Fable"]);
    expect(num!.textContent).toBe("unknown");
  });

  it("renders unknown with a disabled select when modelScoped is an empty list (successful fetch, no scoped windows)", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [], modelScopedAt: "2026-08-30T09:59:00Z", modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());

    const [select, num] = el.nodes();
    expect(select!.disabled).toBe(true);
    expect(select!.optionTexts()).toEqual(["Fable"]);
    expect(num!.textContent).toBe("unknown");
  });

  it("renders the selected model's bar/percent/resets when it is present in a non-null list (REQ-9)", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [fable, opus], modelScopedAt: "2026-08-30T09:59:00Z", modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());

    expect(el.childClasses()).toEqual(["lbl usage-model-select", "bar warn", "num", "resets"]);
    const [select, , num, resets] = el.nodes();
    expect(select!.disabled).toBe(false);
    expect(select!.optionTexts()).toEqual(["Fable", "Opus"]);
    expect(select!.value).toBe("Fable");
    expect(num!.textContent).toBe("61%");
    expect(resets!.textContent).toBe(`· ${formatResets(fable.resetsAt, now)}`);
  });

  it("applies the warn modifier at or above 60% and omits it below (design-system §5 threshold)", () => {
    const belowWarn: ModelWindow = { ...fable, usedPct: 59.9 };
    const elBelow = container();
    renderModelWeek(
      elBelow as unknown as HTMLElement,
      { ...baseUsage, modelScoped: [belowWarn], modelScopedError: null },
      "Fable",
      now,
      vi.fn(),
    );
    expect(elBelow.querySelector(".bar")?.className).toBe("bar");

    const atWarn: ModelWindow = { ...fable, usedPct: 60 };
    const elAt = container();
    renderModelWeek(elAt as unknown as HTMLElement, { ...baseUsage, modelScoped: [atWarn], modelScopedError: null }, "Fable", now, vi.fn());
    expect(elAt.querySelector(".bar")?.className).toBe("bar warn");
  });

  it("renders unknown with zero track markup when the selected pref names a model absent from a non-null list (REQ-10/INV-2)", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Sonnet", now, vi.fn());

    expect(el.childClasses()).toEqual(["lbl usage-model-select", "num"]);
    const [select, num] = el.nodes();
    expect(select!.disabled).toBe(false);
    // Fix Attempt 1 (Minor 3): a pref naming a model absent from a non-null list gets a
    // synthesized, disabled placeholder option prepended — showing the pref name instead
    // of leaving the select blank at selectedIndex -1 — while the honesty rule (the number
    // readout, no track markup) is unaffected.
    expect(select!.optionTexts()).toEqual(["Sonnet", "Fable", "Opus"]);
    const [placeholder] = select!.nodes();
    expect(placeholder!.disabled).toBe(true);
    expect(select!.value).toBe("Sonnet");
    expect(num!.textContent).toBe("unknown");
  });

  it("adds .stale and a title = the error word while keeping the last-good bar (REQ-11/INV-3)", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [fable], modelScopedError: "unauthorized" };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());

    expect(el.classList.contains("stale")).toBe(true);
    expect(el.title).toBe("unauthorized");
    // The last-good bucket is still rendered — the error never discards it.
    const num = el.querySelector(".num");
    expect(num?.textContent).toBe("61%");
    expect(el.querySelector(".bar")).not.toBeNull();
  });

  it("clears .stale and the title on the next error-free render (self-healing, matches renderBucket's pattern)", () => {
    const el = container();
    renderModelWeek(
      el as unknown as HTMLElement,
      { ...baseUsage, modelScoped: [fable], modelScopedError: "unreachable" },
      "Fable",
      now,
      vi.fn(),
    );
    expect(el.classList.contains("stale")).toBe(true);

    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable], modelScopedError: null }, "Fable", now, vi.fn());
    expect(el.classList.contains("stale")).toBe(false);
    expect(el.title).toBe("");
  });

  it.each(["no-credentials", "unauthorized", "unreachable"] as const)("uses %s verbatim as the title", (errorKind) => {
    const el = container();
    renderModelWeek(
      el as unknown as HTMLElement,
      { ...baseUsage, modelScoped: null, modelScopedError: errorKind },
      "Fable",
      now,
      vi.fn(),
    );
    expect(el.title).toBe(errorKind);
  });

  it("invokes the onSelectModel callback with the new value on a select change event (REQ-12)", () => {
    const el = container();
    const onSelect = vi.fn();
    const usage: Usage = { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, onSelect);

    const [select] = el.nodes();
    select!.value = "Opus";
    select!.dispatch("change");
    expect(onSelect).toHaveBeenCalledWith("Opus");
  });

  it("rebuilds when the option list changes — a known -> unknown transition leaves no stale bar/resets behind (self-healing)", () => {
    const el = container();
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable], modelScopedError: null }, "Fable", now, vi.fn());
    expect(el.childClasses()).toContain("bar warn");

    // Selected model removed from the next list (["Fable"] -> ["Fable", "Opus"], since the
    // absent-pref placeholder now keeps "Fable" in the option set) — the known -> unknown
    // honesty transition, and a genuine option-list change, so this is one of the cases
    // that legitimately still rebuilds (see the node-reuse describe block below for the
    // steady-state case that must NOT rebuild).
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [opus], modelScopedError: null }, "Fable", now, vi.fn());
    expect(el.childClasses()).toEqual(["lbl usage-model-select", "num"]);
    expect(el.querySelector(".num")?.textContent).toBe("unknown");
  });
});

// Fix Attempt 1 (review cycle 1, Critical 1): the `<select>` used to be torn down and
// rebuilt via `el.replaceChildren` on every render pass, which detaches an already-attached
// node — blurring focus and always closing a native `<select>` popup, even on a plain 1s
// re-render tick with unchanged data (the common case, since `modelScoped` only refreshes on
// a ~5-min poll). These tests pin the fixed contract: the same `<select>` node instance
// (and the `.num`/`.bar`/`.resets` siblings) persists across renders whenever the option-name
// sequence is unchanged, and only a genuine option-list change is allowed to replace it.
describe("renderModelWeek — node reuse across render passes (review cycle 1, Critical 1)", () => {
  const now = new Date("2026-08-30T10:00:00Z");
  const fable: ModelWindow = { displayName: "Fable", usedPct: 61.0, resetsAt: "2026-09-01T13:59:59Z" };
  const opus: ModelWindow = { displayName: "Opus", usedPct: 20.0, resetsAt: "2026-09-01T13:59:59Z" };
  const baseUsage: Usage = { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" };

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeDomNodeRich(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function container(): FakeDomNodeRich {
    return new FakeDomNodeRich("div");
  }

  it("keeps the same <select> node instance across a re-render with an unchanged option list, updating only .value/.disabled in place", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());

    const [select1, , num1, resets1] = el.nodes();
    expect(select1!.value).toBe("Fable");
    expect(select1!.disabled).toBe(false);

    // Same names ["Fable", "Opus"] — only the selection and the bucket values differ.
    renderModelWeek(el as unknown as HTMLElement, usage, "Opus", now, vi.fn());

    const [select2, , num2, resets2] = el.nodes();
    expect(select2).toBe(select1); // identity, not just equality — the node was never detached
    expect(num2).toBe(num1);
    expect(resets2).toBe(resets1);
    expect(select2!.value).toBe("Opus");
    expect(select2!.optionTexts()).toEqual(["Fable", "Opus"]);
    // Values updated in place, not by rebuilding — no duplicate nodes appended.
    expect(el.nodes().length).toBe(4);
    expect(num2!.textContent).toBe("20%");
  });

  it("toggles select.disabled in place (true -> false) across the loading -> loaded transition when the option list is unchanged", () => {
    const el = container();
    // "No data yet": modelScoped null, so the single-option list is just the pref name.
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: null, modelScopedError: null }, "Fable", now, vi.fn());
    const [select1, num1] = el.nodes();
    expect(select1!.disabled).toBe(true);
    expect(select1!.optionTexts()).toEqual(["Fable"]);
    expect(el.nodes().length).toBe(2); // no bar/resets while the bucket is null

    // Data arrives, and it happens to be the same single-name list ["Fable"] — names are
    // unchanged, so this must reuse the same select/num nodes rather than rebuilding, while
    // still picking up disabled=false and the newly-available bar/resets.
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable], modelScopedError: null }, "Fable", now, vi.fn());
    const [select2, , num2] = el.nodes();
    expect(select2).toBe(select1);
    expect(num2).toBe(num1);
    expect(select2!.disabled).toBe(false);
    expect(num2!.textContent).toBe("61%");
    expect(el.nodes().length).toBe(4); // bar + resets newly appended, select/num not duplicated
  });

  it("does not duplicate bar/num/resets nodes across repeated renders of an unchanged bucket", () => {
    const el = container();
    const usage: Usage = { ...baseUsage, modelScoped: [fable], modelScopedError: null };
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());
    const firstPass = el.nodes();
    expect(firstPass.length).toBe(4);

    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());
    renderModelWeek(el as unknown as HTMLElement, usage, "Fable", now, vi.fn());
    const thirdPass = el.nodes();

    expect(thirdPass.length).toBe(4);
    expect(thirdPass[0]).toBe(firstPass[0]); // select
    expect(thirdPass[1]).toBe(firstPass[1]); // bar
    expect(thirdPass[2]).toBe(firstPass[2]); // num
    expect(thirdPass[3]).toBe(firstPass[3]); // resets
  });

  it("rebuilds a brand-new <select> node when the option list actually changes", () => {
    const el = container();
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable], modelScopedError: null }, "Fable", now, vi.fn());
    const [select1] = el.nodes();
    expect(select1!.optionTexts()).toEqual(["Fable"]);

    // Option set genuinely grows from ["Fable"] to ["Fable", "Opus"] — a real change of
    // choices, which is the one path still allowed to replace the node.
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null }, "Fable", now, vi.fn());
    const [select2] = el.nodes();
    expect(select2).not.toBe(select1);
    expect(select2!.optionTexts()).toEqual(["Fable", "Opus"]);
  });

  it("re-wires the change listener onto the rebuilt node so onSelectModel still fires after an option-list rebuild", () => {
    const el = container();
    const onSelectFirst = vi.fn();
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [fable], modelScopedError: null }, "Fable", now, onSelectFirst);

    const onSelectSecond = vi.fn();
    renderModelWeek(
      el as unknown as HTMLElement,
      { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null },
      "Fable",
      now,
      onSelectSecond,
    );

    const [select] = el.nodes();
    select!.value = "Opus";
    select!.dispatch("change");
    expect(onSelectSecond).toHaveBeenCalledWith("Opus");
    expect(onSelectFirst).not.toHaveBeenCalled();
  });

  // Fix Attempt 2 (review cycle 2, Major 1): `names` alone collides across a placeholder
  // flip — pref "Fable" against list [Opus] (placeholder needed) and pref "Fable" against
  // list [Fable, Opus] (no placeholder) both produce the identical sequence
  // ["Fable", "Opus"]. Before the fix the reuse branch took this for "unchanged" and never
  // re-synced the Fable option's `disabled` flag, so a live, listed model stayed
  // permanently unselectable. `placeholderNeeded` is now part of the cached state, so a
  // flip in it forces the rebuild path even when `names` itself is unchanged.
  it("rebuilds the select — not just reuse — when a placeholder flip leaves the name sequence unchanged (list gains the pref model)", () => {
    const el = container();
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [opus], modelScopedError: null }, "Fable", now, vi.fn());
    const [select1] = el.nodes();
    expect(select1!.optionTexts()).toEqual(["Fable", "Opus"]);
    const [placeholder1] = select1!.nodes();
    expect(placeholder1!.disabled).toBe(true);

    // The endpoint now includes "Fable" too: placeholderNeeded flips true -> false, but
    // the resulting name sequence is still exactly ["Fable", "Opus"] — the collision
    // Major 1 found.
    renderModelWeek(
      el as unknown as HTMLElement,
      { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null },
      "Fable",
      now,
      vi.fn(),
    );
    const [select2] = el.nodes();
    expect(select2).not.toBe(select1); // identity change: the placeholder flip forced a rebuild
    expect(select2!.optionTexts()).toEqual(["Fable", "Opus"]);
    const [fableOption] = select2!.nodes();
    expect(fableOption!.disabled).toBe(false); // Fable is now a live, listed, selectable window
  });

  it("rebuilds the select when a placeholder flip leaves the name sequence unchanged (list loses the pref model, reverse of the above)", () => {
    const el = container();
    renderModelWeek(
      el as unknown as HTMLElement,
      { ...baseUsage, modelScoped: [fable, opus], modelScopedError: null },
      "Fable",
      now,
      vi.fn(),
    );
    const [select1] = el.nodes();
    expect(select1!.optionTexts()).toEqual(["Fable", "Opus"]);
    const [fableOption1] = select1!.nodes();
    expect(fableOption1!.disabled).toBe(false);

    // The endpoint drops "Fable": placeholderNeeded flips false -> true, but the name
    // sequence is still exactly ["Fable", "Opus"] (the synthesized placeholder reuses the
    // pref name as names[0]).
    renderModelWeek(el as unknown as HTMLElement, { ...baseUsage, modelScoped: [opus], modelScopedError: null }, "Fable", now, vi.fn());
    const [select2] = el.nodes();
    expect(select2).not.toBe(select1); // identity change: the placeholder flip forced a rebuild
    expect(select2!.optionTexts()).toEqual(["Fable", "Opus"]);
    const [placeholder2] = select2!.nodes();
    expect(placeholder2!.disabled).toBe(true); // Fable is once again the disabled placeholder
  });
});
