// The launch dialog's Recent-directories list, child listing, and footer readout — split
// out of features/launch.ts (docs/conventions.md § Composition roots: DOM building belongs
// in `render/`, matching render/crumbs.ts's shape — elements/values in, an `onSelect`
// callback out). The
// controller (features/launch.ts) still owns navigation, restore and all daemon calls;
// these builders never call `navigate` themselves, only report which repo/entry was
// picked.
import type { BrowseEntry, Repo } from "../api/launch";
import { requireElement } from "../dom";
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
  // `#mru-entry-template`'s fixed markup (index.html) guarantees every slot below.
  requireElement<HTMLElement>(".dir-name", button).textContent = repo.name;
  requireElement<HTMLElement>(".dir-branch", button).textContent = repo.branch ?? "—";
  requireElement<HTMLElement>(".dir-age", button).textContent = formatAge(repo.lastLaunchedAt, now);
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
  // `#subdir-entry-template`'s fixed markup (index.html) guarantees `.nm`.
  requireElement<HTMLElement>(".nm", button).textContent = dir.name;
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

/** Which control currently governs Launch/marking: the checked preset's value, or the
 * custom-model input's current (trimmed) text when `other…` is checked. The DOM-free
 * counterpart, `features/launchmodels.ts`'s `deriveModelRowState`, takes this same shape
 * as a parameter — declared here, not there, so that module (a pure decision with one
 * controller caller) imports its parameter types downward from the builder that also
 * consumes them, the same direction as `render/crumbs.ts`'s `Crumb` /
 * `features/launchcrumbs.ts`. */
export interface ModelSelection {
  selected: string;
  isCustom: boolean;
}

/** The Model row's whole derived state from (verdicts so far, current selection) —
 * `features/launchmodels.ts` recomputes this on every verdict arrival and every selection
 * change; `renderModelRowState` below draws whatever it returns onto the DOM. */
export interface ModelRowState {
  /** Preset values to disable: unrecognized and not the current selection. */
  disabledPresets: ReadonlySet<string>;
  /** The selected model's own verdict is unrecognized (design-system §5 invalid-field
   * pattern). */
  invalid: boolean;
  /** `#model-error`'s text, or `null` when `invalid` is false. */
  errorMessage: string | null;
}

/** `#model-error`: hidden with no children while `message` is `null`, otherwise an
 * `aria-hidden` `⚠` glyph followed by the message text — the glyph sits outside the
 * accessible name (design-system §5 invalid-field pattern) so a caller matching this
 * element's text (e2e/helpers/picker.ts's `modelError`) needs a substring match, never an
 * exact one. */
function renderModelError(el: HTMLElement, message: string | null): void {
  if (message === null) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = "⚠";
  el.replaceChildren(glyph, document.createTextNode(` ${message}`));
  el.hidden = false;
}

function toggleControlInvalid(el: HTMLElement, invalid: boolean): void {
  if (invalid) {
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", "model-error");
  } else {
    el.removeAttribute("aria-invalid");
    el.removeAttribute("aria-describedby");
  }
}

/** The one control the current selection names: a preset radio, or the custom input when
 * `other…` is checked. `undefined` only if `selection.selected` names no radio in
 * `modelRadios`, which does not happen for a preset selection (the radio set is fixed). */
function invalidControl(
  modelRadios: readonly HTMLInputElement[],
  customModelInput: HTMLInputElement,
  selection: ModelSelection,
): HTMLElement | undefined {
  if (selection.isCustom) return customModelInput;
  return modelRadios.find((radio) => radio.value === selection.selected);
}

/** The Model row's invalid-field pattern (design-system §5,
 * kb:adr/launch-unrecognized-model-marked-blocks-launch): a disabled preset takes `title`;
 * the one control matching the current selection — a preset radio or the custom input —
 * carries `aria-invalid`/`aria-describedby` when its own verdict is unrecognized;
 * `#model-error` and the Launch button both follow `state.invalid`.
 *
 * Focus rule (stated once here; `features/launch.ts`'s callers reference this comment
 * rather than restate it). By default this never moves focus off a control that stays
 * enabled — a verdict landing from the dialog-open request, a restore, or a selection
 * change touches only the row's own controls, never Title or the browse list. The one
 * default-path exception is Launch itself: disabling it while it holds focus would
 * otherwise drop focus to `<body>` (browsers never move it themselves), so that one case
 * hands focus to the invalid control instead — the field the developer needs to fix next.
 *
 * `forceFocusInvalid` is a second, deliberate exception on top of that default: a
 * launch-time `model_unrecognized` refusal (kb:adr/launch-model-refusal-shown-in-field-error-only)
 * forces focus onto the invalid control regardless of what currently holds it, because
 * `#model-error` has no live-region role and moving focus is the refusal's only
 * announcement. The caller (`features/launch.ts`'s `submit`) is the only one that passes
 * `true`, and only once it has confirmed the refusal was merged into the *current* dialog's
 * store (the same generation guard `applyVerdicts` applies to the write itself) — a stale
 * refusal from a cancelled-and-reopened dialog moves nothing, focus included. */
export function renderModelRowState(
  modelRadios: readonly HTMLInputElement[],
  customModelInput: HTMLInputElement,
  modelError: HTMLElement,
  launchButton: HTMLButtonElement,
  state: ModelRowState,
  selection: ModelSelection,
  forceFocusInvalid = false,
): void {
  for (const radio of modelRadios) {
    if (radio.value === "other") continue;
    radio.disabled = state.disabledPresets.has(radio.value);
    radio.title = radio.disabled ? "Claude Code doesn't recognise this model" : "";
    const isSelected = !selection.isCustom && selection.selected === radio.value;
    toggleControlInvalid(radio, isSelected && state.invalid);
  }
  toggleControlInvalid(customModelInput, selection.isCustom && state.invalid);
  renderModelError(modelError, state.invalid ? state.errorMessage : null);
  const launchHadFocus = document.activeElement === launchButton;
  launchButton.disabled = state.invalid;
  if (state.invalid && (launchHadFocus || forceFocusInvalid)) {
    invalidControl(modelRadios, customModelInput, selection)?.focus();
  }
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
