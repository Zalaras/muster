// Breadcrumb DOM for the launch dialog's browse pane
// (kb:adr/launch-picker-recent-sidebar-plus-browse-list) — draws the `Crumb[]` chain into
// the `<nav>` (mockup: plans/new-session-dialog/mockup.html), used only by
// features/launch.ts. The path-to-chain derivation (`splitCrumbs`) is a DOM-free decision
// that lives beside its one caller, `features/launchcrumbs.ts` (docs/conventions.md §
// Composition roots).

export interface Crumb {
  name: string;
  path: string;
}

/** Renders `crumbs` into `nav`: every ancestor as a clickable `<button data-path>`
 * separated by an `aria-hidden` `›`, the last as the non-clickable `<span
 * aria-current="location">`, followed by the decorative `⌘↑` kbd (the mockup's
 * `#browse-crumbs` structure). `onNavigate` fires on an ancestor click. */
export function renderCrumbs(
  nav: HTMLElement,
  crumbs: readonly Crumb[],
  onNavigate: (path: string) => void,
): void {
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
  // On a deep path the bar overflows `.crumbs`'s own `overflow-x: auto` (the scroll
  // itself is expected, not something to prevent) and a fresh render otherwise leaves
  // scrollLeft at 0 — the current-directory segment and the `⌘↑` hint scrolled out of
  // view behind the ancestors. Snap to the end so what's on screen is where you are, not
  // where you started.
  nav.scrollLeft = nav.scrollWidth;
}
