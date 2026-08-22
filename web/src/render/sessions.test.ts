import { describe, expect, it } from "vitest";
import type { Session } from "../protocol";
import { renderSessions } from "./sessions";

function fakeElement(): HTMLElement {
  return { textContent: "" } as unknown as HTMLElement;
}

// M0's daemon only ever sends an empty array; the non-empty branch is dead code until
// M1's state machine exists, but it's still reachable logic worth pinning down now.
const stubSession = {} as Session;

describe("renderSessions", () => {
  it("renders the honest empty state when there are no sessions (M0's only reachable case)", () => {
    const el = fakeElement();
    renderSessions(el, []);
    expect(el.textContent).toBe("No sessions yet");
  });

  it("renders a count placeholder for a non-empty list (pre-M1 fallback)", () => {
    const el = fakeElement();
    renderSessions(el, [stubSession, stubSession, stubSession]);
    expect(el.textContent).toBe("3 sessions");
  });

  it("renders the singular count for exactly one session", () => {
    const el = fakeElement();
    renderSessions(el, [stubSession]);
    expect(el.textContent).toBe("1 sessions");
  });
});
