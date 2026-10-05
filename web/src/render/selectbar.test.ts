import { describe, expect, it } from "vitest";
import { renderSelectBar, type SelectBarElements, type SelectBarModel } from "./selectbar";

// Plain objects stand in for the markup: renderSelectBar only ever writes `hidden`, text and
// `disabled` (static markup, one instance, never rebuilt), so those three
// writes are the whole contract.
function fakeButton(): HTMLButtonElement {
  return { disabled: false } as unknown as HTMLButtonElement;
}

function fakeBar(): SelectBarElements {
  return {
    root: { hidden: true } as unknown as HTMLElement,
    count: { textContent: "" } as unknown as HTMLElement,
    move: fakeButton(),
    ungroup: fakeButton(),
    stop: fakeButton(),
    remove: fakeButton(),
    all: fakeButton(),
    done: fakeButton(),
  };
}

const base: SelectBarModel = {
  visible: true,
  countText: "2 selected",
  connected: true,
  hasSelection: true,
  anyGrouped: true,
  anyAlive: true,
};

function enablement(els: SelectBarElements): Record<string, boolean> {
  return {
    move: !els.move.disabled,
    ungroup: !els.ungroup.disabled,
    stop: !els.stop.disabled,
    remove: !els.remove.disabled,
    all: !els.all.disabled,
    done: !els.done.disabled,
  };
}

describe("renderSelectBar", () => {
  it("shows the bar and the count only while select mode is on", () => {
    const els = fakeBar();
    renderSelectBar(els, base);
    expect(els.root.hidden).toBe(false);
    expect(els.count.textContent).toBe("2 selected");
    renderSelectBar(els, { ...base, visible: false });
    expect(els.root.hidden).toBe(true);
  });

  it("enables every action for a connected selection holding grouped and live sessions", () => {
    const els = fakeBar();
    renderSelectBar(els, base);
    expect(enablement(els)).toEqual({
      move: true,
      ungroup: true,
      stop: true,
      remove: true,
      all: true,
      done: true,
    });
  });

  it("disables the four actions with nothing selected, leaving All and Done", () => {
    const els = fakeBar();
    renderSelectBar(els, { ...base, countText: "Select sessions", hasSelection: false });
    expect(enablement(els)).toEqual({
      move: false,
      ungroup: false,
      stop: false,
      remove: false,
      all: true,
      done: true,
    });
    expect(els.count.textContent).toBe("Select sessions");
  });

  it("disables Ungroup when nothing selected is in a group, leaving the rest", () => {
    const els = fakeBar();
    renderSelectBar(els, { ...base, anyGrouped: false });
    expect(enablement(els)).toMatchObject({ move: true, ungroup: false, stop: true, remove: true });
  });

  it("disables Stop when nothing selected is alive; Remove still works on ended sessions", () => {
    const els = fakeBar();
    renderSelectBar(els, { ...base, anyAlive: false });
    expect(enablement(els)).toMatchObject({ move: true, ungroup: true, stop: false, remove: true });
  });

  it("with the daemon down disables every button, All and Done included", () => {
    const els = fakeBar();
    renderSelectBar(els, { ...base, connected: false });
    expect(enablement(els)).toEqual({
      move: false,
      ungroup: false,
      stop: false,
      remove: false,
      all: false,
      done: false,
    });
  });

  it("re-enables the actions when the daemon comes back", () => {
    const els = fakeBar();
    renderSelectBar(els, { ...base, connected: false });
    renderSelectBar(els, base);
    expect(enablement(els).stop).toBe(true);
    expect(enablement(els)).toMatchObject({ all: true, done: true });
  });

  it("does not rewrite an unchanged count, so a text node under the pointer is left alone", () => {
    let writes = 0;
    let text = "";
    const els = fakeBar();
    Object.defineProperty(els.count, "textContent", {
      get: () => text,
      set: (value: string) => {
        writes += 1;
        text = value;
      },
    });
    renderSelectBar(els, base);
    renderSelectBar(els, base);
    renderSelectBar(els, base);
    expect(writes).toBe(1);
  });
});
