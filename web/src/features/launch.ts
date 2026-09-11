// The launch dialog: a Finder-style picker (recents sidebar + clickable breadcrumb + one
// child listing) over a stacked segmented form (docs/protocol.md §3.1/§3.2/§3.6; plan
// new-session-dialog UI Specifications; design authority
// plans/new-session-dialog/mockup.html). DOM + wiring only — every daemon call goes
// through ../api.ts, and the parsed Session comes back through `onLaunched` so this
// module's `initLaunch` (which holds `app`, the session store's owner) decides what
// happens next.
//
// The listed directory *is* the selection (REQ-3): there is a single `current:
// BrowseResult | null`, and the readout, the crumbs and the submit body all derive from
// it — that's what makes INV-1 hold by construction. `navigate(path)` is the one door:
// child click, crumb click, ⌘↑, a recent click and open all call it.
import {
  browse,
  fetchRepos,
  launchSession,
  permissionModeToCheck,
  type BrowseEntry,
  type BrowseResult,
  type LaunchRequest,
  type PermissionMode,
  type Repo,
} from "../api";
import type { App } from "../app";
import { requireElement, requireElements } from "../dom";
import type { Session } from "../protocol";
import { formatAge } from "../sessions/format";
import { matchShortcut } from "../shortcuts";
import { renderCrumbs, splitCrumbs } from "../render/crumbs";

const MODEL_PRESETS = ["sonnet", "opus", "haiku", "fable"] as const;

export interface LaunchModalElements {
  dialog: HTMLDialogElement;
  /** Every "New session" button in the shell — the Focus rail's and the Tiles toolbar's;
   * each view hides the other's, so exactly one is visible at a time. */
  openButtons: readonly HTMLButtonElement[];
  recentsList: HTMLElement;
  recentEntryTemplate: HTMLTemplateElement;
  crumbsNav: HTMLElement;
  browseDirs: HTMLElement;
  entryTemplate: HTMLTemplateElement;
  titleInput: HTMLInputElement;
  modelRadios: HTMLInputElement[];
  customModelRow: HTMLElement;
  customModelInput: HTMLInputElement;
  permissionModeRadios: HTMLInputElement[];
  launchError: HTMLElement;
  launchTargetPath: HTMLElement;
  launchTargetBranch: HTMLElement;
  cancelButton: HTMLButtonElement;
  form: HTMLFormElement;
}

export interface LaunchModalHandlers {
  onLaunched: (session: Session) => void;
}

function checkRadio(radios: readonly HTMLInputElement[], value: string): boolean {
  let matched = false;
  for (const radio of radios) {
    radio.checked = radio.value === value;
    if (radio.checked) matched = true;
  }
  return matched;
}

function checkedValue(radios: readonly HTMLInputElement[]): string | null {
  return radios.find((radio) => radio.checked)?.value ?? null;
}

