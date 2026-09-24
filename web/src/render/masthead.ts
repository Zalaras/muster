// Pure DOM updates for the masthead: connection status, usage readouts, Claude Code
// version/verification status. Brand ("Muster") is static markup in index.html — nothing
// to render.
//
// Honesty rules (design-system §6.1): a null usage bucket renders the word "unknown"
// and no track/gauge markup at all — never a 0%-filled bar.
import type { ConnectionStatus } from "../app";
import type { Density, View } from "../protocol/prefs";
import type { SessionModelInfo } from "../protocol/session";
import type { ModelWindow, Usage, UsageBucket } from "../protocol/usage";
import { buildUsageBucketViewModel } from "../sessions/usage";

export function renderConnectionStatus(el: HTMLElement, status: ConnectionStatus): void {
  const text =
    status === "connected"
      ? "connected"
      : status === "reconnecting"
        ? "reconnecting…"
        : "connecting…";
  el.textContent = text;
}

/** One bucket's persistent DOM refs, built once and held by the
 * caller (`features/usage.ts`) across every render pass — `render/CLAUDE.md`'s render-
 * state rule, the same "build once, caller holds the refs" shape as
 * `buildSurfaceSegment`/`buildTile`. `bar`/`fill`/`resets` are `null` while the bucket is
 * unknown (design-system §6.1: no track at all) and created/torn down in place as it
 * crosses between known and unknown — never rebuilt via `replaceChildren`, so a focusable
 * sibling (`#usage-model-week`'s `<select>`) never gets swept up in an unrelated bucket's
 * refresh. */
export interface UsageBucketRefs {
  container: HTMLElement;
  num: HTMLElement;
  bar: HTMLElement | null;
  fill: HTMLElement | null;
  resets: HTMLElement | null;
}

/** Builds one usage bucket's permanent `.lbl`/`.num` shell (mockup `.gauge` ->
 * `.lbl`/`.num`, `mockups/a-instrument.html:199`) — called once per bucket, at startup. */
export function buildUsageBucket(container: HTMLElement, label: string): UsageBucketRefs {
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = label;

  const num = document.createElement("span");
  num.className = "num";

  container.replaceChildren(lbl, num);
  return { container, num, bar: null, fill: null, resets: null };
}

/** The one renderer for every masthead usage bucket — `#usage-5h`, `#usage-7d`, and (via
 * `renderUsageModelWeek` below) `#usage-model-week`'s own percent/bar/resets slice.
 * Mutates `refs.num`/`.bar`/`.fill`/`.resets` in place; final child order mirrors the
 * reference render (`mockups/a-instrument.html:199`): `.lbl`, `.bar`, `.num`, `.resets`.
 *
 * Honesty rule 1 (design-system §6.1): an unknown bucket removes any existing bar/resets
 * (self-healing across a known -> unknown transition, e.g. a daemon restart) and leaves no
 * track markup at all — never a 0%-filled one. */
export function renderUsageBucket(
  refs: UsageBucketRefs,
  bucket: UsageBucket | null,
  now: Date,
): void {
  const vm = buildUsageBucketViewModel(bucket, now);
  refs.num.textContent = vm.percentText;

  if (vm.fillPercent === null) {
    if (refs.bar) {
      refs.bar.remove();
      refs.bar = null;
      refs.fill = null;
    }
    if (refs.resets) {
      refs.resets.remove();
      refs.resets = null;
    }
    return;
  }

  if (!refs.bar) {
    refs.bar = document.createElement("span");
    refs.fill = document.createElement("i");
    refs.bar.appendChild(refs.fill);
    refs.container.insertBefore(refs.bar, refs.num);
  }
  refs.bar.className = vm.warn ? "bar warn" : "bar";
  if (refs.fill) refs.fill.style.width = `${vm.fillPercent}%`;

  if (!refs.resets) {
    refs.resets = document.createElement("span");
    refs.resets.className = "resets";
    refs.container.appendChild(refs.resets);
  }
  refs.resets.textContent = vm.resetsText ?? "";
}

export interface ViewSwitcherElements {
  focusButton: HTMLButtonElement;
  tilesButton: HTMLButtonElement;
}

/** Focus/Tiles segmented control (design-system §4.1). `aria-pressed` is the tested
 * contract for both buttons. */
export function renderViewSwitcher(elements: ViewSwitcherElements, view: View): void {
  elements.focusButton.setAttribute("aria-pressed", String(view === "focus"));
  elements.tilesButton.setAttribute("aria-pressed", String(view === "tiles"));
}

export interface DensityControlElements {
  container: HTMLElement;
  twoByTwoButton: HTMLButtonElement;
  threeByTwoButton: HTMLButtonElement;
}

