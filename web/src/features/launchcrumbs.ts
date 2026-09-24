// Breadcrumb path-splitting for the launch dialog's browse pane — split out of
// render/crumbs.ts: a DOM-free decision with one controller caller, features/launch.ts,
// lives beside it (docs/conventions.md § Composition roots). `render/crumbs.ts`'s
// `renderCrumbs` stays the DOM half, taking the `Crumb[]` this produces as a parameter.
import type { Crumb } from "../render/crumbs";

/** Splits an absolute path into its ancestor chain, root first: `"/a/b"` ->
 * `[{name:"/",path:"/"},{name:"a",path:"/a"},{name:"b",path:"/a/b"}]`. `"/"` alone yields
 * the single root crumb. A trailing slash is tolerated (stripped before splitting) — the
 * daemon's `GET /api/browse` never rejects one, so the picker shouldn't choke on one
 * either. Names are split on `/` only, never re-escaped, so
 * spaces and unicode in a path component pass through untouched. */
export function splitCrumbs(path: string): Crumb[] {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const parts = trimmed.split("/").filter((part) => part.length > 0);
  const crumbs: Crumb[] = [{ name: "/", path: "/" }];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ name: part, path: acc });
  }
  return crumbs;
}
