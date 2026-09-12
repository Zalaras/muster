// Shared DOM builder for the M3 context-row gauge — the rail/strip card's `.r3` row and
// the tile header's `.ctxinfo` span are the same view-model rendered twice (REQ-13's
// "one derivation, two renderers"; docs/design/mockups/a-instrument.html lines 103-111 /
// d-tiled.html's `.thead .ctx`). DOM only — derivation lives in ../sessions/context.ts.
import type { SessionContext } from "../protocol";
import { buildContextRowViewModel } from "../sessions/context";

/** `baseClass` is the caller's own class name (`"r3"` for rail/strip cards, `"ctxinfo"`
 * for tiles) — reset on every render so an `unk` modifier from a prior unknown render
 * never lingers once real data arrives, and vice versa (e.g. after `/clear`, REQ-9).
 *
 * Honesty rule 1 (design-system §6.1): unknown context sets plain text and never builds
 * a track element at all — a 0%-filled track would read as "0% used". Known context
 * replaces `el`'s children with track + rounded percent + compact tokens + (when
 * positive) the compaction counter. */
export function renderContextRow(
  el: HTMLElement,
  context: SessionContext,
  baseClass: string,
): void {
  const vm = buildContextRowViewModel(context);
  const suffix = vm.compactions > 0 ? ` ⟳${vm.compactions}` : "";

  if (!vm.known) {
    el.className = `${baseClass} unk`;
    el.textContent = `ctx unknown${suffix}`;
    return;
  }

  el.className = baseClass;

  const track = document.createElement("span");
  track.className = vm.hot ? "ctx hot" : "ctx";
  const fill = document.createElement("i");
  fill.style.width = `${vm.pct}%`;
  track.appendChild(fill);

  const pctEl = document.createElement("span");
  pctEl.textContent = `${vm.pct}%`;

  const tokEl = document.createElement("span");
  tokEl.className = "tok";
  tokEl.textContent = vm.tokensText ?? "";

  const children: HTMLElement[] = [track, pctEl, tokEl];
  if (vm.compactions > 0) {
    const compactEl = document.createElement("span");
    compactEl.className = "compact";
    compactEl.textContent = `⟳${vm.compactions}`;
    children.push(compactEl);
  }
  el.replaceChildren(...children);
}
