// The launch dialog's Recent-directories list, child listing, and footer readout — split
// out of features/launch.ts (docs/conventions.md § Composition roots: DOM building belongs
// in `render/`, matching render/crumbs.ts's shape — elements/values in, an `onSelect`
// callback out). The
// controller (features/launch.ts) still owns navigation, restore and all daemon calls;
// these builders never call `navigate` themselves, only report which repo/entry was
// picked.
import type { BrowseEntry, Repo } from "../api/launch";
import { formatAge } from "../sessions/format";

function buildRecentButton(
  template: HTMLTemplateElement,
  repo: Repo,
  now: Date,
  selected: boolean,
  onSelect: (repo: Repo) => void,
): HTMLButtonElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const button = fragment.querySelector<HTMLButtonElement>("button.dir");
  if (!button) throw new Error("mru-entry-template is missing its button");
  const name = button.querySelector<HTMLElement>(".dir-name");
  const branch = button.querySelector<HTMLElement>(".dir-branch");
  const age = button.querySelector<HTMLElement>(".dir-age");
  if (name) name.textContent = repo.name;
  if (branch) branch.textContent = repo.branch ?? "—";
  if (age) age.textContent = formatAge(repo.lastLaunchedAt, now);
  // The full path lives in `title`; the visible entry stays name · branch · age.
  button.title = repo.path;
  // `aria-pressed` is derived, never stored — recomputed on every render from whether
  // this repo's path equals the current selection.
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  button.addEventListener("click", () => onSelect(repo));
  return button;
}

/** The Recent list: nothing beneath the heading while the MRU fetch hasn't resolved
 * yet (States: "no data yet"), "No recent directories" once it has and came back empty,
 * else one button per repo (`selectedPath` decides which carries `aria-pressed`). */
export function renderRecentsList(
  container: HTMLElement,
  template: HTMLTemplateElement,
  repos: readonly Repo[],
  reposLoaded: boolean,
  selectedPath: string | null,
  onSelect: (repo: Repo) => void,
): void {
  if (!reposLoaded) {
    container.replaceChildren();
    return;
  }
  if (repos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No recent directories";
    container.replaceChildren(empty);
    return;
  }
  const now = new Date();
  container.replaceChildren(
    ...repos.map((repo) =>
      buildRecentButton(template, repo, now, repo.path === selectedPath, onSelect),
    ),
  );
}

function buildBrowseEntryButton(
  template: HTMLTemplateElement,
  dir: BrowseEntry,
  onSelect: (path: string) => void,
): HTMLButtonElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const button = fragment.querySelector<HTMLButtonElement>("button.entry");
  if (!button) throw new Error("subdir-entry-template is missing its button");
  const nm = button.querySelector<HTMLElement>(".nm");
  if (nm) nm.textContent = dir.name;
  if (dir.isGit) {
    const git = document.createElement("span");
    git.className = "git";
    git.textContent = " (git)";
    button.querySelector(".chev")?.before(git);
  }
  button.addEventListener("click", () => onSelect(dir.path));
  return button;
}

/** The child listing: an empty region while `current` is null (daemon-down /
 * never-succeeded — never "No subdirectories", which would claim knowledge Muster does
 * not have, design-system §6 honesty rules), "No subdirectories" once a listing landed
 * empty, else one button per entry. */
export function renderBrowseListing(
  container: HTMLElement,
  template: HTMLTemplateElement,
  dirs: readonly BrowseEntry[] | null,
  onSelect: (path: string) => void,
): void {
  if (!dirs) {
    container.replaceChildren();
    return;
  }
  if (dirs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No subdirectories";
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...dirs.map((dir) => buildBrowseEntryButton(template, dir, onSelect)));
}

export function renderBrowseLoading(container: HTMLElement): void {
  const loading = document.createElement("p");
  loading.className = "loading";
  loading.textContent = "loading…";
  container.replaceChildren(loading);
}

/** The footer's target readout: an em dash and no branch while nothing is listed yet,
 * else the path and — the browse endpoint never reports the listed directory's own
 * branch, so the only honest source is a recent whose served path matches — that
 * recent's branch when there is one. */
export function renderLaunchFooter(
  pathEl: HTMLElement,
  branchEl: HTMLElement,
  path: string | null,
  branch: string | null,
): void {
  if (!path) {
    pathEl.textContent = "—";
    branchEl.hidden = true;
    branchEl.textContent = "";
    return;
  }
  pathEl.textContent = path;
  if (branch) {
    branchEl.textContent = ` · ${branch}`;
    branchEl.hidden = false;
  } else {
    branchEl.textContent = "";
    branchEl.hidden = true;
  }
}
