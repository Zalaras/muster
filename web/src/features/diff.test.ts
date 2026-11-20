import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDiffSummary } from "../api/diff";
import { initDiff } from "./diff";

vi.mock("../api/diff", () => ({ fetchDiffSummary: vi.fn() }));
vi.mock("./diffviewer", () => ({ createViewer: vi.fn() }));
vi.mock("../storage", () => ({
  safeLocalStorage: () => null,
  readJson: (_s: unknown, _k: string, _p: unknown, fallback: unknown) => fallback,
  writeJson: vi.fn(),
}));

const fetchSummary = vi.mocked(fetchDiffSummary);

interface Doc {
  hidden: boolean;
  activeElement: null;
  listeners: Map<string, () => void>;
}

function stubDocument(): Doc {
  const doc: Doc = { hidden: false, activeElement: null, listeners: new Map() };
  const button = {
    hidden: false,
    textContent: "",
    title: "",
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
  };
  vi.stubGlobal("document", {
    get hidden() {
      return doc.hidden;
    },
    activeElement: null,
    querySelector: () => button,
    addEventListener: (type: string, fn: () => void) => doc.listeners.set(type, fn),
  });
  return doc;
}

function app(view: "focus" | "grid", focusedId: number | null) {
  return {
    state: { view, focusedId },
    onRender: vi.fn(),
    on: vi.fn(),
    render: vi.fn(),
  };
}

const flushPromises = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => {
  vi.useFakeTimers();
  fetchSummary.mockReset();
  fetchSummary.mockResolvedValue({
    ok: false,
    error: { code: "network_error", message: "x" },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("diff — summary polling (W4, edge case 20)", () => {
  it("makes no diff/summary request while the page is hidden, and one on return to visible", async () => {
    const doc = stubDocument();
    initDiff(app("focus", 3) as never, {
      surfaces: { focusSelected: vi.fn() },
    });

    doc.hidden = true;
    vi.advanceTimersByTime(20_000);
    await flushPromises();
    expect(fetchSummary).not.toHaveBeenCalled();

    doc.hidden = false;
    doc.listeners.get("visibilitychange")?.();
    await flushPromises();
    expect(fetchSummary).toHaveBeenCalledTimes(1);
    expect(fetchSummary).toHaveBeenCalledWith(3);
  });

  it("polls the focused session every 5 s while visible", async () => {
    stubDocument();
    initDiff(app("focus", 3) as never, {
      surfaces: { focusSelected: vi.fn() },
    });
    vi.advanceTimersByTime(5000);
    await flushPromises();
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(fetchSummary).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["the grid view", "grid", 3],
    ["no focused session", "focus", null],
  ] as const)("does not poll in %s", async (_n, view, id) => {
    stubDocument();
    initDiff(app(view, id) as never, { surfaces: { focusSelected: vi.fn() } });
    vi.advanceTimersByTime(20_000);
    await flushPromises();
    expect(fetchSummary).not.toHaveBeenCalled();
  });
});
