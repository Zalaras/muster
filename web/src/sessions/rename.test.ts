import { describe, expect, it } from "vitest";
import type { Session } from "../protocol";
import { titleCommand } from "./rename";

// `titleCommand` only reads `title`/`titleOverride` (see its own Pick<> signature) — a
// bare object literal of just those two fields is a valid, fully-typed input, no need
// for a full Session fixture.
function session(title: string | null, titleOverride: string | null): Pick<Session, "title" | "titleOverride"> {
  return { title, titleOverride };
}

// REQ-14/W5: "Enter or blur commits ... Escape cancels" — cancel has no wire
// representation (the caller just discards the input), so this pure function only ever
// needs to model a commit's four outcomes. Every case below trims first, per REQ-14's
// stated order ("Commit trims the input, then: ...").
describe("titleCommand — REQ-14 commit semantics (W5)", () => {
  it("noop: the trimmed input equals the current display title", () => {
    expect(titleCommand("hunting flake", session("hunting flake", "hunting flake"))).toEqual({ kind: "noop" });
  });

  it("noop: trims whitespace before comparing, still equal to the display title", () => {
    expect(titleCommand("  hunting flake  ", session("hunting flake", null))).toEqual({ kind: "noop" });
  });

  it("clear: empty input while an override is currently set", () => {
    expect(titleCommand("", session("hunting flake", "hunting flake"))).toEqual({ kind: "clear" });
  });

  it("clear: whitespace-only input (trims to empty) while an override is currently set (edge case 9)", () => {
    expect(titleCommand("   ", session("hunting flake", "hunting flake"))).toEqual({ kind: "clear" });
  });

  it("noop: empty input when no override exists — nothing to clear", () => {
    expect(titleCommand("", session(null, null))).toEqual({ kind: "noop" });
  });

  it("noop: whitespace-only input when no override exists and the display title is also empty/null", () => {
    expect(titleCommand("   ", session(null, null))).toEqual({ kind: "noop" });
  });

  it("set: any other input sends the trimmed string", () => {
    expect(titleCommand("  new name  ", session("old name", null))).toEqual({ kind: "set", title: "new name" });
  });

  it("set: a first title on a session with no display title yet (null title, no override)", () => {
    expect(titleCommand("first title", session(null, null))).toEqual({ kind: "set", title: "first title" });
  });

  it("set: overwriting one override with a different string", () => {
    expect(titleCommand("second try", session("first try", "first try"))).toEqual({ kind: "set", title: "second try" });
  });
});
