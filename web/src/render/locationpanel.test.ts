import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationPanelModel } from "../sessions/locationpanel";
import { POPOVER_DELAY_MS } from "./hovertip";
import { createLocationPanel } from "./locationpanel";

// No DOM in this environment: a minimal element stands in for the panel and the anchor, enough
// to observe what the controller builds, where it appends it and when it removes it.
let bodyKids: El[] = [];

class El {
  className = "";
  textContent = "";
  readonly attrs = new Map<string, string>();
  readonly kids: Array<El | string> = [];
  readonly style: Record<string, string> = {};
  readonly offsetWidth = 100;
  readonly offsetHeight = 50;
  readonly listeners = new Map<string, () => void>();
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  append(...nodes: Array<El | string>): void {
    this.kids.push(...nodes);
  }
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
  fire(type: string): void {
    this.listeners.get(type)?.();
  }
  /** Every descendant's text in document order with its element's class ("" for a bare string). */
  flat(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const walk = (node: El | string): void => {
      if (typeof node === "string") {
        out.push(["", node]);
        return;
      }
      if (node.textContent) out.push([node.className, node.textContent]);
      node.kids.forEach(walk);
    };
    this.kids.forEach(walk);
    return out;
  }
}

const model: LocationPanelModel = {
  launch: { folder: "muster", branch: "main", path: "/Users/bob/code/muster" },
  claudeAt: null,
  added: {
    heading: "Added directories · 2",
    rows: [
      { folder: "infra", branch: "main", path: "/Users/bob/code/infra" },
      { folder: "scratch", branch: null, path: "/tmp/scratch" },
    ],
  },
};

beforeEach(() => {
  bodyKids = [];
  vi.useFakeTimers();
  vi.stubGlobal("document", {
    createElement: () => new El(),
    body: { append: (el: El) => bodyKids.push(el) },
  });
  vi.stubGlobal("window", { innerWidth: 1280, innerHeight: 800 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(read: () => LocationPanelModel | null = () => model) {
  const panel = createLocationPanel();
  const anchor = new El();
  const detach = panel.attach(anchor as unknown as HTMLElement, read);
  return { panel, anchor, detach };
}

function open(anchor: El): void {
  anchor.fire("mouseenter");
  vi.advanceTimersByTime(POPOVER_DELAY_MS);
}

describe("createLocationPanel (REQ-7, REQ-9)", () => {
  it("opens nothing before the delay, then one tooltip appended to body", () => {
    const { anchor } = setup();
    anchor.fire("mouseenter");
    vi.advanceTimersByTime(POPOVER_DELAY_MS - 1);
    expect(bodyKids).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(bodyKids).toHaveLength(1);
    const panel = bodyKids[0] as El;
    expect(panel.className).toBe("pop loc-pop");
    expect(panel.attrs.get("role")).toBe("tooltip");
  });

  it("uses the group popover's 350 ms delay", () => {
    expect(POPOVER_DELAY_MS).toBe(350);
  });

  it("builds the heading, the launch row, the sub-heading and the added rows in order", () => {
    const { anchor } = setup();
    open(anchor);
    expect((bodyKids[0] as El).flat().map(([, text]) => text)).toEqual([
      "Location",
      "muster",
      " · main",
      "/Users/bob/code/muster",
      "Added directories · 2",
      "infra",
      " · main",
      "/Users/bob/code/infra",
      "scratch",
      "/tmp/scratch",
    ]);
  });

  it("shows no sub-heading when nothing is added, and a `↳` lead on the claudeAt row", () => {
    const { anchor } = setup(() => ({
      launch: model.launch,
      claudeAt: { folder: "e7b", branch: null, path: "/w/e7b" },
      added: null,
    }));
    open(anchor);
    const flat = (bodyKids[0] as El).flat();
    expect(flat.some(([cls]) => cls === "sub")).toBe(false);
    expect(flat).toContainEqual(["lead", "↳"]);
  });

  it("leaving before the delay cancels the open", () => {
    const { anchor } = setup();
    anchor.fire("mouseenter");
    vi.advanceTimersByTime(POPOVER_DELAY_MS - 10);
    anchor.fire("mouseleave");
    vi.advanceTimersByTime(1000);
    expect(bodyKids).toHaveLength(0);
  });

  for (const event of ["mouseleave", "pointerdown"]) {
    it(`${event} closes an open panel`, () => {
      const { anchor } = setup();
      open(anchor);
      expect(bodyKids).toHaveLength(1);
      anchor.fire(event);
      expect(bodyKids).toHaveLength(0);
    });
  }

  it("close() removes the panel and is safe to call twice", () => {
    const { anchor, panel } = setup();
    open(anchor);
    panel.close();
    panel.close();
    expect(bodyKids).toHaveLength(0);
  });

  it("close() cancels a pending open", () => {
    const { anchor, panel } = setup();
    anchor.fire("mouseenter");
    panel.close();
    vi.advanceTimersByTime(1000);
    expect(bodyKids).toHaveLength(0);
  });

  it("re-entering never leaves two panels", () => {
    const { anchor } = setup();
    open(anchor);
    open(anchor);
    expect(bodyKids).toHaveLength(1);
  });

  it("opens nothing when the model is null (no focused session)", () => {
    const { anchor } = setup(() => null);
    open(anchor);
    expect(bodyKids).toHaveLength(0);
  });

  it("reads the model at open, not at attach", () => {
    const read = vi.fn(() => model);
    const { anchor } = setup(read);
    expect(read).not.toHaveBeenCalled();
    open(anchor);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("the detach function removes the listeners", () => {
    const { anchor, detach } = setup();
    detach();
    expect(anchor.listeners.size).toBe(0);
  });
  // The focus view calls refresh() on every render pass (features/focus.ts renderView).
  describe("refresh() — the open panel follows the focused session", () => {
    const texts = () => (bodyKids[0] as El).flat().map(([, text]) => text);

    it("an added directory's branch change shows without reopening", () => {
      let current: LocationPanelModel | null = model;
      const { anchor, panel } = setup(() => current);
      open(anchor);
      current = {
        ...model,
        added: {
          heading: model.added!.heading,
          rows: [{ ...model.added!.rows[0]!, branch: "wip" }],
        },
      };
      panel.refresh();
      expect(bodyKids).toHaveLength(1);
      expect(texts()).toContain(" · wip");
    });

    it("the session ending drops the Added section and keeps the Location row", () => {
      let current: LocationPanelModel | null = model;
      const { anchor, panel } = setup(() => current);
      open(anchor);
      current = { ...model, added: null };
      panel.refresh();
      expect(texts()).toEqual(["Location", "muster", " · main", "/Users/bob/code/muster"]);
    });

    it("the focused session going away closes the panel", () => {
      let current: LocationPanelModel | null = model;
      const { anchor, panel } = setup(() => current);
      open(anchor);
      current = null;
      panel.refresh();
      expect(bodyKids).toHaveLength(0);
    });

    it("an unchanged model keeps the very same node; a closed panel stays closed", () => {
      const { anchor, panel } = setup(() => ({ ...model }));
      panel.refresh();
      expect(bodyKids).toHaveLength(0);
      open(anchor);
      const node = bodyKids[0];
      panel.refresh();
      expect(bodyKids[0]).toBe(node);
    });
  });
});
