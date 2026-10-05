import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fillOptions } from "./options";

// Just enough of `document` and a `<select>` for `replaceChildren`: the builder is logic over rows
// (order, value, label, replacing what was there), not a rendering concern.
interface FakeOption {
  value: string;
  textContent: string;
}

class FakeSelect {
  options: FakeOption[] = [];
  replaceChildren(...nodes: FakeOption[]): void {
    this.options = nodes;
  }
}

describe("fillOptions", () => {
  let saved: unknown;
  beforeEach(() => {
    saved = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: (tag: string) => {
        if (tag !== "option") throw new Error(`unexpected element ${tag}`);
        return { value: "", textContent: "" };
      },
    };
  });
  afterEach(() => {
    (globalThis as { document: unknown }).document = saved;
  });

  const run = (select: FakeSelect, rows: { value: string; label: string }[]): FakeOption[] => {
    fillOptions(select as unknown as HTMLSelectElement, rows);
    return select.options.map((o) => ({ value: o.value, textContent: o.textContent }));
  };

  it("writes one option per row, value and label kept apart, in row order", () => {
    expect(
      run(new FakeSelect(), [
        { value: "none", label: "No group" },
        { value: "3", label: "PR reviews" },
        { value: "new", label: "New group…" },
      ]),
    ).toEqual([
      { value: "none", textContent: "No group" },
      { value: "3", textContent: "PR reviews" },
      { value: "new", textContent: "New group…" },
    ]);
  });

  it("replaces what the select held rather than appending", () => {
    const select = new FakeSelect();
    run(select, [{ value: "a", label: "A" }]);
    expect(run(select, [{ value: "b", label: "B" }])).toEqual([{ value: "b", textContent: "B" }]);
  });

  it("clears the select for no rows", () => {
    const select = new FakeSelect();
    run(select, [{ value: "a", label: "A" }]);
    expect(run(select, [])).toEqual([]);
  });

  it("carries a label as text, never markup", () => {
    const label = "<b>x</b>";
    expect(run(new FakeSelect(), [{ value: "1", label }])[0]?.textContent).toBe(label);
  });
});