export function initLaunchModal(elements: LaunchModalElements, handlers: LaunchModalHandlers): void {
  // The picker's whole state: what GET /api/browse most recently returned (null before
  // the first successful browse of this open), the served MRU list, whether that list has
  // resolved at all yet, and a monotonic counter guarding against a stale response landing
  // after a newer navigation was issued (edge cases 7/8).
  let current: BrowseResult | null = null;
  let repos: Repo[] = [];
  let reposLoaded = false;
  let browseRequestId = 0;
  // Whether the error currently shown in `#launch-error` is the "repos unavailable"
  // kind. That error has no fix-it action in this dialog (nothing re-fetches repos
  // mid-open), so it must survive the browse-root fallback `initOpen()` issues right
  // after it — unlike a *browse* failure, which a later successful navigate() is meant
  // to clear (edge case 2). Reset whenever a non-repos error replaces it or the error is
  // explicitly cleared.
  let reposErrorPersistent = false;

  function updateCustomModelVisibility(): void {
    const isOther = checkedValue(elements.modelRadios) === "other";
    elements.customModelRow.hidden = !isOther;
    elements.customModelInput.hidden = !isOther;
  }

  function setModel(value: string): void {
    const matched = MODEL_PRESETS.includes(value as (typeof MODEL_PRESETS)[number]) && checkRadio(elements.modelRadios, value);
    if (!matched) {
      checkRadio(elements.modelRadios, "other");
      elements.customModelInput.value = value;
    }
    updateCustomModelVisibility();
  }

  // REQ-6: a stored value the dialog has no radio for (a future Claude Code mode, `null`,
  // or the empty string) falls back to `manual` (`default`) — decided by the pure,
  // unit-tested `permissionModeToCheck` (api.ts), which takes `null` directly (no
  // caller-side coercion to `""`). `setPermissionMode` here and `selectedPermissionMode`
  // just below are this file's two callers.
  function setPermissionMode(value: string | null): void {
    checkRadio(elements.permissionModeRadios, permissionModeToCheck(value));
  }

  function selectedModel(): string {
    if (checkedValue(elements.modelRadios) === "other") {
      return elements.customModelInput.value.trim();
    }
    return checkedValue(elements.modelRadios) ?? "";
  }

  function selectedPermissionMode(): PermissionMode {
    return permissionModeToCheck(checkedValue(elements.permissionModeRadios));
  }

  function showError(message: string): void {
    elements.launchError.textContent = message;
    elements.launchError.hidden = false;
    reposErrorPersistent = false;
  }

  // The repos-fetch failure (REQ-13): shown the same way as any other error, but must
  // not be wiped by the browse-root fallback that `initOpen()` runs immediately
  // afterwards (there is no user action, inside this dialog, that fixes GET /api/repos).
  function showReposError(message: string): void {
    elements.launchError.textContent = message;
    elements.launchError.hidden = false;
    reposErrorPersistent = true;
  }

  function clearError(): void {
    elements.launchError.textContent = "";
    elements.launchError.hidden = true;
    reposErrorPersistent = false;
  }

  function buildRecentButton(repo: Repo, now: Date): HTMLButtonElement {
    const fragment = elements.recentEntryTemplate.content.cloneNode(true) as DocumentFragment;
    const button = fragment.querySelector<HTMLButtonElement>("button.dir");
    if (!button) throw new Error("mru-entry-template is missing its button");
    const name = button.querySelector<HTMLElement>(".dir-name");
    const branch = button.querySelector<HTMLElement>(".dir-branch");
    const age = button.querySelector<HTMLElement>(".dir-age");
    if (name) name.textContent = repo.name;
    if (branch) branch.textContent = repo.branch ?? "—";
    if (age) age.textContent = formatAge(repo.lastLaunchedAt, now);
    // REQ-18: the full path lives in `title`; the visible entry stays name · branch · age.
    button.title = repo.path;
    // INV-2: pressed is derived, never stored — recomputed on every render from whether
    // this repo's path equals the current selection.
    button.setAttribute("aria-pressed", current?.path === repo.path ? "true" : "false");
    button.addEventListener("click", () => {
      void (async () => {
        const success = await navigate(repo.path);
        // Implementation notes: model/mode apply only after the navigation succeeds, so a
        // 404'd recent leaves the form untouched (INV-3 covers launch-time failures too).
        if (success) {
          setModel(repo.lastModel ?? "sonnet");
          setPermissionMode(repo.lastPermissionMode);
        }
      })();
    });
    return button;
  }

  function renderRecents(): void {
    if (!reposLoaded) {
      // States: "no data yet" — nothing beneath the Recent heading until repos arrive.
      elements.recentsList.replaceChildren();
      return;
    }
    if (repos.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No recent directories";
      elements.recentsList.replaceChildren(empty);
      return;
    }
    const now = new Date();
    elements.recentsList.replaceChildren(...repos.map((repo) => buildRecentButton(repo, now)));
  }

  function buildEntryButton(dir: BrowseEntry): HTMLButtonElement {
    const fragment = elements.entryTemplate.content.cloneNode(true) as DocumentFragment;
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
    button.addEventListener("click", () => void navigate(dir.path));
    return button;
  }

  function renderListing(): void {
    if (!current) {
      // Daemon-down / never-succeeded state: an empty region, never "No subdirectories" —
      // that would claim knowledge Muster does not have (design-system §6 honesty rules).
      elements.browseDirs.replaceChildren();
      return;
    }
    if (current.dirs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No subdirectories";
      elements.browseDirs.replaceChildren(empty);
      return;
    }
    elements.browseDirs.replaceChildren(...current.dirs.map((dir) => buildEntryButton(dir)));
  }

  function renderListingLoading(): void {
    const loading = document.createElement("p");
    loading.className = "loading";
    loading.textContent = "loading…";
    elements.browseDirs.replaceChildren(loading);
  }

  function updateCrumbs(): void {
    if (!current) {
      elements.crumbsNav.replaceChildren();
      return;
    }
    renderCrumbs(elements.crumbsNav, splitCrumbs(current.path), (path) => void navigate(path));
  }

  function renderFooter(): void {
    const path = current?.path;
    if (!path) {
      elements.launchTargetPath.textContent = "—";
      elements.launchTargetBranch.hidden = true;
      elements.launchTargetBranch.textContent = "";
      return;
    }
    elements.launchTargetPath.textContent = path;
    // REQ-17: the browse endpoint never reports the listed directory's own branch — the
    // only honest source is a recent whose served path matches (derived, like `pressed`,
    // not tracked separately as "how did we get here").
    const branch = repos.find((repo) => repo.path === path)?.branch ?? null;
    if (branch) {
      elements.launchTargetBranch.textContent = ` · ${branch}`;
      elements.launchTargetBranch.hidden = false;
    } else {
      elements.launchTargetBranch.textContent = "";
      elements.launchTargetBranch.hidden = true;
    }
  }

  function renderAll(): void {
    renderRecents();
    updateCrumbs();
    renderListing();
    renderFooter();
  }

  /** The one door for changing the selection. Bumps the request counter, shows
   * `loading…`, awaits the browse, drops the response if a newer navigation was issued
   * meanwhile (edge case 7), and on failure restores the previous listing untouched
   * (INV-3) while surfacing the error. Resolves to whether the navigation succeeded, so
   * callers (recents) can gate a model/mode change on it. */
  async function navigate(path?: string): Promise<boolean> {
    const requestId = ++browseRequestId;
    renderListingLoading();
    const result = await browse(path);
    if (requestId !== browseRequestId) return false;
    if (result.ok) {
      // Edge case 2 preserved: a *browse* error (including a validation/launch error, or
      // no error at all) is cleared by the next successful navigation. A *repos* error is
      // not — see `showReposError`.
      if (!reposErrorPersistent) clearError();
      current = result.value;
      renderAll();
      return true;
    }
    showError(result.error.message);
    renderListing();
    return false;
  }

  /** Returns `null` when there is no parent crumb to ascend to (nothing was attempted —
   * a true no-op), otherwise the underlying `navigate()` result (success or failure,
   * both of which re-render the listing and so do lose focus regardless). Callers that
   * re-anchor focus after ascending (REQ-15) key off the `null` case to skip that
   * re-anchor on the genuine no-op — see the `ArrowLeft` handler below. */
  function navigateUp(): Promise<boolean | null> {
    const buttons = elements.crumbsNav.querySelectorAll<HTMLButtonElement>("button[data-path]");
    const last = buttons[buttons.length - 1];
    if (last?.dataset.path) return navigate(last.dataset.path);
    return Promise.resolve(null);
  }

  /** REQ-15 traversal continuity: `renderAll()` replaces every entry button on each
   * navigation (the picker's per-navigation full-rebuild — see Decisions), so the button
   * that held focus before a descend/ascend is gone afterward and focus silently falls to
   * `<body>`. Re-anchoring on the first entry of the new listing keeps ↑/↓/←/→ usable past
   * one keystroke instead of one-shot. */
  function focusFirstEntry(): void {
    elements.browseDirs.querySelector<HTMLButtonElement>("button.entry")?.focus();
  }

  async function initOpen(): Promise<void> {
    const reposResult = await fetchRepos();
    if (reposResult.ok) {
      repos = reposResult.value;
      clearError();
    } else {
      repos = [];
      showReposError(reposResult.error.message);
    }
    reposLoaded = true;
    renderRecents();

    const first = repos[0];
    if (first) {
      const success = await navigate(first.path);
      if (success) {
        setModel(first.lastModel ?? "sonnet");
        setPermissionMode(first.lastPermissionMode);
        return;
      }
      // Edge case 2: the first recent's directory no longer exists. Without a fallback
      // there would be no crumbs to click, so fall back to the browse root; its success
      // clears the error the failed attempt raised (acceptable per the plan).
      await navigate(undefined);
      return;
    }
    await navigate(undefined);
  }

  function resetForm(): void {
    current = null;
    repos = [];
    reposLoaded = false;
    elements.titleInput.value = "";
    elements.customModelInput.value = "";
    setModel("sonnet");
    setPermissionMode("default");
    clearError();
    renderAll();
  }

  async function submit(): Promise<void> {
    const directory = current?.path;
    if (!directory) {
      showError("Choose a directory to launch into.");
      return;
    }
    const model = selectedModel();
    if (!model) {
      showError("Enter a model.");
      return;
    }
    const body: LaunchRequest = {
      directory,
      model,
      permissionMode: selectedPermissionMode(),
    };
    const title = elements.titleInput.value.trim();
    if (title) body.title = title;

    const result = await launchSession(body);
    if (!result.ok) {
      showError(result.error.message);
      return;
    }
    elements.dialog.close();
    handlers.onLaunched(result.value);
  }

  function openModal(): void {
    if (elements.dialog.open) return;
    resetForm();
    elements.dialog.showModal();
    void initOpen();
  }

  for (const button of elements.openButtons) {
    button.addEventListener("click", openModal);
  }

  // ⌥⌘N opens the launch modal from anywhere in the shell (plan shortcut-fixes — ⌘N is
  // reserved by the browser, spikes/S5-key-probe.md). Matching lives in shortcuts.ts
  // (REQ-3); this dispatches on the returned action only.
  window.addEventListener("keydown", (event) => {
    const action = matchShortcut(event);
    if (action === null) return;
    if (action.type === "new-session") {
      // preventDefault unconditionally, even with the dialog already open (REQ-8;
      // review m1-sessions cycle-3 minor: preventDefault must precede the open-guard).
      // REQ-2: the browser's own bare ⌘N is left alone — this only ever fires for ⌥⌘N.
      event.preventDefault();
      if (elements.dialog.open) return;
      openModal();
    } else if (action.type === "launch-parent-dir") {
      // REQ-6: ⌘↑ navigates to the parent of the listed directory. Dialog-scoped, not
      // listing-scoped (edge case 11 — it still fires with focus in the Title input).
      if (!elements.dialog.open) return;
      event.preventDefault();
      void navigateUp();
    }
  });

  // REQ-15: with focus on a child entry, ↑/↓ move focus between entries and →/Enter
  // descend (Enter already works for free — it's a <button>); ← is ⌘↑'s synonym, but only
  // when focus is inside the listing (the window-level handler above covers the ⌘↑ case
  // everywhere else, so this bows out whenever the meta key is held).
  elements.browseDirs.addEventListener("keydown", (event) => {
    if (event.metaKey || event.altKey) return;
    const entries = Array.from(elements.browseDirs.querySelectorAll<HTMLButtonElement>("button.entry"));
    if (entries.length === 0) return;
    const activeIndex = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(activeIndex + 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(activeIndex - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const dir = current?.dirs[activeIndex];
      if (dir) void navigate(dir.path).then(() => focusFirstEntry());
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      // `null` means there was no parent crumb — a genuine no-op — so focus stays put
      // instead of re-anchoring to the (unchanged) first entry (review Minor: a no-op
      // ascend must not jump focus).
      void navigateUp().then((result) => {
        if (result !== null) focusFirstEntry();
      });
    }
  });

  for (const radio of elements.modelRadios) {
    radio.addEventListener("change", updateCustomModelVisibility);
  }

  elements.cancelButton.addEventListener("click", () => {
    elements.dialog.close();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
}

/** REQ-2's controller entry: locates the launch dialog + its two open buttons, wires
 * `onLaunched` to the store and (in Tiles) tile promotion (plan code-breakup vocabulary:
 * "launch"). */
// W6/INV-4: structural, not a sibling import of TilesHandle from the tiles module.
export function initLaunch(app: App, deps: { tiles: { promote(id: number): void } }): void {
  const elements: LaunchModalElements = {
    dialog: requireElement<HTMLDialogElement>("#launch-dialog"),
    openButtons: [
      requireElement<HTMLButtonElement>("#new-session-button"),
      requireElement<HTMLButtonElement>("#tiles-new-session-button"),
    ],
    recentsList: requireElement<HTMLElement>("#mru-list"),
    recentEntryTemplate: requireElement<HTMLTemplateElement>("#mru-entry-template"),
    crumbsNav: requireElement<HTMLElement>("#browse-crumbs"),
    browseDirs: requireElement<HTMLElement>("#browse-dirs"),
    entryTemplate: requireElement<HTMLTemplateElement>("#subdir-entry-template"),
    titleInput: requireElement<HTMLInputElement>("#title-input"),
    modelRadios: requireElements<HTMLInputElement>('input[name="model"]'),
    customModelRow: requireElement<HTMLElement>("#custom-model-row"),
    customModelInput: requireElement<HTMLInputElement>("#custom-model-input"),
    permissionModeRadios: requireElements<HTMLInputElement>('input[name="permission-mode"]'),
    launchError: requireElement<HTMLElement>("#launch-error"),
    launchTargetPath: requireElement<HTMLElement>("#launch-target b"),
    launchTargetBranch: requireElement<HTMLElement>("#launch-target .branch"),
    cancelButton: requireElement<HTMLButtonElement>("#cancel-button"),
    form: requireElement<HTMLFormElement>("#launch-form"),
  };

  initLaunchModal(elements, {
    // REQ-2: the card must appear the instant the 201 comes back — before any hook can
    // possibly arrive. The `sessionUpsert` the daemon also broadcasts for this same
    // launch is a harmless duplicate upsert once the WS delivers it.
    onLaunched: (session) => {
      app.store.upsert(session);
      // Launched from Tiles: the new session must become a live tile even when the grid
      // is full — `promote` demotes exactly the lowest-priority live tile and renders; a
      // no-op guard in Focus, so render there explicitly.
      if (app.state.view === "tiles") deps.tiles.promote(session.id);
      else app.render();
    },
  });
}
