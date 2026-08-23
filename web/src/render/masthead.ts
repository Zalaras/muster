// Pure DOM updates for the masthead: connection status, usage readouts, Claude Code
// version/drift. Brand ("Muster") is static markup in index.html — nothing to render.
//
// Honesty rules (design-system §6.1): a null usage bucket renders the word "unknown"
// and no track/gauge markup at all — never a 0%-filled bar.
import type { ClaudeCodeInfo, Density, SessionModelInfo, Usage, UsageBucket } from "../protocol";
import { formatResets, GAUGE_WARN_THRESHOLD } from "../sessions/format";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export function renderConnectionStatus(el: HTMLElement, status: ConnectionStatus): void {
  const text = status === "connected" ? "connected" : status === "reconnecting" ? "reconnecting…" : "connecting…";
  el.textContent = text;
}

export interface UsageElements {
  fiveHour: HTMLElement;
  sevenDay: HTMLElement;
}

/** Builds the bucket's permanent label/number pair (mockup `.gauge` -> `.lbl`/`.num`,
 * `mockups/a-instrument.html:199`) fresh every call — `el.replaceChildren(...)` clears
 * whatever `renderUsageTrack` appended on the previous pass (the bar/resets nodes), which
 * is what makes that function's honesty-rule early return self-healing on a known->unknown
 * transition (see its doc comment): every render pass starts this element from exactly
 * `[.lbl, .num]` before `renderUsageTrack` gets a chance to insert a bar between them. */
function renderBucket(el: HTMLElement, label: string, bucket: UsageBucket | null): void {
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = label;

  const num = document.createElement("span");
  num.className = "num";
  num.textContent = bucket ? `${Math.round(bucket.usedPct)}%` : "unknown";

  el.replaceChildren(lbl, num);
}

export function renderUsage(elements: UsageElements, usage: Usage): void {
  renderBucket(elements.fiveHour, "5h", usage.fiveHour);
  renderBucket(elements.sevenDay, "7d", usage.sevenDay);
}

export interface ViewSwitcherElements {
  focusButton: HTMLButtonElement;
  tilesButton: HTMLButtonElement;
}

/** Focus/Tiles segmented control (design-system §4.1) — the M1 slot design-system §8
 * required to be laid out from the start now gets filled in. `aria-pressed` is the
 * Testable UI Elements contract for both buttons. */
export function renderViewSwitcher(elements: ViewSwitcherElements, view: "focus" | "tiles"): void {
  elements.focusButton.setAttribute("aria-pressed", String(view === "focus"));
  elements.tilesButton.setAttribute("aria-pressed", String(view === "tiles"));
}

export interface DensityControlElements {
  container: HTMLElement;
  twoByTwoButton: HTMLButtonElement;
  threeByTwoButton: HTMLButtonElement;
}

/** The density control renders only in Tiles (design-system §4/UI Specifications:
 * "Masthead ... the density control renders only in Tiles"). */
export function renderDensityControl(elements: DensityControlElements, view: "focus" | "tiles", density: Density): void {
  elements.container.hidden = view !== "tiles";
  elements.twoByTwoButton.setAttribute("aria-pressed", String(density === "2x2"));
  elements.threeByTwoButton.setAttribute("aria-pressed", String(density === "3x2"));
}

/** M3 (REQ-11/REQ-14, design-system §5 "Gauge thresholds"): inserts the masthead usage
 * bar's track-fill between `.lbl` and `.num`, and appends the reset-time suffix after
 * `.num` — into the *same* bucket element `renderUsage` above just rebuilt
 * (`#usage-5h`/`#usage-7d` — the Testable UI Elements table's "existing element
 * upgraded"). Must be called immediately after `renderUsage` on the same element, every
 * render pass: `renderUsage` always calls `replaceChildren`, which clears any
 * previously-appended track/resets nodes back down to a bare `[.lbl, .num]`, so this
 * function starts from a clean slate every time rather than needing to find or remove
 * stale markup itself — that's also what makes the honesty rule (below) self-healing
 * across a value going from known back to unknown (e.g. REQ-7's masthead reset to
 * unknown after a daemon restart).
 *
 * Final child order mirrors the reference render (`mockups/a-instrument.html:199`):
 * `.lbl`, `.bar`, `.num`, `.resets` — the bar reads before the number, not after.
 *
 * Honesty rule 1 (design-system §6.1): a null bucket inserts nothing at all — no `<i>`
 * fill element, never a 0%-width one, and no resets text. */
export function renderUsageTrack(el: HTMLElement, bucket: UsageBucket | null, now: Date): void {
  if (!bucket) return;

  const bar = document.createElement("span");
  bar.className = bucket.usedPct >= GAUGE_WARN_THRESHOLD ? "bar warn" : "bar";
  const fill = document.createElement("i");
  fill.style.width = `${Math.round(bucket.usedPct)}%`;
  bar.appendChild(fill);

  const resets = document.createElement("span");
  resets.className = "resets";
  resets.textContent = `· ${formatResets(bucket.resetsAt, now)}`;

  const num = el.querySelector(".num");
  el.insertBefore(bar, num);
  el.appendChild(resets);
}

/** REQ-12: the masthead model readout — the Usage object's freshest-sample model,
 * verbatim. Empty/hidden while null (no hydration at boot, REQ-7; also null again right
 * after a daemon restart until the next status post). Accepts `undefined` too since
 * `Usage.model` is an optional wire field (protocol.ts) — a pre-M3-shaped payload that
 * omits it entirely reads the same as an explicit null. */
export function renderUsageModel(el: HTMLElement, model: SessionModelInfo | null | undefined): void {
  if (!model) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = model.displayName;
}

export function renderClaudeVersion(el: HTMLElement, info: ClaudeCodeInfo | null): void {
  if (!info) {
    el.textContent = "claude unknown";
    return;
  }
  if (info.installed === null) {
    el.textContent = `claude ${info.pinned} (installed unknown)`;
    return;
  }
  if (info.drift) {
    el.textContent = `claude ${info.installed} (drift from pinned ${info.pinned})`;
    return;
  }
  el.textContent = `claude ${info.installed}`;
}
