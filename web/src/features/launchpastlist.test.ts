import { describe, expect, it } from "vitest";
import type { PastSession } from "../api/launch";
import { defaultSelection, filterPastSessions, pastRowView } from "./launchpastlist";

function makeSession(overrides: Partial<PastSession> & { claudeSessionId: string }): PastSession {
  return {
    title: null,
    lastPrompt: null,
    lastActiveAt: "2026-09-27T00:00:00Z",
    permissionMode: null,
    openSessionId: null,
    ...overrides,
  };
}

describe("filterPastSessions (REQ-14)", () => {
  const list: PastSession[] = [
    makeSession({ claudeSessionId: "a", title: "fix the thing", lastPrompt: "run the tests" }),
    makeSession({ claudeSessionId: "b", title: "flaky e2e hunt", lastPrompt: "check the logs" }),
    makeSession({ claudeSessionId: "c", title: null, lastPrompt: "any TESTS failing?" }),
  ];

  it("returns every session unchanged for an empty query (no filter yet default)", () => {
    expect(filterPastSessions(list, "")).toEqual(list);
  });

  it("returns every session unchanged for a whitespace-only query", () => {
    expect(filterPastSessions(list, "   ")).toEqual(list);
  });

  it("matches case-insensitively over title", () => {
    expect(filterPastSessions(list, "FIX")).toEqual([list[0]]);
  });

  it("matches case-insensitively over lastPrompt", () => {
    const result = filterPastSessions(list, "tests");
    expect(result.map((s) => s.claudeSessionId)).toEqual(["a", "c"]);
  });

  it("matches a session with a null title via its lastPrompt", () => {
    expect(filterPastSessions(list, "any tests")).toEqual([list[2]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterPastSessions(list, "nonexistent")).toEqual([]);
  });

  it("returns a new array, not the same reference, even for an empty query", () => {
    const result = filterPastSessions(list, "");
    expect(result).not.toBe(list);
  });

  it("treats a null title and a null lastPrompt as no match, not a thrown error", () => {
    const bothNull = [makeSession({ claudeSessionId: "d", title: null, lastPrompt: null })];
    expect(filterPastSessions(bothNull, "anything")).toEqual([]);
    expect(filterPastSessions(bothNull, "")).toEqual(bothNull);
  });
});

describe("defaultSelection (kb:adr/launch-resume-running-guard-muster-only)", () => {
  it("returns null for an empty list", () => {
    expect(defaultSelection([])).toBeNull();
  });

  it("returns the first row when none is open elsewhere", () => {
    const list = [makeSession({ claudeSessionId: "a" }), makeSession({ claudeSessionId: "b" })];
    expect(defaultSelection(list)?.claudeSessionId).toBe("a");
  });

  it("skips a leading row already open in an alive Muster session", () => {
    const list = [
      makeSession({ claudeSessionId: "a", openSessionId: 7 }),
      makeSession({ claudeSessionId: "b", openSessionId: null }),
    ];
    expect(defaultSelection(list)?.claudeSessionId).toBe("b");
  });

  it("returns null when every row is already open (no selectable row)", () => {
    const list = [
      makeSession({ claudeSessionId: "a", openSessionId: 1 }),
      makeSession({ claudeSessionId: "b", openSessionId: 2 }),
    ];
    expect(defaultSelection(list)).toBeNull();
  });
});

describe("pastRowView — the one place a past-session row's title fallback and bypass-chip flag are derived", () => {
  it("carries a present title through verbatim, chip false for a non-bypass mode", () => {
    const session = makeSession({
      claudeSessionId: "a",
      title: "fix the thing",
      permissionMode: "acceptEdits",
    });
    expect(pastRowView(session)).toEqual({ session, title: "fix the thing", bypassChip: false });
  });

  it("falls back to '(untitled)' for a null title", () => {
    const session = makeSession({ claudeSessionId: "a", title: null });
    expect(pastRowView(session).title).toBe("(untitled)");
  });

  it("sets bypassChip true iff the row's last mode was bypassPermissions", () => {
    const session = makeSession({ claudeSessionId: "a", permissionMode: "bypassPermissions" });
    expect(pastRowView(session).bypassChip).toBe(true);
  });

  it("sets bypassChip false for a null permissionMode (never recorded)", () => {
    const session = makeSession({ claudeSessionId: "a", permissionMode: null });
    expect(pastRowView(session).bypassChip).toBe(false);
  });
});
