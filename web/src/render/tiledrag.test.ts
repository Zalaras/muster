// tiledrag.ts is DOM event-wiring glue (delegated listeners mapping DOM events to
// session ids, calling back into main.ts) — per docs/conventions.md, "interaction and
// rendering are Playwright's job", and e2e/actions.spec.ts's REQ-10/E6 already covers the
// real-browser drag+focus behaviour end to end (a focused tile-footer button surviving a
// drag-drop reorder). This file does NOT re-test that: no template cloning, no visual
// `.dragging`/`.drop-target` class assertions (already Playwright's/E2E's, see plan
// move-tiles Testable UI Elements), no rendering.
//
// What IS a pinnable unit here, added in web-impl's Fix Attempt 2: the *sequencing*
// decision that the focused-control snapshot is taken on the drag's initiating
// `mousedown` (before `dragstart`, before the browser's own blur-on-mousedown default
// action can run) and threaded through to `onMove` exactly once per drag — never reused
// by a later, unrelated drag. That's glue logic, not rendering, and it is invisible to a
// real-browser test that only ever asserts the end state (focus restored) — a race here
// would flake in exactly the way the E2E validate agent originally caught, so pinning the
// sequencing itself (independent of the real blur timing) is worth a fast, deterministic
// unit test.
//
// Technique matches render/focus.test.ts's own precedent for the same seam
// (captureFocusedControl): minimal hand-rolled stand-ins for just the DOM surface
// tiledrag.ts actually touches (closest/classList/dataset), with `globalThis.Element`
// patched so tiledrag.ts's `instanceof Element` guards resolve — not a jsdom/DOM-simulation
// suite. `./focus`'s own capture logic is mocked out (it's already covered by
// focus.test.ts) so this file tests only tiledrag.ts's use of it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusedControl } from "./focus";

const { captureFocusedControl } = vi.hoisted(() => ({ captureFocusedControl: vi.fn() }));
vi.mock("./focus", () => ({ captureFocusedControl }));

const { installTileDrag } = await import("./tiledrag");

class FakeClassList {
  private readonly classes = new Set<string>();
  add(c: string): void {
    this.classes.add(c);
  }
  remove(c: string): void {
    this.classes.delete(c);
  }
  contains(c: string): boolean {
    return this.classes.has(c);
  }
}

/** Just enough of `Element` for tileOf/sessionIdOf's `closest`/`dataset` walk — see file
 * header. Each instance "matches" only the selectors it was built with, mirroring how a
 * real `.thead`/`article.tile` element would answer `matches()` inside `closest()`. */
class FakeElement {
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  parent: FakeElement | null = null;
  private readonly selectors: Set<string>;

  constructor(selectors: string[] = []) {
    this.selectors = new Set(selectors);
  }

  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this;
    while (node) {
      if (node.selectors.has(selector)) return node;
      node = node.parent;
    }
    return null;
  }
}

function makeTile(id: number): { tile: FakeElement; thead: FakeElement; body: FakeElement } {
  const tile = new FakeElement(["article.tile"]);
  tile.dataset["sessionId"] = String(id);
  const thead = new FakeElement([".thead"]);
  thead.parent = tile;
  const body = new FakeElement([".tbody-slot"]);
  body.parent = tile;
  return { tile, thead, body };
}

function fakeDataTransfer(): { setData: ReturnType<typeof vi.fn>; effectAllowed?: string; dropEffect?: string } {
  return { setData: vi.fn() };
}

type Handler = (event: unknown) => void;

/** Stands in for `gridEl`: records the delegated listeners `installTileDrag` registers so
 * a test can fire them directly with a synthetic event, in the exact sequence a real drag
 * would (mousedown -> dragstart -> drop), without simulating real browser DnD dispatch. */
class FakeGrid {
  private readonly listeners = new Map<string, Handler[]>();
  addEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
}

const SNAPSHOT: FocusedControl = { sessionId: 9, action: "end", element: {} as unknown as Element };

