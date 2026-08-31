// Breadcrumb model for the launch dialog's browse pane (plan new-session-dialog, REQ-5/
// REQ-6). `splitCrumbs` is the pure half — unit-tested by web-tests — turning an absolute
// path into its ordered ancestor chain, root first. `renderCrumbs` is the tiny DOM half
// that draws it into the `<nav>` (mockup: plans/new-session-dialog/mockup.html), used only
// by render/launch.ts.

export interface Crumb {
  name: string;
  path: string;
}

/** Splits an absolute path into its ancestor chain, root first: `"/a/b"` ->
 * `[{name:"/",path:"/"},{name:"a",path:"/a"},{name:"b",path:"/a/b"}]`. `"/"` alone yields
 * the single root crumb. A trailing slash is tolerated (stripped before splitting) — the
 * daemon's `GET /api/browse` never rejects one, so the picker shouldn't choke on one
 * either (edge case 6 / W2 unit tests). Names are split on `/` only, never re-escaped, so
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

/** Renders `crumbs` into `nav`: every ancestor as a clickable `<button data-path>`
 * separated by an `aria-hidden` `›`, the last as the non-clickable `<span
 * aria-current="location">`, followed by the decorative `⌘↑` kbd (UI Specifications: the
 * mockup's `#browse-crumbs` structure). `onNavigate` fires on an ancestor click. */
export function renderCrumbs(nav: HTMLElement, crumbs: readonly Crumb[], onNavigate: (path: string) => void): void {
  const nodes: HTMLElement[] = [];
  crumbs.forEach((crumb, index) => {
    if (index === crumbs.length - 1) {
      const current = document.createElement("span");
      current.setAttribute("aria-current", "location");
      current.textContent = crumb.name;
      nodes.push(current);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.path = crumb.path;
    button.title = crumb.path;
    button.textContent = crumb.name;
    button.addEventListener("click", () => onNavigate(crumb.path));
    nodes.push(button);
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "›";
    nodes.push(sep);
  });
  const kbd = document.createElement("span");
  kbd.className = "kbd";
  kbd.setAttribute("aria-hidden", "true");
  kbd.textContent = "⌘↑";
  nodes.push(kbd);
  nav.replaceChildren(...nodes);
  // review Minor 2: on a deep path the bar overflows `.crumbs`'s own `overflow-x: auto`
  // (edge case 14 sanctions the scroll, not resting at its start) and a fresh render
  // otherwise leaves scrollLeft at 0 — the current-directory segment and the `⌘↑` hint
  // scrolled out of view behind the ancestors. Snap to the end so what's on screen is
  // where you are, not where you started.
  nav.scrollLeft = nav.scrollWidth;
}
