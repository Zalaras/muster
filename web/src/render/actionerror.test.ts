// REQ-17/W2 (plan session-lifecycle): the global `#action-error` alert (index.html, right
// after `#banner`) that surfaces a failed End/Resume/Remove from any surface — mainhead,
// rail card or tile footer. Today `features/actions.ts`'s `doEnd`/`doResume`/`doRemove`
// (actions.ts:107-140) only `console.error` on a failed result, so nothing renders — this
// file is red until that changes.
//
// `./actionerror` does not exist yet. Signature matches `render/banner.ts`'s
// `renderBanner(el, visible)` — settled as the analogue for a single `role="alert"`
// element with static markup, rather than the refs-object shape `render/dead.ts`/
// `render/mainhead.ts` use for driving several elements at once.
import { describe, expect, it } from "vitest";
import { renderActionError } from "./actionerror";

function fakeElement(): HTMLElement {
  return { textContent: "", hidden: true } as unknown as HTMLElement;
}

describe("renderActionError (REQ-17/W2)", () => {
  it("writes the envelope's message and un-hides the alert on a failed action", () => {
    const el = fakeElement();

    renderActionError(el, "End failed: tmux unreachable");

    expect(el.textContent).toBe("End failed: tmux unreachable");
    expect(el.hidden).toBe(false);
  });

  it("clears the alert when a subsequent action succeeds (message: null)", () => {
    const el = fakeElement();
    renderActionError(el, "Remove failed: row not deleted");

    renderActionError(el, null);

    expect(el.textContent).toBe("");
    expect(el.hidden).toBe(true);
  });

  it("a later failure replaces an earlier one rather than concatenating", () => {
    const el = fakeElement();
    renderActionError(el, "first failure");

    renderActionError(el, "second failure");

    expect(el.textContent).toBe("second failure");
    expect(el.hidden).toBe(false);
  });

  it("starts hidden with no message (nothing has failed yet)", () => {
    const el = fakeElement();

    renderActionError(el, null);

    expect(el.textContent).toBe("");
    expect(el.hidden).toBe(true);
  });
});
