// Pure DOM updates for the masthead: connection status, usage readouts, Claude Code
// version/verification status. Brand ("Muster") is static markup in index.html — nothing
// to render.
//
// Honesty rules (design-system §6.1): a null usage bucket renders the word "unknown"
// and no track/gauge markup at all — never a 0%-filled bar.
import type { ClaudeCodeInfo, Density, ModelWindow, SessionModelInfo, Usage, UsageBucket } from "../protocol";
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

/** Per-`el` memory for `renderModelWeek`, keyed by the container element so the `<select>`
 * (and its trailing `.num`/`.bar`/`.resets` siblings) can persist across render passes
 * instead of being torn down and rebuilt every tick.
 *
 * review usage-model-bar cycle 1, Critical 1: rebuilding a brand-new `<select>` every
 * pass (via `el.replaceChildren`) is fine for the two sibling `renderBucket` readouts —
 * they hold no interactive state — but this readout's `<select>` is a real focusable
 * control. Passing an *already-attached* node back through `replaceChildren` alongside a
 * sibling still detaches and reinserts it (the multi-argument form adopts every argument
 * into a fragment first, per the DOM "replace all" algorithm), which blurs a focused
 * element and always closes a native `<select>` popup — so preserving focus requires
 * never routing the select through `replaceChildren`/`insertBefore`/`appendChild` again
 * once it's in the tree, not just restoring focus afterwards (`pendingTileFocus` in
 * `main.ts` is that weaker restore-after-rebuild pattern; it doesn't apply here because
 * the open dropdown itself doesn't survive a detach, only focus might). */
interface ModelWeekState {
  select: HTMLSelectElement;
  /** The exact option-name sequence (including a synthesized placeholder, see
   * `renderModelWeek`) the current `select` was built for. A later pass rebuilds from
   * scratch whenever this differs — that's the only path allowed to touch `select`'s
   * position in the DOM again. */
  names: string[];
  /** Whether `names[0]` was a synthesized disabled placeholder when `select` was built
   * (review cycle 2, Major 1). The name sequence alone is not a reliable "did the option
   * set change" signal: a placeholder flip can leave the sequence identical while the
   * per-option `disabled` flags — set once in `buildModelWeek` and never re-synced by the
   * reuse path — need to change (pref `Fable` with list `[Fable, Opus]` and pref `Fable`
   * with list `[Opus]` both produce `["Fable","Opus"]`, but only the second's first option
   * is the disabled placeholder). Comparing this alongside `names` forces the rebuild path
   * whenever that would otherwise be missed — this is the only other state that can vary
   * while producing an identical name sequence, since `hasWindows`/`selectedModel` changes
   * are otherwise reflected in the reuse branch's own field assignments and don't affect
   * option identity. */
  placeholderNeeded: boolean;
  num: HTMLElement;
  bar: HTMLElement | null;
  fill: HTMLElement | null;
  resets: HTMLElement | null;
}

const modelWeekCache = new WeakMap<HTMLElement, ModelWeekState>();

function namesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** Fresh build path: brand-new `select` + `num`, inserted via `replaceChildren` (safe
 * here — neither node has been attached before, so there's no focus/popup to lose).
 * Only reached when there is no cached state for `el` yet, or the option-name sequence
 * changed (a real change of choices, which legitimately forfeits any open dropdown). */
function buildModelWeek(
  el: HTMLElement,
  names: readonly string[],
  hasWindows: boolean,
  placeholderNeeded: boolean,
  selectedModel: string,
  onSelectModel: (displayName: string) => void,
): ModelWeekState {
  const select = document.createElement("select") as HTMLSelectElement;
  select.className = "lbl usage-model-select";
  select.setAttribute("aria-label", "Usage model");
  select.disabled = !hasWindows;

  names.forEach((name, i) => {
    const option = document.createElement("option") as HTMLOptionElement;
    option.value = name;
    option.textContent = name;
    // Minor 3 (review cycle 1): a pref naming a model absent from a non-null list used
    // to leave the select at selectedIndex -1 (blank). A synthesized placeholder option
    // — disabled, so it can't be re-chosen — is prepended in that case (see
    // `renderModelWeek`) and shows the pref name instead of a blank control, matching
    // what the null/empty-list branch already does with its single disabled option.
    if (placeholderNeeded && i === 0) option.disabled = true;
    select.appendChild(option);
  });
  select.value = selectedModel;
  select.addEventListener("change", () => onSelectModel(select.value));

  const num = document.createElement("span");
  num.className = "num";

  el.replaceChildren(select, num);

  return { select, names: [...names], placeholderNeeded, num, bar: null, fill: null, resets: null };
}

/** Applies the bucket's bar/percent/resets onto an existing `ModelWeekState`, mutating
 * the cached `.num`/`.bar`/`.resets` nodes in place rather than recreating them — they
 * hold no interactive state, so recreating them is harmless, but mutating in place also
 * means the common steady-state pass (nothing changed since last tick) touches no DOM at
 * all beyond a `textContent` assignment.
 *
 * Honesty rule (design-system §6.1): a null bucket removes any existing bar/resets
 * (self-healing on a known -> unknown transition) and leaves zero track markup behind —
 * `state.bar`/`state.resets` only ever exist while a bucket is being shown. */
function applyModelTrack(el: HTMLElement, state: ModelWeekState, bucket: ModelWindow | null, now: Date): void {
  state.num.textContent = bucket ? `${Math.round(bucket.usedPct)}%` : "unknown";

  if (!bucket) {
    if (state.bar) {
      state.bar.remove();
      state.bar = null;
      state.fill = null;
    }
    if (state.resets) {
      state.resets.remove();
      state.resets = null;
    }
    return;
  }

  const barClass = bucket.usedPct >= GAUGE_WARN_THRESHOLD ? "bar warn" : "bar";
  if (!state.bar) {
    state.bar = document.createElement("span");
    state.fill = document.createElement("i");
    state.bar.appendChild(state.fill);
    el.insertBefore(state.bar, state.num);
  }
  state.bar.className = barClass;
  if (state.fill) state.fill.style.width = `${Math.round(bucket.usedPct)}%`;

  if (!state.resets) {
    state.resets = document.createElement("span");
    state.resets.className = "resets";
    el.appendChild(state.resets);
  }
  state.resets.textContent = `· ${formatResets(bucket.resetsAt, now)}`;
}

/** Plan usage-model-bar (REQ-9/REQ-10/REQ-11, UI Specifications > Testable UI Elements):
 * the third masthead usage readout, `#usage-model-week` — the per-model weekly window
 * musterd fetches itself from `/api/oauth/usage`, unlike the two status-line buckets
 * above.
 *
 * Unlike the two sibling readouts, this one's label is a real `<select>` — review cycle
 * 1 Critical 1 found it being destroyed and rebuilt every 1s render tick, which meant it
 * could never be operated by keyboard and its dropdown could never stay open. The
 * `<select>` node (and its trailing `.num`/`.bar`/`.resets` siblings) now persist across
 * render passes in `modelWeekCache`, keyed by `el`; a pass only touches the select's
 * position in the DOM again when the option-name sequence actually changes, or when
 * whether a placeholder option is needed flips even though the resulting name sequence is
 * unchanged (review cycle 2, Major 1 — see `ModelWeekState.placeholderNeeded`'s doc
 * comment: the placeholder's per-option `disabled` flag is otherwise never re-synced by
 * the reuse path). See `buildModelWeek`'s doc comment for why even a same-node
 * `replaceChildren` call isn't safe once the node is attached.
 *
 * The `<select>` lists every `modelScoped[].displayName` (value = displayName); when the
 * list is null or empty it instead renders a single, disabled option reading the current
 * pref, so the readout always shows a model name even before the first fetch lands
 * (States > "No data yet"). When the list is non-null but doesn't contain the pref name,
 * a disabled placeholder option for the pref name is prepended (Minor 3, review cycle 1)
 * so the control shows that name instead of rendering blank — the honest "unknown" state
 * (below) is unaffected either way.
 *
 * Honesty rules (design-system §6): "unknown" with zero track markup when the selected
 * model has no matching window (REQ-10/INV-2 — null list, empty list, or a pref pointing
 * at a name the list doesn't contain, all take this same path via a failed `.find`).
 * `modelScopedError` non-null adds `.stale` + `title` = the error word without discarding
 * the last-good bucket (REQ-11/INV-3) — `applyModelTrack` keeping the existing bar/resets
 * nodes (rather than clearing them) is what "keeps the last-good bar" means concretely.
 */
export function renderModelWeek(
  el: HTMLElement,
  usage: Usage,
  selectedModel: string,
  now: Date,
  onSelectModel: (displayName: string) => void,
): void {
  const modelScoped: ModelWindow[] | null = usage.modelScoped ?? null;
  const hasWindows = modelScoped !== null && modelScoped.length > 0;
  const rawNames = hasWindows ? modelScoped.map((w) => w.displayName) : [selectedModel];
  const placeholderNeeded = hasWindows && !rawNames.includes(selectedModel);
  const names = placeholderNeeded ? [selectedModel, ...rawNames] : rawNames;
  const bucket = modelScoped?.find((w) => w.displayName === selectedModel) ?? null;

  const cached = modelWeekCache.get(el);
  const reuse =
    cached !== undefined && namesEqual(cached.names, names) && cached.placeholderNeeded === placeholderNeeded;

  let state: ModelWeekState;
  if (reuse) {
    state = cached;
    state.select.disabled = !hasWindows;
    // Only assign when it actually differs — an idempotent `.value =` is a no-op in
    // every browser, but skipping it entirely keeps this path from ever being the thing
    // that could disturb a currently-open popup.
    if (state.select.value !== selectedModel) state.select.value = selectedModel;
  } else {
    state = buildModelWeek(el, names, hasWindows, placeholderNeeded, selectedModel, onSelectModel);
    modelWeekCache.set(el, state);
  }

  applyModelTrack(el, state, bucket, now);

  const error = usage.modelScopedError ?? null;
  el.classList.toggle("stale", error !== null);
  if (error !== null) {
    el.title = error;
  } else {
    el.removeAttribute("title");
  }
}

/** Plan version-claude-interface, UI Specifications > DOM: the readout's text and, when
 * the installed Claude Code falls outside the canary-verified range, the warning-glyph
 * hover text. Pure so `renderClaudeVersion` and its unit tests can share one source of
 * truth for the six-row table below. */
export interface ClaudeVersionDescription {
  text: string;
  warning: string | null;
}

const VERSION_NOT_TESTED = "This Claude Code version has not been tested with Muster";
const VERSION_NOT_TESTED_UPDATE = `${VERSION_NOT_TESTED} — please update Claude Code`;

/** UI Specifications > DOM table:
 * - `null` (pre-hello) -> "claude unknown", no warning
 * - `status: "unknown"` (any `installed`), or a defensive non-`unknown` status with
 *   `installed === null` (the daemon never sends this — INV-1) -> "Claude installation
 *   unknown", no warning
 * - `status: "verified"` -> "claude <installed>", no warning
 * - `status: "above"` -> "claude <installed>" + the "not tested" warning
 * - `status: "below"` -> "claude <installed>" + the "not tested, please update" warning
 */
export function describeClaudeVersion(info: ClaudeCodeInfo | null): ClaudeVersionDescription {
  if (!info) return { text: "claude unknown", warning: null };
  if (info.status === "unknown" || info.installed === null) {
    return { text: "Claude installation unknown", warning: null };
  }
  if (info.status === "above") {
    return { text: `claude ${info.installed}`, warning: VERSION_NOT_TESTED };
  }
  if (info.status === "below") {
    return { text: `claude ${info.installed}`, warning: VERSION_NOT_TESTED_UPDATE };
  }
  return { text: `claude ${info.installed}`, warning: null };
}

/** UI Specifications > DOM: rebuilds `#claude-version`'s children with `replaceChildren`
 * (no innerHTML). No warning -> a lone text node. A warning -> a trailing-space text node
 * (`"claude <installed> "`) followed by the `role="img"` glyph, so `textContent` reads
 * `claude 2.0.0 ⚠` — `aria-label` and `title` both carry the same warning sentence
 * (Testable UI Elements: the glyph's accessible name and its native tooltip must match).
 * No button, link or other control lives inside the readout (REQ-5 "no dismiss"). */
export function renderClaudeVersion(el: HTMLElement, info: ClaudeCodeInfo | null): void {
  const { text, warning } = describeClaudeVersion(info);
  if (warning === null) {
    el.replaceChildren(document.createTextNode(text));
    return;
  }
  const glyph = document.createElement("span");
  glyph.className = "version-warn";
  glyph.setAttribute("role", "img");
  glyph.setAttribute("aria-label", warning);
  glyph.title = warning;
  glyph.textContent = "⚠";
  el.replaceChildren(document.createTextNode(`${text} `), glyph);
}
