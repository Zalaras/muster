import { describe, expect, it } from "vitest";
import type { Repo } from "../api/launch";
import { DEFAULT_MODEL, initialRestore, repoRestore, type Touched } from "./launchrestore";

const baseRepo: Repo = {
  id: 1,
  path: "/Users/bob/code/muster",
  name: "muster",
  isGit: true,
  branch: "main",
  pinned: false,
  lastLaunchedAt: "2026-09-01T00:00:00Z",
  launchCount: 3,
  lastModel: "opus",
  lastPermissionMode: "acceptEdits",
};

// W5, plan new-session-improvement, REQ-6a: initialRestore restores exactly the untouched
// fields, for all four combinations of model-touched and mode-touched.
describe("initialRestore (W5, REQ-6a)", () => {
  it("restores both fields when neither has been touched", () => {
    const touched: Touched = { model: false, mode: false };
    expect(initialRestore(touched, baseRepo)).toStrictEqual({
      model: "opus",
      mode: "acceptEdits",
    });
  });

  it("omits model but restores mode when only model was touched", () => {
    const touched: Touched = { model: true, mode: false };
    const restore = initialRestore(touched, baseRepo);
    expect(restore).toStrictEqual({ mode: "acceptEdits" });
    expect("model" in restore).toBe(false);
  });

  it("omits mode but restores model when only mode was touched", () => {
    const touched: Touched = { model: false, mode: true };
    const restore = initialRestore(touched, baseRepo);
    expect(restore).toStrictEqual({ model: "opus" });
    expect("mode" in restore).toBe(false);
  });

  it("restores neither field when both were touched", () => {
    const touched: Touched = { model: true, mode: true };
    const restore = initialRestore(touched, baseRepo);
    expect(restore).toStrictEqual({});
    expect("model" in restore).toBe(false);
    expect("mode" in restore).toBe(false);
  });

  it("falls back to sonnet for an untouched model when the repo has no lastModel", () => {
    const repo: Repo = { ...baseRepo, lastModel: null };
    const touched: Touched = { model: false, mode: false };
    expect(initialRestore(touched, repo).model).toBe("sonnet");
  });

  it("falls back to auto (via permissionModeToCheck) for an untouched mode when the repo has no lastPermissionMode", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: null };
    const touched: Touched = { model: false, mode: false };
    expect(initialRestore(touched, repo).mode).toBe("auto");
  });

  it("falls back to auto for an untouched mode the dialog has no radio for", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: "someFutureMode" };
    const touched: Touched = { model: false, mode: false };
    expect(initialRestore(touched, repo).mode).toBe("auto");
  });

  it("never falls back to sonnet or auto for a touched field, even with nothing to restore", () => {
    const repo: Repo = { ...baseRepo, lastModel: null, lastPermissionMode: null };
    const touched: Touched = { model: true, mode: true };
    expect(initialRestore(touched, repo)).toStrictEqual({});
  });
});

// review-maintainability cycle 1 Minor 2: repoRestore is the one owner of "what would
// this repo's directory restore to", unfiltered by touched — buildRecentButton's click
// handler (features/launch.ts) applies it unconditionally, and initialRestore (above)
// applies it through the touched filter. Covering it directly here pins that contract
// independently of initialRestore's filtering.
describe("repoRestore (review-maintainability cycle 1 Minor 2)", () => {
  it("returns the repo's stored model and mode unfiltered", () => {
    expect(repoRestore(baseRepo)).toStrictEqual({ model: "opus", mode: "acceptEdits" });
  });

  it("falls back to DEFAULT_MODEL when the repo has no lastModel", () => {
    const repo: Repo = { ...baseRepo, lastModel: null };
    expect(repoRestore(repo).model).toBe(DEFAULT_MODEL);
  });

  it("falls back to auto (via permissionModeToCheck) when the repo has no lastPermissionMode", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: null };
    expect(repoRestore(repo).mode).toBe("auto");
  });

  it("falls back to auto for a stored mode the dialog has no radio for", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: "bypassPermissions" };
    expect(repoRestore(repo).mode).toBe("auto");
  });
});

describe("DEFAULT_MODEL", () => {
  it("is sonnet — resetForm's (features/launch.ts) brand-new-form default and repoRestore's fallback share this one literal", () => {
    expect(DEFAULT_MODEL).toBe("sonnet");
  });
});
