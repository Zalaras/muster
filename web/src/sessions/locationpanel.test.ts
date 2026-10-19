import { describe, expect, it } from "vitest";
import type { AddedDirectory, Session } from "../protocol/session";
import { locationPanelModel } from "./locationpanel";
import { makeSession } from "./testfixtures";

const infra: AddedDirectory = {
  directory: "/Users/bob/code/infra",
  repo: { name: "infra", branch: "main", isWorktree: false },
};
const detached: AddedDirectory = {
  directory: "/Users/bob/code/lib",
  repo: { name: "lib", branch: null, isWorktree: false },
};
const scratch: AddedDirectory = { directory: "/tmp/scratch/", repo: null };
const muster = { name: "muster", branch: "main", isWorktree: false };

type Model = ReturnType<typeof locationPanelModel>;

describe("locationPanelModel (REQ-7)", () => {
  const cases: Array<{
    name: string;
    session: Partial<Session>;
    check: (m: Model) => void;
  }> = [
    {
      name: "launch row only: no claudeAt, no added section",
      session: { directory: "/Users/bob/code/muster", repo: muster },
      check: (m) => {
        expect(m.launch).toEqual({
          folder: "muster",
          branch: "main",
          path: "/Users/bob/code/muster",
        });
        expect(m.claudeAt).toBeNull();
        expect(m.added).toBeNull();
      },
    },
    {
      name: "launch without a repo: the basename, null branch",
      session: { directory: "/Users/bob/code/muster", repo: null },
      check: (m) =>
        expect(m.launch).toEqual({
          folder: "muster",
          branch: null,
          path: "/Users/bob/code/muster",
        }),
    },
    {
      name: "moved: a claudeAt row appears",
      session: {
        claudeLocation: {
          directory: "/Users/bob/code/muster/.claude/worktrees/e7b",
          repo: { name: "e7b", branch: "worktree-e7b", isWorktree: true },
        },
      },
      check: (m) =>
        expect(m.claudeAt).toEqual({
          folder: "e7b",
          branch: "worktree-e7b",
          path: "/Users/bob/code/muster/.claude/worktrees/e7b",
        }),
    },
    {
      name: "added directories: heading counts them and rows keep wire order",
      session: { addedDirs: [scratch, infra, detached] },
      check: (m) => {
        expect(m.added?.heading).toBe("Added directories · 3");
        expect(m.added?.rows.map((r) => r.path)).toEqual([
          "/tmp/scratch/",
          "/Users/bob/code/infra",
          "/Users/bob/code/lib",
        ]);
      },
    },
    {
      name: "added rows: a repo gives folder and branch; a null repo or null branch gives folder alone",
      session: { addedDirs: [infra, detached, scratch] },
      check: (m) =>
        expect(m.added?.rows.map((r) => [r.folder, r.branch])).toEqual([
          ["infra", "main"],
          ["lib", null],
          ["scratch", null],
        ]),
    },
    {
      name: "one added directory: heading reads · 1",
      session: { addedDirs: [infra] },
      check: (m) => expect(m.added?.heading).toBe("Added directories · 1"),
    },
  ];
  for (const { name, session, check } of cases) {
    it(name, () => check(locationPanelModel(makeSession({ id: 1, ...session }))));
  }
});
