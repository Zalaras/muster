// Shared DOM builder for the two-line repo readout — the rail card's `.r2` and `.r2c`
// and the Focus header's `.repo` and `.claude-at` are the same `RepoParts` rendered four
// times (kb:adr/rail-repo-line-wraps-at-slash). DOM only: the text is composed in
// ../sessions/card.ts.
import { requireElement, setText } from "../dom";
import type { RepoParts } from "../sessions/card";

function writeFolder(rf: HTMLElement, folder: string, addedCount: number): void {
  if (addedCount === 0) {
    rf.classList.remove("has-plus");
    rf.textContent = folder;
    return;
  }
  let name = rf.querySelector<HTMLElement>(":scope > .rf-name");
  let plus = rf.querySelector<HTMLElement>(":scope > .plus");
  if (!name || !plus) {
    name = document.createElement("span");
    name.className = "rf-name";
    plus = document.createElement("span");
    plus.className = "plus";
    rf.replaceChildren(name, plus);
  }
  rf.classList.add("has-plus");
  setText(name, folder);
  setText(plus, `+${addedCount}`);
}

/** Writes `parts` into `host`, whose template always holds a `.rf` (folder line). The
 * `.rb` (branch line) is created on first need and removed when `parts.branch` is null, so
 * a session with no repo renders one line and no empty second one. Both lines are plain
 * readouts, so no focus or selection state rides on them across a render tick. */
export function renderRepoLines(host: HTMLElement, parts: RepoParts, addedCount = 0): void {
  writeFolder(requireElement<HTMLElement>(".rf", host), parts.folder, addedCount);
  let branch = host.querySelector<HTMLElement>(".rb");
  if (parts.branch === null) {
    branch?.remove();
    return;
  }
  if (!branch) {
    branch = document.createElement("span");
    branch.className = "rb";
    host.append(branch);
  }
  branch.textContent = parts.branch;
}
