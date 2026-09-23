// The launch dialog: a Finder-style picker (recents sidebar + clickable breadcrumb + one
// child listing) over a stacked segmented form (kb:anchor/sessions.create / kb:anchor/repos.list / kb:anchor/browse.get; plan
// new-session-dialog UI Specifications; design authority
// plans/new-session-dialog/mockup.html). DOM + wiring only — every daemon call goes
// through `../api/launch.ts`, and the parsed Session comes back through `onLaunched` so this
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
  type BrowseEntry,
  type BrowseResult,
  type LaunchRequest,
  type Repo,
} from "../api/launch";
import type { App } from "../app";
import { permissionModeToCheck, type PermissionMode } from "../sessions/permission";
import { requireElement, requireElements } from "../dom";
import type { Session } from "../protocol/session";
import { formatAge } from "../sessions/format";
import { matchShortcut } from "../shortcuts";
import { renderCrumbs, splitCrumbs } from "../render/crumbs";
import { DEFAULT_MODEL, initialRestore, repoRestore, type Touched } from "../render/launchrestore";

const MODEL_PRESETS = ["sonnet", "opus", "haiku", "fable"] as const;

export interface LaunchModalElements {
  dialog: HTMLDialogElement;
  /** REQ-6/INV-3 (plan rail-card-improvements): the one "New session" button in the
   * shell — it now lives in the masthead, visible in both views, so this holds exactly
   * one element (an array only so the click-listener loop below needs no special case). */
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

function initLaunchModal(elements: LaunchModalElements, handlers: LaunchModalHandlers): void {
  // The picker's whole state: what GET /api/browse most recently returned (null before
  // the first successful browse of this open), the served MRU list, whether that list has
  // resolved at all yet, and a monotonic counter guarding against a stale response landing
  // after a newer navigation was issued (edge cases 7/8).
  let current: BrowseResult | null = null;
  let repos: Repo[] = [];
  let reposLoaded = false;
  let browseRequestId = 0;
  // REQ-6a: which fields the user has changed since the dialog opened, so the async
  // initial restore (initOpen/initialRestore) never overwrites a deliberate choice. Set
  // only from a real `change`/`input` DOM event below — never by this module's own
  // `setModel`/`setPermissionMode` calls, which assign `.checked`/`.value` directly and so
  // dispatch nothing.
  let touched: Touched = { model: false, mode: false };
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
    const matched =
      MODEL_PRESETS.includes(value as (typeof MODEL_PRESETS)[number]) &&
      checkRadio(elements.modelRadios, value);
    if (!matched) {
      checkRadio(elements.modelRadios, "other");
      elements.customModelInput.value = value;
    }
    updateCustomModelVisibility();
  }