/** The density control renders only in Tiles (design-system §4). */
export function renderDensityControl(
  elements: DensityControlElements,
  view: View,
  density: Density,
): void {
  elements.container.hidden = view !== "tiles";
  elements.twoByTwoButton.setAttribute("aria-pressed", String(density === "2x2"));
  elements.threeByTwoButton.setAttribute("aria-pressed", String(density === "3x2"));
}

/** The masthead model readout — the Usage object's freshest-sample model, verbatim.
 * Empty/hidden while null (no hydration at boot; also null again right after a daemon
 * restart until the next status post). Accepts `undefined` too since `Usage.model` is an
 * optional wire field (protocol/usage.ts) — a payload that omits it entirely reads the same as
 * an explicit null.
 *
 * Issue #52: `.model` ellipsizes whenever the masthead row runs out of room (style.css),
 * so `title` carries the full name for a hover tooltip whenever a truncated one might be
 * showing. */
export function renderUsageModel(
  el: HTMLElement,
  model: SessionModelInfo | null | undefined,
): void {
  if (!model) {
    el.hidden = true;
    el.textContent = "";
    el.removeAttribute("title");
    return;
  }
  el.hidden = false;
  el.textContent = model.displayName;
  el.title = model.displayName;
}

/** `#usage-model-week`'s own persistent refs — the caller (`features/usage.ts`) builds
 * one of these once, at startup, and holds it across every render pass, per
 * `render/CLAUDE.md`'s render-state rule: the state belongs to whoever renders, never to
 * a module-level map keyed by the element.
 *
 * Rebuilding a brand-new `<select>` every
 * pass (via `container.replaceChildren`) is fine for the two sibling bucket readouts —
 * they hold no interactive state — but this readout's `<select>` is a real focusable
 * control. Passing an *already-attached* node back through `replaceChildren` alongside a
 * sibling still detaches and reinserts it (the multi-argument form adopts every argument
 * into a fragment first, per the DOM "replace all" algorithm), which blurs a focused
 * element and always closes a native `<select>` popup — so preserving focus requires
 * never routing the select through `replaceChildren`/`insertBefore`/`appendChild` again
 * once it's in the tree, not just restoring focus afterwards. */
export interface UsageModelWeekRefs {
  container: HTMLElement;
  select: HTMLSelectElement;
  /** The exact option-name sequence (including a synthesized placeholder, see
   * `renderUsageModelWeek`) `select` was built for. A later pass rebuilds from scratch
   * whenever this differs — that's the only path allowed to touch `select`'s position in
   * the DOM again. */
  names: string[];
  /** Whether `names[0]` was a synthesized disabled placeholder when `select` was built.
   * The name sequence alone is not a reliable "did the option
   * set change" signal: a placeholder flip can leave the sequence identical while the
   * per-option `disabled` flags — set once in `buildUsageModelWeek` and never re-synced by
   * the reuse path — need to change (pref `Fable` with list `[Fable, Opus]` and pref
   * `Fable` with list `[Opus]` both produce `["Fable","Opus"]`, but only the second's
   * first option is the disabled placeholder). Comparing this alongside `names` forces the
   * rebuild path whenever that would otherwise be missed. */
  placeholderNeeded: boolean;
  /** The percent/bar/resets slice — rendered through the shared `renderUsageBucket`. */
  bucket: UsageBucketRefs;
}

function namesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** Fresh build path: brand-new `select` + bucket shell, inserted via `replaceChildren`
 * (safe here — neither node has been attached before, so there's no focus/popup to lose).
 * Only reached when there is no `el` yet, or the option-name sequence changed (a real
 * change of choices, which legitimately forfeits any open dropdown). */
export function buildUsageModelWeek(
  container: HTMLElement,
  names: readonly string[],
  hasWindows: boolean,
  placeholderNeeded: boolean,
  selectedModel: string,
  onSelectModel: (displayName: string) => void,
): UsageModelWeekRefs {
  const select = document.createElement("select") as HTMLSelectElement;
  select.className = "lbl usage-model-select";
  select.setAttribute("aria-label", "Usage model");
  select.disabled = !hasWindows;

  names.forEach((name, i) => {
    const option = document.createElement("option") as HTMLOptionElement;
    option.value = name;
    option.textContent = name;
    // A pref naming a model absent from a non-null list used
    // to leave the select at selectedIndex -1 (blank). A synthesized placeholder option
    // — disabled, so it can't be re-chosen — is prepended in that case (see
    // `renderUsageModelWeek`) and shows the pref name instead of a blank control,
    // matching what the null/empty-list branch already does with its single disabled
    // option.
    if (placeholderNeeded && i === 0) option.disabled = true;
    select.appendChild(option);
  });
  select.value = selectedModel;
  select.addEventListener("change", () => onSelectModel(select.value));

  const num = document.createElement("span");
  num.className = "num";

  container.replaceChildren(select, num);

  return {
    container,
    select,
    names: [...names],
    placeholderNeeded,
    bucket: { container, num, bar: null, fill: null, resets: null },
  };
}

/** `kb:adr/usage-masthead-one-selectable-model-window`: the third masthead usage readout,
 * `#usage-model-week` — the per-model weekly window
 * musterd fetches itself from `/api/oauth/usage`, unlike the two status-line buckets
 * above.
 *
 * Unlike the two sibling readouts, this one's label is a real `<select>` — it was once
 * destroyed and rebuilt every 1s render tick, which meant it
 * could never be operated by keyboard and its dropdown could never stay open. `refs.select`
 * (and its trailing bucket siblings) persist in the caller-held `refs` object across
 * render passes; this function only touches the select's position in the DOM again when
 * the option-name sequence actually changes, or when whether a placeholder option is
 * needed flips even though the resulting name sequence is unchanged (see
 * `UsageModelWeekRefs.placeholderNeeded`'s doc comment). See
 * `buildUsageModelWeek`'s doc comment for why even a same-node `replaceChildren` call
 * isn't safe once the node is attached.
 *
 * The `<select>` lists every `modelScoped[].displayName` (value = displayName); when the
 * list is null or empty it instead renders a single, disabled option reading the current
 * pref, so the readout always shows a model name even before the first fetch lands
 * (States > "No data yet"). When the list is non-null but doesn't contain the pref name,
 * a disabled placeholder option for the pref name is prepended
 * so the control shows that name instead of rendering blank — the honest "unknown" state
 * (below) is unaffected either way.
 *
 * Honesty rules (design-system §6, `kb:adr/usage-unknown-renders-word-not-track`):
 * "unknown" with zero track markup when the selected
 * model has no matching window — null list, empty list, or a pref pointing
 * at a name the list doesn't contain, all take this same path via a failed `.find`.
 * `modelScopedError` non-null adds `.stale` + `title` = the error word without discarding
 * the last-good bucket (`kb:adr/usage-masthead-one-selectable-model-window`'s "a failed
 * fetch leaves the last good bar labelled stale rather than hiding it") — `renderUsageBucket`
 * keeping the existing bar/resets nodes (rather than clearing them) is what "keeps the
 * last-good bar" means concretely.
 */
export function renderUsageModelWeek(
  refs: UsageModelWeekRefs,
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

  const reuse = namesEqual(refs.names, names) && refs.placeholderNeeded === placeholderNeeded;
  if (reuse) {
    refs.select.disabled = !hasWindows;
    // Only assign when it actually differs — an idempotent `.value =` is a no-op in
    // every browser, but skipping it entirely keeps this path from ever being the thing
    // that could disturb a currently-open popup.
    if (refs.select.value !== selectedModel) refs.select.value = selectedModel;
  } else {
    const rebuilt = buildUsageModelWeek(
      refs.container,
      names,
      hasWindows,
      placeholderNeeded,
      selectedModel,
      onSelectModel,
    );
    refs.select = rebuilt.select;
    refs.names = rebuilt.names;
    refs.placeholderNeeded = rebuilt.placeholderNeeded;
    refs.bucket = rebuilt.bucket;
  }

  renderUsageBucket(refs.bucket, bucket, now);

  const error = usage.modelScopedError ?? null;
  refs.container.classList.toggle("stale", error !== null);
  if (error !== null) {
    refs.container.title = error;
  } else {
    refs.container.removeAttribute("title");
  }
}

/** The readout's text and, when
 * the installed Claude Code falls outside the canary-verified range, the warning-glyph
 * hover text (`kb:adr/connection-installed-claude-classified-never-refused`). This is
 * `renderClaudeVersion`'s render contract — `features/
 * connectionversion.ts`'s `describeClaudeVersion` is its one producer: that derivation is
 * a DOM-free decision with one controller caller, so it lives beside
 * `features/connection.ts`, not here. */
export interface ClaudeVersionDescription {
  text: string;
  warning: string | null;
}

/** Rebuilds `#claude-version`'s children with `replaceChildren` (no innerHTML). No
 * warning -> a lone text node. A warning -> a trailing-space text node
 * (`"claude <installed> "`) followed by the `role="img"` glyph, so `textContent` reads
 * `claude 2.0.0 ⚠` — `aria-label` and `title` both carry the same warning sentence, so the
 * glyph's accessible name and its native tooltip always match. No button, link or other
 * control lives inside the readout — the glyph and its hover text are the whole
 * interface, `kb:adr/connection-installed-claude-classified-never-refused`. */
export function renderClaudeVersion(el: HTMLElement, description: ClaudeVersionDescription): void {
  const { text, warning } = description;
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