describe("installTileDrag — pre-blur focus snapshot passthrough (Fix Attempt 2, REQ-10)", () => {
  let savedElement: unknown;

  beforeEach(() => {
    savedElement = (globalThis as { Element?: unknown }).Element;
    (globalThis as { Element: unknown }).Element = FakeElement;
    captureFocusedControl.mockReset();
  });

  afterEach(() => {
    (globalThis as { Element: unknown }).Element = savedElement;
  });

  it("captures the snapshot on mousedown inside .thead, before dragstart, and hands it to onMove on drop", () => {
    const grid = new FakeGrid();
    const onMove = vi.fn();
    installTileDrag(grid as unknown as HTMLElement, onMove);
    const a = makeTile(1);
    const b = makeTile(2);
    captureFocusedControl.mockReturnValueOnce(SNAPSHOT);

    grid.dispatch("mousedown", { target: a.thead });
    expect(captureFocusedControl).toHaveBeenCalledExactlyOnceWith(grid);

    grid.dispatch("dragstart", { target: a.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("drop", { target: b.tile, preventDefault: vi.fn() });

    expect(onMove).toHaveBeenCalledExactlyOnceWith(1, 2, SNAPSHOT);
  });

  it("does not capture a snapshot when the initiating mousedown lands outside any .thead", () => {
    const grid = new FakeGrid();
    const onMove = vi.fn();
    installTileDrag(grid as unknown as HTMLElement, onMove);
    const a = makeTile(1);
    const b = makeTile(2);

    grid.dispatch("mousedown", { target: a.body });
    expect(captureFocusedControl).not.toHaveBeenCalled();

    grid.dispatch("dragstart", { target: a.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("drop", { target: b.tile, preventDefault: vi.fn() });

    expect(onMove).toHaveBeenCalledExactlyOnceWith(1, 2, null);
  });

  it("consumes the snapshot once: a later drag with no fresh mousedown never reuses a prior drag's snapshot", () => {
    const grid = new FakeGrid();
    const onMove = vi.fn();
    installTileDrag(grid as unknown as HTMLElement, onMove);
    const a = makeTile(1);
    const b = makeTile(2);
    captureFocusedControl.mockReturnValueOnce(SNAPSHOT);

    grid.dispatch("mousedown", { target: a.thead });
    grid.dispatch("dragstart", { target: a.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("drop", { target: b.tile, preventDefault: vi.fn() });
    expect(onMove).toHaveBeenNthCalledWith(1, 1, 2, SNAPSHOT);

    // Second drag: no mousedown fires this time (captureFocusedControl is not called
    // again — mockReturnValueOnce above is already consumed). If the module held onto
    // the first drag's snapshot instead of clearing it, this drop would wrongly receive
    // SNAPSHOT a second time.
    grid.dispatch("dragstart", { target: b.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("drop", { target: a.tile, preventDefault: vi.fn() });
    expect(onMove).toHaveBeenNthCalledWith(2, 2, 1, null);
  });

  it("clears the snapshot on an aborted drag (dragend without drop, e.g. Escape) — it does not leak into the next drag", () => {
    const grid = new FakeGrid();
    const onMove = vi.fn();
    installTileDrag(grid as unknown as HTMLElement, onMove);
    const a = makeTile(1);
    const b = makeTile(2);
    captureFocusedControl.mockReturnValueOnce(SNAPSHOT);

    grid.dispatch("mousedown", { target: a.thead });
    grid.dispatch("dragstart", { target: a.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("dragend", {}); // Escape / dropped outside any valid target — no "drop" fires
    expect(onMove).not.toHaveBeenCalled();

    // A fresh drag with no mousedown must see a clean (null) snapshot, not the aborted
    // drag's leftover one.
    grid.dispatch("dragstart", { target: b.thead, dataTransfer: fakeDataTransfer() });
    grid.dispatch("drop", { target: a.tile, preventDefault: vi.fn() });
    expect(onMove).toHaveBeenCalledExactlyOnceWith(2, 1, null);
  });
});