  // REQ-6/REQ-5: a stored value the dialog has no radio for (a future Claude Code mode,
  // `null`, or the empty string) falls back to `auto` — decided by the pure, unit-tested
  // `permissionModeToCheck` (sessions/permission.ts), which takes `null` directly (no
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
        const outcome = await navigate(repo.path);
        // Implementation notes: model/mode apply only after the navigation succeeds, so a
        // 404'd recent leaves the form untouched (INV-3 covers launch-time failures too).
        // REQ-6: unlike the initial restore, a clicked Recent always restores its
        // directory's model and mode, touched or not — `repoRestore` is the one owner of
        // what those values are.
        if (outcome === "ok") {
          const values = repoRestore(repo);
          setModel(values.model);
          setPermissionMode(values.mode);
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

  /** `navigate()`'s outcome: whether the browse it issued landed, failed, or was
   * superseded by a newer navigation before it resolved. `initOpen` switches on this
   * directly (REQ-6b/c); `navigateUp` passes it through. */
  type NavigateOutcome = "ok" | "failed" | "superseded";

  /** The one door for changing the selection. Bumps the request counter, shows
   * `loading…`, awaits the browse, and reports `"superseded"` if a newer navigation was
   * issued meanwhile (edge case 7) without touching the listing that newer navigation is
   * about to render. On failure the previous listing is restored untouched (INV-3) while
   * the error surfaces. REQ-6/W6: the three-way outcome (not a plain boolean) is what lets
   * `initOpen` tell a genuine failure from a superseded race. */
  async function navigate(path?: string): Promise<NavigateOutcome> {
    const requestId = ++browseRequestId;
    renderListingLoading();
    const result = await browse(path);
    if (requestId !== browseRequestId) return "superseded";
    if (result.ok) {
      // Edge case 2 preserved: a *browse* error (including a validation/launch error, or
      // no error at all) is cleared by the next successful navigation. A *repos* error is
      // not — see `showReposError`.
      if (!reposErrorPersistent) clearError();
      current = result.value;
      renderAll();
      return "ok";
    }
    showError(result.error.message);
    renderListing();
    return "failed";
  }

  /** Returns `null` when there is no parent crumb to ascend to (nothing was attempted —
   * a true no-op), otherwise the underlying `navigate()` result (`ok`/`failed` both
   * re-render the listing and so do lose focus; `superseded` does not). Callers that
   * re-anchor focus after ascending (REQ-15) key off the `null` case to skip that
   * re-anchor on the genuine no-op — see the `ArrowLeft` handler below. */
  function navigateUp(): Promise<NavigateOutcome | null> {
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

  /** REQ-6a: applies whichever of `initialRestore`'s two fields survived the touched
   * filter — a plain caller of the pure decision. */
  function applyInitialRestore(first: Repo): void {
    const restore = initialRestore(touched, first);
    if (restore.model !== undefined) setModel(restore.model);
    if (restore.mode !== undefined) setPermissionMode(restore.mode);
  }

  /** REQ-2's initial-open sequence: fetches the MRU list, then (REQ-6b/c) attempts the
   * first recent's directory and switches on its outcome directly — see the branches
   * below for what each of `"ok"`/`"failed"`/`"superseded"` does. */
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
    if (!first) {
      await navigate(undefined);
      return;
    }

    const outcome = await navigate(first.path);
    if (outcome === "ok") {
      applyInitialRestore(first);
    } else if (outcome === "failed") {
      // Edge case 2/REQ-6c: the first recent's directory no longer exists. Without a
      // fallback there would be no crumbs to click, so fall back to the browse root; its
      // success clears the error the failed attempt raised (acceptable per the plan).
      await navigate(undefined);
    }
    // REQ-6b ("superseded"): the initial navigation was superseded by a navigation the
    // user started — it does nothing further, so the user's own navigation is never
    // clobbered.
  }

  function resetForm(): void {
    current = null;
    repos = [];
    reposLoaded = false;
    touched = { model: false, mode: false };
    elements.titleInput.value = "";
    elements.customModelInput.value = "";
    setModel(DEFAULT_MODEL);
    // REQ-5: with no stored mode to restore, `permissionModeToCheck`'s own fallback (now
    // `auto`) decides — one source of truth, same as every other caller of
    // `setPermissionMode`.
    setPermissionMode(null);
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
  /** Roving-focus arrow handling for the browse list. Returns false for any key the list
   * does not own, so the caller leaves that event entirely alone. */
  function handleBrowseArrowKey(
    key: string,
    entries: readonly HTMLButtonElement[],
    activeIndex: number,
  ): boolean {
    switch (key) {
      case "ArrowDown":
        entries[(activeIndex + 1 + entries.length) % entries.length]?.focus();
        return true;
      case "ArrowUp":
        entries[(activeIndex - 1 + entries.length) % entries.length]?.focus();
        return true;
      case "ArrowRight": {
        const dir = current?.dirs[activeIndex];
        if (dir) void navigate(dir.path).then(() => focusFirstEntry());
        return true;
      }
      case "ArrowLeft":
        // `null` means there was no parent crumb — a genuine no-op — so focus stays put
        // instead of re-anchoring to the (unchanged) first entry (review Minor: a no-op
        // ascend must not jump focus).
        void navigateUp().then((result) => {
          if (result !== null) focusFirstEntry();
        });
        return true;
      default:
        return false;
    }
  }

  elements.browseDirs.addEventListener("keydown", (event) => {
    if (event.metaKey || event.altKey) return;
    const entries = Array.from(
      elements.browseDirs.querySelectorAll<HTMLButtonElement>("button.entry"),
    );
    if (entries.length === 0) return;
    const activeIndex = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (handleBrowseArrowKey(event.key, entries, activeIndex)) event.preventDefault();
  });

  for (const radio of elements.modelRadios) {
    radio.addEventListener("change", () => {
      touched.model = true;
      updateCustomModelVisibility();
    });
  }
  elements.customModelInput.addEventListener("input", () => {
    touched.model = true;
  });
  for (const radio of elements.permissionModeRadios) {
    radio.addEventListener("change", () => {
      touched.mode = true;
    });
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
 * `onLaunched` to the store and (REQ-7/REQ-8, plan new-session-improvement) opening the
 * launched session — focused in Focus, promoted in Tiles, keyboard focus in its terminal
 * in both views (plan code-breakup vocabulary: "launch"). */
// W6/INV-4: structural, not a sibling import of FocusHandle/SurfacesHandle from their
// owning sibling modules.
export function initLaunch(
  app: App,
  deps: {
    focus: { bringForward(session: Session): void };
    surfaces: { focusSelected(id: number): void };
  },
): void {
  const elements: LaunchModalElements = {
    dialog: requireElement<HTMLDialogElement>("#launch-dialog"),
    openButtons: [requireElement<HTMLButtonElement>("#new-session-button")],
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
      // REQ-7: focuses in Focus, promotes in Tiles (the grid may be full — `promote`
      // demotes exactly the lowest-priority live tile). `focus.bringForward` is the one
      // owner of this decision, shared with the number chords — reached structurally,
      // never by importing `./focus`.
      deps.focus.bringForward(session);
      // REQ-7/REQ-8: keyboard focus follows in both views. `dialog.close()` (called by
      // `submit()` before this handler runs) restores focus to the opener synchronously,
      // and the surface this targets is only mounted by `bringForward`'s render/promote
      // above (surfaces.ts's render phase), so this must run last (Implementation Notes).
      deps.surfaces.focusSelected(session.id);
    },
  });
}
