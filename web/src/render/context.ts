// Shared DOM builder for the context-row gauge — the rail/strip card's `.r3` row and
// the tile header's `.ctxinfo` span are the same view-model rendered twice (one
// derivation, two renderers; docs/design/mockups/a-instrument.html lines 103-111 /
// d-tiled.html's `.thead .ctx`). DOM only — derivation lives in ../sessions/context.ts.
import { setText } from "../dom";
import type { SessionContext } from "../protocol/session";
import { buildContextRowViewModel } from "../sessions/context";

/** `baseClass` is the caller's own class name (`"r3"` for rail/strip cards, `"ctxinfo"`
 * for tiles) — reset on every render so an `unk` modifier from a prior unknown render
 * never lingers once real data arrives, and vice versa (e.g. after `/clear`, which resets
 * the gauge without changing session identity — kb:adr/lifecycle-alive-flag-not-a-state).
 *
 * Honesty rule 1 (design-system §6.1): unknown context sets plain text and never builds
 * a track element at all — a 0%-filled track would read as "0% used". Known context
 * builds track + rounded percent + compact tokens (+ the compaction counter when positive)
 * once, then updates those same nodes on every later pass: Chrome fires no `click` when the
 * pressed element is replaced before the release, so a row rebuilt each render swallows a
 * press on it. */
export function renderContextRow(
  el: HTMLElement,
  context: SessionContext,
  baseClass: string,
): void {
  const vm = buildContextRowViewModel(context);

  if (!vm.known) {
    el.className = `${baseClass} unk`;
    el.textContent = `ctx unknown${vm.compactions > 0 ? ` ⟳${vm.compactions}` : ""}`;
    return;
  }

  el.className = baseClass;
  const row = knownRowOf(el) ?? buildKnownRow(el);
  row.track.className = vm.hot ? "ctx hot" : "ctx";
  row.fill.style.width = `${vm.pct}%`;
  setText(row.pct, `${vm.pct}%`);
  setText(row.tok, vm.tokensText ?? "");
  syncCompactCounter(el, row.compact, vm.compactions);
}

interface KnownRow {
  track: HTMLElement;
  fill: HTMLElement;
  pct: HTMLElement;
  tok: HTMLElement;
  compact: HTMLElement | null;
}

function knownRowOf(el: HTMLElement): KnownRow | null {
  const [track, pct, tok, compact] = Array.from(el.children);
  const fill = track?.firstElementChild;
  if (!(track instanceof HTMLElement) || !track.classList.contains("ctx")) return null;
  if (!(fill instanceof HTMLElement) || !(pct instanceof HTMLElement)) return null;
  if (!(tok instanceof HTMLElement)) return null;
  return {
    track,
    fill,
    pct,
    tok,
    compact: compact instanceof HTMLElement ? compact : null,
  };
}

function buildKnownRow(el: HTMLElement): KnownRow {
  const track = document.createElement("span");
  const fill = document.createElement("i");
  track.appendChild(fill);
  const pct = document.createElement("span");
  const tok = document.createElement("span");
  tok.className = "tok";
  el.replaceChildren(track, pct, tok);
  return { track, fill, pct, tok, compact: null };
}

function syncCompactCounter(el: HTMLElement, existing: HTMLElement | null, compactions: number) {
  if (compactions <= 0) {
    existing?.remove();
    return;
  }
  const compactEl = existing ?? el.appendChild(document.createElement("span"));
  compactEl.className = "compact";
  setText(compactEl, `⟳${compactions}`);
}
