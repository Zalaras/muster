import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureFocusedControl, restoreFocusedControl } from "./focus";

// Minimal stand-ins: `captureFocusedControl` only needs `document.activeElement`,
// `instanceof HTMLElement`, `dataset` and `contains`; `restoreFocusedControl` needs
// `querySelector` and `focus`. Rendering is Playwright's job — this pins the contract.
class El {
  dataset: Record<string, string | undefined> = {};
  children: El[] = [];
  focusCalls = 0;
  contains(other: unknown): boolean {
    return other === this || this.children.some((c) => c.contains(other));
  }
  querySelector(sel: string): El | null {
    const m = /\[data-action="([^"]+)"\]/.exec(sel);
    const want = m?.[1];
    for (const c of this.children) {
      if (c.dataset["action"] === want) return c;
      const deep = c.querySelector(sel);
      if (deep) return deep;
    }
    return null;
  }
  focus(): void {
    this.focusCalls += 1;
    doc.activeElement = this;
  }
}
const doc: { activeElement: El | null } = { activeElement: null };

describe("captureFocusedControl / restoreFocusedControl", () => {
  let savedDocument: unknown;
  let savedHTMLElement: unknown;
  beforeEach(() => {
    savedDocument = (globalThis as { document?: unknown }).document;
    savedHTMLElement = (globalThis as { HTMLElement?: unknown }).HTMLElement;
    (globalThis as { document: unknown }).document = doc;
    (globalThis as { HTMLElement: unknown }).HTMLElement = El;
    doc.activeElement = null;
  });
  afterEach(() => {
    (globalThis as { document: unknown }).document = savedDocument;
    (globalThis as { HTMLElement: unknown }).HTMLElement = savedHTMLElement;
  });

  function tree(): { container: El; card: El; end: El } {
    const container = new El();
    const card = new El();
    card.dataset["sessionId"] = "7";
    const end = new El();
    end.dataset["action"] = "end";
    end.dataset["id"] = "7";
    card.children.push(end);
    container.children.push(card);
    return { container, card, end };
  }

  it("captures an action button by data-action + data-id", () => {
    const { container, end } = tree();
    doc.activeElement = end;
    expect(captureFocusedControl(container as unknown as Element)).toEqual({
      sessionId: 7,
      action: "end",
      element: end,
    });
  });

  it("captures a session root by data-session-id when the root itself has focus", () => {
    const { container, card } = tree();
    doc.activeElement = card;
    expect(captureFocusedControl(container as unknown as Element)).toEqual({
      sessionId: 7,
      action: undefined,
      element: card,
    });
  });

  it("returns null when focus is outside the container, or on a non-control inside it", () => {
    const { container, card } = tree();
    doc.activeElement = new El();
    expect(captureFocusedControl(container as unknown as Element)).toBeNull();
    const plain = new El();
    card.children.push(plain);
    doc.activeElement = plain;
    expect(captureFocusedControl(container as unknown as Element)).toBeNull();
  });

  it("restore re-focuses the same logical button on the *new* root when focus was lost", () => {
    const { container, end } = tree();
    doc.activeElement = end;
    const captured = captureFocusedControl(container as unknown as Element);
    doc.activeElement = null; // the detach blurred it
    const newRoot = new El();
    const newEnd = new El();
    newEnd.dataset["action"] = "end";
    newRoot.children.push(newEnd);
    restoreFocusedControl(captured, () => newRoot as unknown as HTMLElement);
    expect(doc.activeElement).toBe(newEnd);
    expect(newEnd.focusCalls).toBe(1);
  });

  it("restore is a no-op when focus was not lost, when nothing was captured, or when the root is gone", () => {
    const { container, card, end } = tree();
    doc.activeElement = end;
    const captured = captureFocusedControl(container as unknown as Element);
    restoreFocusedControl(captured, () => card as unknown as HTMLElement);
    expect(end.focusCalls).toBe(0);
    restoreFocusedControl(null, () => card as unknown as HTMLElement);
    doc.activeElement = null;
    restoreFocusedControl(captured, () => null);
    expect(doc.activeElement).toBeNull();
  });
});
