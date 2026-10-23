import { afterEach, describe, expect, it, vi } from "vitest";
import { initReaderScroll } from "./readerscroll";

// A body with only what the controller touches: scrollTop, listeners, no DOM (logic tier).
function fakeBody() {
  const listeners = new Map<string, Set<() => void>>();
  const body = {
    scrollTop: 0,
    addEventListener: (t: string, fn: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
  };
  const fire = (t: string) =>
    listeners.get(t)?.forEach((fn) => {
      fn();
    });
  return { body: body as unknown as HTMLElement, raw: body, fire, listeners };
}

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  const save = vi.fn();
  const b = fakeBody();
  const handle = initReaderScroll(b.body, { save });
  return { ...b, save, handle };
}

describe("initReaderScroll", () => {
  it("restores a stored position on open and again after diagrams settle", () => {
    const s = setup();
    s.handle.opened("/a.md", 300);
    expect(s.raw.scrollTop).toBe(300);
    s.raw.scrollTop = 120; // layout shift while diagrams render
    s.handle.diagramsSettled();
    expect(s.raw.scrollTop).toBe(300);
  });

  it("a document with no stored position opens at the top", () => {
    const s = setup();
    s.raw.scrollTop = 500;
    s.handle.opened("/a.md", 0);
    expect(s.raw.scrollTop).toBe(0);
  });

  it("a user wheel drops the pending restore so the post-diagram pass does not fight the reader", () => {
    const s = setup();
    s.handle.opened("/a.md", 300);
    s.raw.scrollTop = 40;
    s.fire("wheel");
    s.handle.diagramsSettled();
    expect(s.raw.scrollTop).toBe(40);
  });

  it("saves debounced to the last position, once", () => {
    const s = setup();
    s.handle.opened("/a.md", 0);
    s.raw.scrollTop = 10;
    s.fire("scroll");
    s.raw.scrollTop = 60;
    s.fire("scroll");
    vi.advanceTimersByTime(149);
    expect(s.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.save).toHaveBeenCalledOnce();
    expect(s.save).toHaveBeenCalledWith("/a.md", 60);
  });

  it("ignores scroll events caused by its own restore", () => {
    const s = setup();
    s.handle.opened("/a.md", 300);
    s.fire("scroll");
    vi.advanceTimersByTime(1000);
    expect(s.save).not.toHaveBeenCalled();
  });

  it("opening another document flushes the pending save against the old path", () => {
    const s = setup();
    s.handle.opened("/a.md", 0);
    s.raw.scrollTop = 80;
    s.fire("scroll");
    s.handle.opened("/b.md", 0);
    expect(s.save).toHaveBeenCalledWith("/a.md", 80);
  });

  it("dispose flushes the last seen value (not a detached body's 0) and detaches listeners", () => {
    const s = setup();
    s.handle.opened("/a.md", 0);
    s.raw.scrollTop = 80;
    s.fire("scroll");
    s.raw.scrollTop = 0;
    s.handle.dispose();
    expect(s.save).toHaveBeenCalledWith("/a.md", 80);
    expect([...s.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("saves nothing before any document is opened", () => {
    const s = setup();
    s.raw.scrollTop = 50;
    s.fire("scroll");
    vi.advanceTimersByTime(1000);
    expect(s.save).not.toHaveBeenCalled();
  });
});
