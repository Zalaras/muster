import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EffortStripPart } from "../sessions/effort";
import { renderEffortStrip } from "./effortstrip";

// No DOM in this Vitest environment: a minimal node tree stands in for the strip, its
// `.sentence` child and the `<b>` / text nodes `renderEffortStrip` builds.
class Node_ {
  textContent = "";
  tag = "";
  kids: Node_[] = [];
  hidden = false;
  readonly dataset: Record<string, string> = {};
  writes = 0;

  querySelector(selector: string): Node_ | null {
    return selector === ".sentence" ? this.sentence : null;
  }

  replaceChildren(...nodes: Node_[]): void {
    this.writes += 1;
    this.kids = nodes;
    this.textContent = nodes.map((node) => node.textContent).join("");
  }

  sentence: Node_ | null = null;
}

function fakeStrip(): { strip: HTMLElement; sentence: Node_; node: Node_ } {
  const node = new Node_();
  const sentence = new Node_();
  node.sentence = sentence;
  return { strip: node as unknown as HTMLElement, sentence, node };
}

const clamp: EffortStripPart[] = [
  { text: "Asked for ", bold: false },
  { text: "max", bold: true },
  { text: " — Opus 4.5 started at ", bold: false },
  { text: "high", bold: true },
  { text: ".", bold: false },
];

describe("renderEffortStrip", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        const node = new Node_();
        node.tag = tag;
        return node;
      },
      createTextNode: (text: string) => {
        const node = new Node_();
        node.textContent = text;
        return node;
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides the strip and writes nothing for no parts", () => {
    const { strip, sentence } = fakeStrip();
    renderEffortStrip(strip, null);
    expect(strip.hidden).toBe(true);
    expect(sentence.writes).toBe(0);
  });

  it("shows the strip with the sentence, bold runs as <b> and plain runs as text", () => {
    const { strip, sentence } = fakeStrip();
    renderEffortStrip(strip, clamp);
    expect(strip.hidden).toBe(false);
    expect(sentence.textContent).toBe("Asked for max — Opus 4.5 started at high.");
    expect(sentence.kids.map((kid) => kid.tag)).toEqual(["", "b", "", "b", ""]);
  });

  it("does not rewrite the sentence while its content is unchanged (the Dismiss button keeps its node)", () => {
    const { strip, sentence } = fakeStrip();
    renderEffortStrip(strip, clamp);
    renderEffortStrip(
      strip,
      clamp.map((part) => ({ ...part })),
    );
    expect(sentence.writes).toBe(1);
  });

  it.each([
    ["another text", clamp.map((p) => (p.text === "high" ? { ...p, text: "medium" } : p))],
    ["another bold flag", clamp.map((p) => (p.text === "high" ? { ...p, bold: false } : p))],
  ])("rewrites the sentence when %s", (_label, next) => {
    const { strip, sentence } = fakeStrip();
    renderEffortStrip(strip, clamp);
    renderEffortStrip(strip, next);
    expect(sentence.writes).toBe(2);
  });

  it("shows again with the same sentence after a hide without rewriting it", () => {
    const { strip, sentence } = fakeStrip();
    renderEffortStrip(strip, clamp);
    renderEffortStrip(strip, null);
    expect(strip.hidden).toBe(true);
    renderEffortStrip(strip, clamp);
    expect(strip.hidden).toBe(false);
    expect(sentence.writes).toBe(1);
  });
});
