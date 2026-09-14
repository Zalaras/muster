// Plan markdown-viewing (W5/W6, REQ-10/REQ-11/REQ-12/REQ-13): buildTree/countFiles/
// filterTree/flattenTree are the reader nav's pure derivation — no DOM, per this
// module's own header comment.
import { describe, expect, it } from "vitest";
import {
  buildTree,
  countFiles,
  filterTree,
  flattenTree,
  type DirEntry,
  type TreeEntry,
} from "./tree";

const NOOP_OPTS = { isDirty: () => false, isCurrent: () => false };

describe("buildTree (REQ-10)", () => {
  it("nests a nested path into folders", () => {
    const tree = buildTree(["docs/adr/x.md"]);
    expect(tree).toEqual([
      {
        kind: "dir",
        name: "docs",
        path: "docs",
        expanded: false,
        children: [
          {
            kind: "dir",
            name: "adr",
            path: "docs/adr",
            expanded: false,
            children: [{ kind: "file", name: "x.md", path: "docs/adr/x.md" }],
          },
        ],
      },
    ]);
  });

  it("sorts folders before files at the same level", () => {
    const tree = buildTree(["b.md", "a/c.md"]);
    expect(tree.map((e) => e.kind)).toEqual(["dir", "file"]);
  });

  it("sorts folders alphabetically among themselves", () => {
    const tree = buildTree(["b/x.md", "a/x.md"]);
    expect(tree.map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("sorts files alphabetically among themselves", () => {
    const tree = buildTree(["b.md", "a.md"]);
    expect(tree.map((e) => e.name)).toEqual(["a.md", "b.md"]);
  });

  it("every folder starts collapsed", () => {
    const tree = buildTree(["a/b/c.md"]);
    const dir = tree[0] as DirEntry;
    expect(dir.expanded).toBe(false);
    expect((dir.children[0] as DirEntry).expanded).toBe(false);
  });

  it("merges two files under the same folder into one folder entry", () => {
    const tree = buildTree(["docs/a.md", "docs/b.md"]);
    expect(tree).toHaveLength(1);
    const dir = tree[0] as DirEntry;
    expect(dir.children.map((c) => c.name)).toEqual(["a.md", "b.md"]);
  });

  it("returns an empty tree for no paths", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("handles a top-level file with no folder", () => {
    expect(buildTree(["TODO.md"])).toEqual([{ kind: "file", name: "TODO.md", path: "TODO.md" }]);
  });
});

describe("countFiles (recursive, folder-count badges and 'Files' header count)", () => {
  it("is 1 for a single file", () => {
    const tree = buildTree(["a.md"]);
    expect(countFiles(tree[0]!)).toBe(1);
  });

  it("sums recursively across nested folders", () => {
    const tree = buildTree(["docs/a.md", "docs/adr/b.md", "docs/adr/c.md", "TODO.md"]);
    // docs/ (a.md + adr/{b.md,c.md}) = 3
    const docsDir = tree.find((e) => e.name === "docs") as DirEntry;
    expect(countFiles(docsDir)).toBe(3);
  });

  it("counts every file under the whole tree", () => {
    const tree = buildTree(["a.md", "b.md", "dir/c.md"]);
    const total = tree.reduce((sum, e) => sum + countFiles(e), 0);
    expect(total).toBe(3);
  });
});

describe("filterTree (REQ-11: case-insensitive substring match, expands matching ancestors)", () => {
  const paths = ["docs/adr/plan-x.md", "docs/adr/other.md", "TODO.md", "docs/README.md"];

  it("an empty query returns the tree unchanged (identity of contents, still collapsed)", () => {
    const tree = buildTree(paths);
    expect(filterTree(tree, "")).toEqual(tree);
  });

  it("a whitespace-only query is treated as empty", () => {
    const tree = buildTree(paths);
    expect(filterTree(tree, "   ")).toEqual(tree);
  });

  it("keeps only files whose relative path matches, case-insensitively", () => {
    const tree = buildTree(paths);
    const filtered = filterTree(tree, "PLAN");
    const docsDir = filtered.find((e) => e.name === "docs") as DirEntry;
    const adrDir = docsDir.children.find((e) => e.name === "adr") as DirEntry;
    expect(adrDir.children.map((c) => c.name)).toEqual(["plan-x.md"]);
  });

  it("expands every ancestor folder leading to a match", () => {
    const tree = buildTree(paths);
    const filtered = filterTree(tree, "plan");
    const docsDir = filtered.find((e) => e.name === "docs") as DirEntry;
    expect(docsDir.expanded).toBe(true);
    const adrDir = docsDir.children.find((e) => e.name === "adr") as DirEntry;
    expect(adrDir.expanded).toBe(true);
  });

  it("drops folders with no matching descendant entirely", () => {
    const tree = buildTree(paths);
    const filtered = filterTree(tree, "todo");
    expect(filtered.map((e) => e.name)).toEqual(["TODO.md"]);
  });

  it("matches against the full relative path, not just the basename", () => {
    const tree = buildTree(paths);
    const filtered = filterTree(tree, "docs/readme");
    expect(filtered.map((e) => e.name)).toEqual(["docs"]);
  });

  it("returns an empty array when nothing matches", () => {
    const tree = buildTree(paths);
    expect(filterTree(tree, "nonexistent")).toEqual([]);
  });
});

describe("flattenTree (the depth-tagged flat list render/reader.ts draws)", () => {
  it("includes a collapsed folder but not its children", () => {
    const tree = buildTree(["docs/a.md"]);
    const flat = flattenTree(tree, new Set(), NOOP_OPTS);
    expect(flat).toEqual([
      { kind: "dir", path: "docs", name: "docs", depth: 0, expanded: false, count: 1 },
    ]);
  });

  it("includes a folder's children when manually expanded", () => {
    const tree = buildTree(["docs/a.md"]);
    const flat = flattenTree(tree, new Set(["docs"]), NOOP_OPTS);
    expect(flat).toEqual([
      { kind: "dir", path: "docs", name: "docs", depth: 0, expanded: true, count: 1 },
      { kind: "file", path: "docs/a.md", name: "a.md", depth: 1, dirty: false, current: false },
    ]);
  });

  it("includes a folder's children when filterTree already forced it open", () => {
    const tree = filterTree(buildTree(["docs/a.md", "b.md"]), "a.md");
    const flat = flattenTree(tree, new Set(), NOOP_OPTS);
    expect(flat.map((e) => e.path)).toEqual(["docs", "docs/a.md"]);
  });

  it("tags depth correctly across nested folders", () => {
    const tree = buildTree(["a/b/c.md"]);
    const flat = flattenTree(tree, new Set(["a", "a/b"]), NOOP_OPTS);
    expect(flat.map((e) => [e.path, e.depth])).toEqual([
      ["a", 0],
      ["a/b", 1],
      ["a/b/c.md", 2],
    ]);
  });

  it("marks a file dirty per the isDirty callback (REQ-13)", () => {
    const tree = buildTree(["a.md", "b.md"]);
    const flat = flattenTree(tree, new Set(), {
      isDirty: (p) => p === "a.md",
      isCurrent: () => false,
    });
    const a = flat.find((e) => e.path === "a.md")!;
    const b = flat.find((e) => e.path === "b.md")!;
    expect(a.dirty).toBe(true);
    expect(b.dirty).toBe(false);
  });

  it("marks the open file current per the isCurrent callback (REQ-12)", () => {
    const tree = buildTree(["a.md", "b.md"]);
    const flat = flattenTree(tree, new Set(), {
      isDirty: () => false,
      isCurrent: (p) => p === "b.md",
    });
    expect(flat.find((e) => e.path === "a.md")!.current).toBe(false);
    expect(flat.find((e) => e.path === "b.md")!.current).toBe(true);
  });

  it("never marks a directory entry dirty or current — only files carry those flags", () => {
    const tree = buildTree(["docs/a.md"]);
    const flat = flattenTree(tree, new Set(["docs"]), {
      isDirty: () => true,
      isCurrent: () => true,
    });
    const dir = flat.find((e) => e.path === "docs")!;
    expect(dir.dirty).toBeUndefined();
    expect(dir.current).toBeUndefined();
  });

  it("returns an empty list for an empty tree", () => {
    expect(flattenTree([] as readonly TreeEntry[], new Set(), NOOP_OPTS)).toEqual([]);
  });
});
