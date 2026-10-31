import { describe, expect, it } from "vitest";
import type { Repo } from "../api/launch";
import {
  DEFAULT_MODEL,
  defaultRestore,
  initialRestore,
  repoRestore,
  type Touched,
} from "./launchrestore";

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
  lastEffort: "high",
};

// initialRestore restores exactly the untouched fields, for all eight combinations of touched model, mode and
// effort. A touched field's key is absent (not undefined) so the caller leaves the form alone.
describe("initialRestore (W5, REQ-6a; plan effort REQ-2)", () => {
  const stored = { model: "opus", mode: "acceptEdits", effort: "high" } as const;
  const bools = [false, true];
  const combos: Touched[] = bools.flatMap((model) =>
    bools.flatMap((mode) => bools.map((effort) => ({ model, mode, effort }))),
  );

  it.each(combos)(
    "model touched $model, mode touched $mode, effort touched $effort",
    (touched: Touched) => {
      const restore = initialRestore(touched, baseRepo);
      const expected: Record<string, string> = {};
      if (!touched.model) expected["model"] = stored.model;
      if (!touched.mode) expected["mode"] = stored.mode;
      if (!touched.effort) expected["effort"] = stored.effort;
      expect(restore).toStrictEqual(expected);
      expect("model" in restore).toBe(!touched.model);
      expect("mode" in restore).toBe(!touched.mode);
      expect("effort" in restore).toBe(!touched.effort);
    },
  );

  it("falls back to sonnet for an untouched model when the repo has no lastModel", () => {
    const repo: Repo = { ...baseRepo, lastModel: null };
    const touched: Touched = { model: false, mode: false, effort: false };
    expect(initialRestore(touched, repo).model).toBe("sonnet");
  });

  it.each([
    ["no lastEffort", null],
    ["a level the dialog has no radio for", "someFutureLevel"],
    ["an empty string", ""],
  ])(
    "falls back to the default radio for an untouched effort when the repo has %s",
    (_l, lastEffort) => {
      const repo: Repo = { ...baseRepo, lastEffort };
      const touched: Touched = { model: false, mode: false, effort: false };
      expect(initialRestore(touched, repo).effort).toBe("");
    },
  );

  it("falls back to auto (via permissionModeToCheck) for an untouched mode when the repo has no lastPermissionMode", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: null };
    const touched: Touched = { model: false, mode: false, effort: false };
    expect(initialRestore(touched, repo).mode).toBe("auto");
  });

  it("falls back to auto for an untouched mode the dialog has no radio for", () => {
    const repo: Repo = { ...baseRepo, lastPermissionMode: "someFutureMode" };
    const touched: Touched = { model: false, mode: false, effort: false };
    expect(initialRestore(touched, repo).mode).toBe("auto");
  });

  it("never falls back to sonnet or auto for a touched field, even with nothing to restore", () => {
    const repo: Repo = { ...baseRepo, lastModel: null, lastPermissionMode: null, lastEffort: null };
    const touched: Touched = { model: true, mode: true, effort: true };
    expect(initialRestore(touched, repo)).toStrictEqual({});
  });
});

// review-maintainability cycle 1 Minor 2: repoRestore is the one owner of "what would
// this repo's directory restore to", unfiltered by touched — buildRecentButton's click
// handler (features/launch.ts) applies it unconditionally, and initialRestore (above)
// applies it through the touched filter. Covering it directly here pins that contract
// independently of initialRestore's filtering.
describe("repoRestore (review-maintainability cycle 1 Minor 2)", () => {
  it("returns the repo's stored model, mode and effort unfiltered", () => {
    expect(repoRestore(baseRepo)).toStrictEqual({
      model: "opus",
      mode: "acceptEdits",
      effort: "high",
    });
  });

  it.each([
    ["a stored level", "max", "max"],
    ["no stored effort", null, ""],
    ["a level with no radio", "someFutureLevel", ""],
  ])("maps %s to the Effort radio value", (_label, lastEffort, radio) => {
    expect(repoRestore({ ...baseRepo, lastEffort }).effort).toBe(radio);
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

// DefaultRestore is the failed-lookup / no-recents restore. It
// shares initialRestore's touched filter: every untouched field gets its default, every
// touched field's key is absent.
describe("defaultRestore (plan launch-dialog-fixes REQ-3)", () => {
  const defaults = { model: "sonnet", mode: "auto", effort: "" } as const;
  const bools = [false, true];
  const combos: Touched[] = bools.flatMap((model) =>
    bools.flatMap((mode) => bools.map((effort) => ({ model, mode, effort }))),
  );

  it.each(combos)(
    "model touched $model, mode touched $mode, effort touched $effort",
    (touched: Touched) => {
      const restore = defaultRestore(touched);
      const expected: Record<string, string> = {};
      if (!touched.model) expected["model"] = defaults.model;
      if (!touched.mode) expected["mode"] = defaults.mode;
      if (!touched.effort) expected["effort"] = defaults.effort;
      expect(restore).toStrictEqual(expected);
      expect("model" in restore).toBe(!touched.model);
      expect("mode" in restore).toBe(!touched.mode);
      expect("effort" in restore).toBe(!touched.effort);
    },
  );

  it("uses DEFAULT_MODEL for the model", () => {
    const touched: Touched = { model: false, mode: false, effort: false };
    expect(defaultRestore(touched).model).toBe(DEFAULT_MODEL);
  });

  it.each(combos)(
    "matches initialRestore of a repo with nothing stored (model $model, mode $mode, effort $effort touched)",
    (touched: Touched) => {
      const blank: Repo = {
        ...baseRepo,
        lastModel: null,
        lastPermissionMode: null,
        lastEffort: null,
      };
      expect(defaultRestore(touched)).toStrictEqual(initialRestore(touched, blank));
    },
  );
});

describe("DEFAULT_MODEL", () => {
  it("is sonnet — resetForm's (features/launch.ts) brand-new-form default and repoRestore's fallback share this one literal", () => {
    expect(DEFAULT_MODEL).toBe("sonnet");
  });
});
