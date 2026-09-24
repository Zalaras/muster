// REQ-14 (plan m4-reconcile)'s End/Remove confirm dialog body-text composition — pure
// (no DOM), so it's tested directly. render/confirm.ts's `initConfirmDialogs`, which only
// ever assigns the strings these produce to `textContent`, is untestable further without
// jsdom (docs/conventions.md defers DOM construction to Playwright) and isn't covered here.
import { describe, expect, it } from "vitest";
import type { Session } from "../protocol/session";
import { endDialogBody, removeDialogBody } from "./actionscopy";

function makeSession(overrides: Partial<Session> & { id: number }): Session {
  return {
    title: "some-session",
    titleOverride: null,
    plan: null,
    state: "idle",
    stateSince: "2026-08-27T00:00:00Z",
    alive: true,
    endedAt: null,
    attention: null,
    failure: null,
    directory: "/Users/bob/code/muster",
    repo: null,
    model: null,
    permissionMode: { value: "default", source: "seed" },
    context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
    lastActivity: null,
    claudeSessionId: "claude-sess",
    tmuxTarget: "muster:@1",
    firstLaunchHere: false,
    createdAt: "2026-08-26T23:00:00Z",
    pinned: false,
    railPos: overrides.id,
    unread: false,
    lastPrompt: null,
    ...overrides,
  };
}

describe("endDialogBody", () => {
  it("names the session by title and directory basename (no repo) and never mentions Resume-can't", () => {
    const session = makeSession({ id: 1, title: "fix auth", directory: "/Users/bob/muster" });
    expect(endDialogBody(session)).toBe(
      "fix auth — muster. Kills the tmux pane and the claude inside it. The card stays in the rail " +
        "as ended — Resume can pick the conversation back up if this was a slip.",
    );
  });

  it("falls back to 'untitled' when the session has no title (same rule as the card)", () => {
    const session = makeSession({ id: 1, title: null, directory: "/Users/bob/muster" });
    expect(endDialogBody(session)).toContain("untitled — muster.");
  });

  it("uses 'repo / branch' when the session has a repo, matching buildCardViewModel's repoLine", () => {
    const session = makeSession({
      id: 1,
      title: "fix auth",
      repo: { name: "muster", branch: "plan/foo", isWorktree: false },
    });
    expect(endDialogBody(session)).toContain("fix auth — muster / plan/foo.");
  });

  it("does not vary with session.alive — End's copy is the same whether or not the session is alive", () => {
    const alive = makeSession({ id: 1, title: "fix auth", alive: true });
    const dead = makeSession({ id: 1, title: "fix auth", alive: false });
    expect(endDialogBody(alive)).toBe(endDialogBody(dead));
  });
});

describe("removeDialogBody", () => {
  it("omits the 'ends the session first' clause when the session is already not alive", () => {
    const session = makeSession({
      id: 1,
      title: "fix auth",
      directory: "/Users/bob/muster",
      alive: false,
    });
    expect(removeDialogBody(session)).toBe(
      "fix auth — muster. Deletes it from Muster for good — the card disappears and it can no longer " +
        "be resumed from here.",
    );
  });

  it("inserts E9's exact 'This ends the session first.' clause when the session is still alive", () => {
    const session = makeSession({
      id: 1,
      title: "fix auth",
      directory: "/Users/bob/muster",
      alive: true,
    });
    expect(removeDialogBody(session)).toBe(
      "fix auth — muster. This ends the session first. Deletes it from Muster for good — the card " +
        "disappears and it can no longer be resumed from here.",
    );
  });

  it("falls back to 'untitled' when the session has no title, same as endDialogBody", () => {
    const session = makeSession({ id: 1, title: null, alive: false });
    expect(removeDialogBody(session)).toContain("untitled — muster.");
  });
});
