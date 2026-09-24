// Pure nav-tree logic — nests the listing's relative `.md` paths,
// counts files per folder and filters by substring. No DOM: render/reader.ts walks the
// result to build/update the nav; features/reader.ts owns which folders are manually
// toggled open (docs/conventions.md: keep derivation pure, separate from DOM code).

export interface FileEntry {
  readonly kind: "file";
  readonly name: string;
  /** Relative to the session directory, forward slashes — the listing's own shape. */
  readonly path: string;
}

export interface DirEntry {
  readonly kind: "dir";
  readonly name: string;
  readonly path: string;
  /** `buildTree` always starts a folder collapsed; `filterTree` sets this `true`
   * on every ancestor of a match. Manual toggling is render/reader.ts's own
   * state, applied on top of whichever tree (base or filtered) is current. */
  readonly expanded: boolean;
  readonly children: readonly TreeEntry[];
}

export type TreeEntry = DirEntry | FileEntry;

function compareEntries(a: TreeEntry, b: TreeEntry): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

interface MutableDir {
  name: string;
  path: string;
  dirs: Map<string, MutableDir>;
  files: FileEntry[];
}

function newDir(name: string, path: string): MutableDir {
  return { name, path, dirs: new Map(), files: [] };
}

function finalize(dir: MutableDir): DirEntry {
  const children: TreeEntry[] = [...Array.from(dir.dirs.values(), finalize), ...dir.files].sort(
    compareEntries,
  );
  return { kind: "dir", name: dir.name, path: dir.path, expanded: false, children };
}

/** Nests every relative `.md` path into a tree — folders before files, both
 * alphabetical, every folder starting collapsed. `paths` are forward-slash relative
 * paths exactly as the listing wire shape carries them. */
export function buildTree(paths: readonly string[]): readonly TreeEntry[] {
  const root = newDir("", "");
  for (const path of paths) {
    const segments = path.split("/");
    let dir = root;
    for (const name of segments.slice(0, -1)) {
      const dirPath = dir.path ? `${dir.path}/${name}` : name;
      const existing = dir.dirs.get(name);
      const child = existing ?? newDir(name, dirPath);
      if (!existing) dir.dirs.set(name, child);
      dir = child;
    }
    const fileName = segments[segments.length - 1] ?? path;
    dir.files.push({ kind: "file", name: fileName, path });
  }
  return finalize(root).children;
}

/** Recursive file count under one entry — 1 for a file, the sum over its children for a
 * folder (the nav's folder-count badges and the `Files` header's `<n> .md`). */
export function countFiles(node: TreeEntry): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function collectMatches(node: TreeEntry, query: string): TreeEntry | null {
  if (node.kind === "file") {
    return node.path.toLowerCase().includes(query) ? node : null;
  }
  const children = node.children
    .map((child) => collectMatches(child, query))
    .filter((child): child is TreeEntry => child !== null);
  if (children.length === 0) return null;
  return { ...node, expanded: true, children };
}

export interface FlatTreeEntry {
  kind: "dir" | "file";
  path: string;
  name: string;
  /** Nesting depth from the tree's roots (0-based) — render/reader.ts clamps this to the
   * `d0`…`d5` CSS classes the design authorizes. */
  depth: number;
  expanded?: boolean;
  /** Recursive file count (dirs only) — undefined on a file entry. */
  count?: number;
  /** Dirs never carry this; only files and the plan slot can be "dirty". */
  dirty?: boolean;
  /** The currently-open file. */
  current?: boolean;
}

export interface FlattenOptions {
  isDirty(path: string): boolean;
  isCurrent(path: string): boolean;
}

/** Walks a tree into the flat, depth-tagged list render/reader.ts draws — a folder's own
 * `expanded` (set by `filterTree`'s forced-open ancestors) or the caller's own manual
 * toggle state decides whether its children are included at all, mirroring the DOM spec's
 * "folder children are rendered only while expanded (no `hidden` toggling of thousands of
 * nodes)". Pure — no DOM, so it's Vitest-testable like the rest of this module. */
export function flattenTree(
  entries: readonly TreeEntry[],
  manuallyExpanded: ReadonlySet<string>,
  opts: FlattenOptions,
  depth = 0,
): FlatTreeEntry[] {
  const out: FlatTreeEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "file") {
      out.push({
        kind: "file",
        path: entry.path,
        name: entry.name,
        depth,
        dirty: opts.isDirty(entry.path),
        current: opts.isCurrent(entry.path),
      });
      continue;
    }
    const expanded = entry.expanded || manuallyExpanded.has(entry.path);
    out.push({
      kind: "dir",
      path: entry.path,
      name: entry.name,
      depth,
      expanded,
      count: countFiles(entry),
    });
    if (expanded) out.push(...flattenTree(entry.children, manuallyExpanded, opts, depth + 1));
  }
  return out;
}

/** A case-insensitive substring match on the relative path, keeping only
 * matching files and expanding every ancestor folder that leads to one. An empty (or
 * whitespace-only) query returns `tree` unchanged — clearing the filter box "restores
 * the collapsed tree" because features/reader.ts also drops its own manual-expand set
 * back to empty whenever the query goes back to empty, not because this function
 * remembers anything. */
export function filterTree(tree: readonly TreeEntry[], query: string): TreeEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return tree as TreeEntry[];
  return tree
    .map((node) => collectMatches(node, trimmed))
    .filter((node): node is TreeEntry => node !== null);
}
