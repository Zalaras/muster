import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHoverTip, POPOVER_DELAY_MS } from "./hovertip";

// No DOM here: a minimal element records what is appended to the body and removed again.
let bodyKids: El[] = [];

class El {
  readonly style: Record<string, string> = {};
  readonly offsetWidth = 100;
  readonly offsetHeight = 50;
  readonly listeners = new Map<string, () => void>();
  constructor(readonly label = "") {}
  remove(): void {
    const i = bodyKids.indexOf(this);
    if (i >= 0) bodyKids.splice(i, 1);
  }
  addEventListener(type: string, fn: () => void): void {
    this.listeners.set(type, fn);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  getBoundingClientRect() {
    return { left: 10, right: 110, top: 10, bottom: 30 };
  }
}

interface Model {
  text: string;
}

beforeEach(() => {
  bodyKids = [];
  vi.useFakeTimers();
  vi.stubGlobal("document", { body: { append: (el: El) => bodyKids.push(el) } });
  vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 800 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(initial: Model | null) {
  let current = initial;
  const build = vi.fn((m: Model) => new El(m.text) as unknown as HTMLElement);
  const tip = createHoverTip<Model>(build);
  const anchorEl = new El("anchor");
  return {
    tip,
    anchorEl,
    anchor: anchorEl as unknown as HTMLElement,
    model: () => current,
    build,
    set: (m: Model | null) => {
      current = m;
    },
    labels: () => bodyKids.map((k) => k.label),
  };
}

describe("createHoverTip.show", () => {
  it("opens a panel built from the model", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    expect(s.labels()).toEqual(["a"]);
  });

  it("does nothing on a null model, and closes any panel already open", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    s.set(null);
    s.tip.show(s.anchor, s.model);
    expect(s.labels()).toEqual([]);
    expect(s.build).toHaveBeenCalledTimes(1);
  });

  it("showing again never leaves two panels", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    s.tip.show(s.anchor, s.model);
    expect(bodyKids).toHaveLength(1);
  });
});

describe("createHoverTip.refresh", () => {
  it("does nothing while closed", () => {
    const s = setup({ text: "a" });
    s.tip.refresh();
    expect(s.build).not.toHaveBeenCalled();
    expect(bodyKids).toHaveLength(0);
  });

  it("keeps the same node when the model is equal (a new object with equal content)", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    const node = bodyKids[0];
    s.set({ text: "a" });
    s.tip.refresh();
    expect(bodyKids).toHaveLength(1);
    expect(bodyKids[0]).toBe(node);
    expect(s.build).toHaveBeenCalledTimes(1);
  });

  it("rebuilds a changed model: the old node is gone, the new one is the only panel", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    const old = bodyKids[0];
    s.set({ text: "b" });
    s.tip.refresh();
    expect(bodyKids).toHaveLength(1);
    expect(bodyKids[0]).not.toBe(old);
    expect(s.labels()).toEqual(["b"]);
  });

  it("a rebuilt panel is the new baseline: a second refresh on the same model keeps it", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    s.set({ text: "b" });
    s.tip.refresh();
    s.tip.refresh();
    expect(s.build).toHaveBeenCalledTimes(2);
  });

  it("closes when the model is now null, and stays closed on later refreshes", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    s.set(null);
    s.tip.refresh();
    expect(bodyKids).toHaveLength(0);
    s.set({ text: "a" });
    s.tip.refresh();
    expect(bodyKids).toHaveLength(0);
  });

  it("does nothing after close()", () => {
    const s = setup({ text: "a" });
    s.tip.show(s.anchor, s.model);
    s.tip.close();
    s.set({ text: "b" });
    s.tip.refresh();
    expect(bodyKids).toHaveLength(0);
  });

  it("a panel opened by hover is refreshable too", () => {
    const s = setup({ text: "a" });
    s.tip.attachHover(s.anchor, s.model);
    s.anchorEl.listeners.get("mouseenter")?.();
    vi.advanceTimersByTime(POPOVER_DELAY_MS);
    s.set({ text: "b" });
    s.tip.refresh();
    expect(s.labels()).toEqual(["b"]);
  });
});
