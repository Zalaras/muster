import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeCodeInfo, Density, SessionModelInfo, Usage } from "../protocol";
import { formatResets } from "../sessions/format";
import {
  renderClaudeVersion,
  renderConnectionStatus,
  renderDensityControl,
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

describe("renderClaudeVersion", () => {
  it("renders 'claude unknown' when no hello has arrived yet (info is null)", () => {
    const el = fakeElement();
    renderClaudeVersion(el, null);
    expect(el.textContent).toBe("claude unknown");
  });

  it("renders installed-unknown when installed is null, regardless of drift (protocol §5.1: null renders as unknown, never drift)", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: null, drift: null };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.233 (installed unknown)");
  });

  it("renders drift text when drift is true", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: "2.1.240", drift: true };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.240 (drift from pinned 2.1.233)");
  });

  it("renders the plain installed version when drift is false", () => {
    const el = fakeElement();
    const info: ClaudeCodeInfo = { pinned: "2.1.233", installed: "2.1.233", drift: false };
    renderClaudeVersion(el, info);
    expect(el.textContent).toBe("claude 2.1.233");
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
