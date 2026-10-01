// Shared DOM builder for the two-line repo readout — the rail card's `.r2` and `.r2c`
// and the Focus header's `.repo` and `.claude-at` are the same `RepoParts` rendered four
// times (kb:adr/rail-repo-line-wraps-at-slash). DOM only: the text is composed in
// ../sessions/card.ts.
import { requireElement } from "../dom";
import type { RepoParts } from "../sessions/card";

/** Writes `parts` into `host`, whose template always holds a `.rf` (folder line). The
 * `.rb` (branch line) is created on first need and removed when `parts.branch` is null, so
 * a session with no repo renders one line and no empty second one. Both lines are plain
 * readouts, so no focus or selection state rides on them across a render tick. */
export function renderRepoLines(host: HTMLElement, parts: RepoParts): void {
  requireElement<HTMLElement>(".rf", host).textContent = parts.folder;
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
