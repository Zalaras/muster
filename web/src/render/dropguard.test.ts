// dropguard.ts registers two document-level listeners; the only decision it makes is
// "did something more specific already claim this event?" (`event.defaultPrevented`).
// Per docs/conventions.md ("interaction and rendering are Playwright's job") this isn't a
// rendering test — no real DOM, no jsdom — it's the same minimal-fake-listener technique
// render/tiledrag.test.ts already established for exactly this kind of DOM event-wiring
// glue: a `FakeDoc` stands in for `Document`, recording listeners so a test can dispatch a
// synthetic event object directly instead of simulating real browser DnD dispatch.
import { describe, expect, it } from "vitest";
import { installDropGuard } from "./dropguard";

type Handler = (event: unknown) => void;

class FakeDoc {
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

function fakeDragOverEvent(defaultPrevented: boolean): {
  defaultPrevented: boolean;
  preventDefault: () => void;
  dataTransfer: { dropEffect: string };
} {
  const event = {
    defaultPrevented,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    dataTransfer: { dropEffect: "" },
  };
  return event;
}

function fakeDropEvent(defaultPrevented: boolean): { defaultPrevented: boolean; preventDefault: () => void } {
  const event = {
    defaultPrevented,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
  };
  return event;
}

// REQ-1: a foreign drag/drop anywhere on the dashboard never navigates the browser away.
describe("installDropGuard — foreign drag (REQ-1)", () => {
  it("prevents default on a dragover that nothing else has claimed, and sets dropEffect to 'none'", () => {
    const doc = new FakeDoc();
    installDropGuard(doc as unknown as Document);
    const event = fakeDragOverEvent(false);

    doc.dispatch("dragover", event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe("none");
  });

  it("prevents default on a drop that nothing else has claimed", () => {
    const doc = new FakeDoc();
    installDropGuard(doc as unknown as Document);
    const event = fakeDropEvent(false);

    doc.dispatch("drop", event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not throw when dragover fires with no dataTransfer at all", () => {
    const doc = new FakeDoc();
    installDropGuard(doc as unknown as Document);
    const event = { defaultPrevented: false, preventDefault: () => undefined, dataTransfer: null };

    expect(() => doc.dispatch("dragover", event)).not.toThrow();
  });
});

// REQ-9/INV-3: an event a more specific handler (a terminal surface, or a tile/rail
// reorder container) already claimed via preventDefault() must not be re-touched here —
// in particular the guard must never overwrite a `dropEffect` an internal drag or the
// terminal surface already set (e.g. "copy") back to "none".
describe("installDropGuard — leaves an already-claimed event alone (REQ-9, INV-3)", () => {
  it("does not call preventDefault again, and does not touch dropEffect, on an already-prevented dragover", () => {
    const doc = new FakeDoc();
    installDropGuard(doc as unknown as Document);
    const event = fakeDragOverEvent(true);
    event.dataTransfer.dropEffect = "copy"; // as terminal/pane.ts's own dragover handler sets it

    doc.dispatch("dragover", event);

    expect(event.dataTransfer.dropEffect).toBe("copy");
  });

  it("does not call preventDefault again on an already-prevented drop", () => {
    const doc = new FakeDoc();
    installDropGuard(doc as unknown as Document);
    const event = fakeDropEvent(true);
    let calledAgain = false;
    event.preventDefault = () => {
      calledAgain = true;
    };

    doc.dispatch("drop", event);

    expect(calledAgain).toBe(false);
  });
});
