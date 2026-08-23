import { describe, expect, it } from "vitest";
import { overlayForCloseCode, overlayText } from "./overlay";

// docs/protocol.md §6 close codes: 4000 superseded, 4001 pane_ended; everything else
// (1000/1001 shutdown, 1006 abnormal/daemon-down, or any other value) reads as
// "disconnected" — the bridge is down, not the session (plan m2-terminal REQ-13).
describe("overlayForCloseCode", () => {
  it("maps 4000 to 'superseded' (one-live-client takeover, INV-1)", () => {
    expect(overlayForCloseCode(4000)).toBe("superseded");
  });

  it("maps 4001 to 'ended' (PTY EOF / pane_ended)", () => {
    expect(overlayForCloseCode(4001)).toBe("ended");
  });

  it.each([1000, 1001, 1006, 1011, 0, 4002, 3999])(
    "maps every other close code to 'disconnected': %p",
    (code) => {
      expect(overlayForCloseCode(code)).toBe("disconnected");
    },
  );
});

describe("overlayText — Testable UI Elements: /disconnected|another window|session ended/", () => {
  it("matches the required pattern for 'superseded'", () => {
    expect(overlayText("superseded")).toMatch(/disconnected|another window|session ended/);
    expect(overlayText("superseded")).toContain("another window");
  });

  it("matches the required pattern for 'ended'", () => {
    expect(overlayText("ended")).toMatch(/disconnected|another window|session ended/);
    expect(overlayText("ended")).toBe("session ended");
  });

  it("matches the required pattern for 'disconnected'", () => {
    expect(overlayText("disconnected")).toMatch(/disconnected|another window|session ended/);
    expect(overlayText("disconnected")).toContain("disconnected");
  });
});
