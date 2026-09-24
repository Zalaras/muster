// The launch dialog: a Finder-style picker (recents sidebar + clickable breadcrumb + one
// child listing) over a stacked segmented form (kb:anchor/sessions.create / kb:anchor/repos.list / kb:anchor/browse.get;
// kb:adr/launch-picker-recent-sidebar-plus-browse-list). DOM + wiring only — every daemon call goes
// through `../api/launch.ts`, and the parsed Session comes back through `onLaunched` so this
// module's `initLaunch` (which holds `app`, the session store's owner) decides what
// happens next.
//
// The listed directory *is* the selection: there is a single `current:
// BrowseResult | null`, and the readout, the crumbs and the submit body all derive from
// it — that invariant holds by construction. `navigate(path)` is the one door:
// child click, crumb click, ⌘↑, a recent click and open all call it.
import {
  browse,
  fetchRepos,
  launchSession,
  type BrowseResult,
  type LaunchRequest,
  type Repo,
} from "../api/launch";
import type { App } from "../app";
import { permissionModeToCheck } from "../sessions/permission";
import { checkRadioValue, requireElement, requireElements } from "../dom";
import { renderActionError } from "../render/actionerror";
import type { PermissionMode, Session } from "../protocol/session";
import { renderCrumbs } from "../render/crumbs";
import {
  renderBrowseListing,
  renderBrowseLoading,
  renderLaunchFooter,
  renderRecentsList,
} from "../render/launch";
import { splitCrumbs } from "./launchcrumbs";
import { DEFAULT_MODEL, initialRestore, repoRestore, type Touched } from "./launchrestore";

const MODEL_PRESETS = ["sonnet", "opus", "haiku", "fable"] as const;

export interface LaunchModalElements {
  dialog: HTMLDialogElement;
  /** kb:adr/launch-new-session-button-in-masthead: the one "New session" button in the
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

export interface LaunchHandle {
  /** ⌥⌘N: opens the launch dialog — idempotent while it's already open. */
  open(): void;
  /** Whether the dialog is currently open — `features/shortcuts.ts`'s one
   * window keydown listener checks this before dispatching ⌘↑. */
  isOpen(): boolean;
  /** ⌘↑: navigates to the parent of the listed directory. Callers only invoke
   * this once `isOpen()` is true (dialog-scoped, not listing-scoped). */
  navigateToParentDir(): void;
}

function checkedValue(radios: readonly HTMLInputElement[]): string | null {
  return radios.find((radio) => radio.checked)?.value ?? null;
}

function initLaunchModal(
  elements: LaunchModalElements,
  handlers: LaunchModalHandlers,
): LaunchHandle {
  // The picker's whole state: what GET /api/browse most recently returned (null before
  // the first successful browse of this open), the served MRU list, whether that list has
  // resolved at all yet, and a monotonic counter guarding against a stale response landing
  // after a newer navigation was issued.
  let current: BrowseResult | null = null;
  let repos: Repo[] = [];
  let reposLoaded = false;
  let browseRequestId = 0;
  // Which fields the user has changed since the dialog opened, so the async
  // initial restore (initOpen/initialRestore) never overwrites a deliberate choice. Set
  // only from a real `change`/`input` DOM event below — never by this module's own
  // `setModel`/`setPermissionMode` calls, which assign `.checked`/`.value` directly and so
  // dispatch nothing.
  let touched: Touched = { model: false, mode: false };
  // Whether the error currently shown in `#launch-error` is the "repos unavailable"
  // kind. That error has no fix-it action in this dialog (nothing re-fetches repos
  // mid-open), so it must survive the browse-root fallback `initOpen()` issues right
  // after it — unlike a *browse* failure, which a later successful navigate() is meant
  // to clear. Reset whenever a non-repos error replaces it or the error is
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
      checkRadioValue(elements.modelRadios, value);
    if (!matched) {
      checkRadioValue(elements.modelRadios, "other");
      elements.customModelInput.value = value;
    }
    updateCustomModelVisibility();
  }

  // A stored value the dialog has no radio for (a future Claude Code mode,
  // `null`, or the empty string) falls back to `auto` — decided by the pure, unit-tested
  // `permissionModeToCheck` (sessions/permission.ts), which takes `null` directly (no
  // caller-side coercion to `""`). `setPermissionMode` here and `selectedPermissionMode`
  // just below are this file's two callers.
  function setPermissionMode(value: string | null): void {
    checkRadioValue(elements.permissionModeRadios, permissionModeToCheck(value));
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

  // The "write the message, toggle hidden" message-region idiom already
  // has one implementation, `render/actionerror.ts`'s `renderActionError`.
  function showError(message: string): void {
    renderActionError(elements.launchError, message);
    reposErrorPersistent = false;
  }

  // The repos-fetch failure: shown the same way as any other error, but must
  // not be wiped by the browse-root fallback that `initOpen()` runs immediately
  // afterwards (there is no user action, inside this dialog, that fixes GET /api/repos).
  function showReposError(message: string): void {
    renderActionError(elements.launchError, message);
    reposErrorPersistent = true;
  }

  function clearError(): void {
    renderActionError(elements.launchError, null);
    reposErrorPersistent = false;
  }

  /** A clicked Recent navigates, then, unlike the initial restore, always restores its
   * directory's model and mode, touched or not — `repoRestore` is the one owner of what
   * those values are. Model/mode apply only after the navigation succeeds, so a 404'd
   * recent leaves the form untouched. */
  function selectRecent(repo: Repo): void {
    void (async () => {
      const outcome = await navigate(repo.path);
      if (outcome === "ok") {
        const values = repoRestore(repo);
        setModel(values.model);
        setPermissionMode(values.mode);
      }
    })();
  }

  function renderRecents(): void {
    renderRecentsList(
      elements.recentsList,
      elements.recentEntryTemplate,
      repos,
      reposLoaded,
      current?.path ?? null,
      selectRecent,
    );
  }

  function renderListing(): void {
    renderBrowseListing(
      elements.browseDirs,
      elements.entryTemplate,
      current?.dirs ?? null,
      (path) => void navigate(path),
    );
  }

  function renderListingLoading(): void {
    renderBrowseLoading(elements.browseDirs);
  }

  function updateCrumbs(): void {
    if (!current) {
      elements.crumbsNav.replaceChildren();
      return;
    }
    renderCrumbs(elements.crumbsNav, splitCrumbs(current.path), (path) => void navigate(path));
  }

  function renderFooter(): void {
    const path = current?.path ?? null;
    // The browse endpoint never reports the listed directory's own branch — the
    // only honest source is a recent whose served path matches (derived, like `pressed`,
    // not tracked separately as "how did we get here").
    const branch = path ? (repos.find((repo) => repo.path === path)?.branch ?? null) : null;
    renderLaunchFooter(elements.launchTargetPath, elements.launchTargetBranch, path, branch);
  }

  function renderAll(): void {
    renderRecents();
    updateCrumbs();
    renderListing();
    renderFooter();
  }

  /** `navigate()`'s outcome: whether the browse it issued landed, failed, or was
   * superseded by a newer navigation before it resolved. `initOpen` switches on this
   * directly (kb:adr/launch-open-outcome-decided-in-controller); `navigateUp` passes it through. */
  type NavigateOutcome = "ok" | "failed" | "superseded";

  /** The one door for changing the selection. Bumps the request counter, shows
   * `loading…`, awaits the browse, and reports `"superseded"` if a newer navigation was
   * issued meanwhile without touching the listing that newer navigation is
   * about to render. On failure the previous listing is restored untouched while
   * the error surfaces. The three-way outcome (not a plain boolean) is what lets
   * `initOpen` tell a genuine failure from a superseded race. */
  async function navigate(path?: string): Promise<NavigateOutcome> {
    const requestId = ++browseRequestId;
    renderListingLoading();
    const result = await browse(path);
    if (requestId !== browseRequestId) return "superseded";
    if (result.ok) {
      // A *browse* error (including a validation/launch error, or
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
   * re-anchor focus after ascending key off the `null` case to skip that
   * re-anchor on the genuine no-op — see the `ArrowLeft` handler below. */
  function navigateUp(): Promise<NavigateOutcome | null> {
    const buttons = elements.crumbsNav.querySelectorAll<HTMLButtonElement>("button[data-path]");
    const last = buttons[buttons.length - 1];
    if (last?.dataset.path) return navigate(last.dataset.path);
    return Promise.resolve(null);
  }

  /** Traversal continuity: `renderAll()` replaces every entry button on each
   * navigation (the picker's per-navigation full rebuild), so the button
   * that held focus before a descend/ascend is gone afterward and focus silently falls to
   * `<body>`. Re-anchoring on the first entry of the new listing keeps ↑/↓/←/→ usable past
   * one keystroke instead of one-shot. */
  function focusFirstEntry(): void {
    elements.browseDirs.querySelector<HTMLButtonElement>("button.entry")?.focus();
  }

  /** Applies whichever of `initialRestore`'s two fields survived the touched
   * filter — a plain caller of the pure decision. */
  function applyInitialRestore(first: Repo): void {
    const restore = initialRestore(touched, first);
    if (restore.model !== undefined) setModel(restore.model);
    if (restore.mode !== undefined) setPermissionMode(restore.mode);
  }

  /** The initial-open sequence: fetches the MRU list, then attempts the
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
      // The first recent's directory no longer exists. Without a
      // fallback there would be no crumbs to click, so fall back to the browse root; its
      // success clears the error the failed attempt raised.
      await navigate(undefined);
    }
    // "superseded": the initial navigation was superseded by a navigation the
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
    // With no stored mode to restore, `permissionModeToCheck`'s own fallback (now
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

  // With focus on a child entry, ↑/↓ move focus between entries and →/Enter
  // descend (Enter already works for free — it's a <button>); ← is ⌘↑'s synonym, but only
  // when focus is inside the listing (features/shortcuts.ts's one window
  // keydown listener covers the ⌘↑ case everywhere else, so this bows out whenever the
  // meta key is held).
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
        // instead of re-anchoring to the (unchanged) first entry.
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

  return {
    open: openModal,
    isOpen: () => elements.dialog.open,
    navigateToParentDir: () => {
      void navigateUp();
    },
  };
}

// Structural, not a sibling import of FocusHandle/SurfacesHandle from their
// owning sibling modules.
export interface LaunchDeps {
  focus: { bringForward(session: Session): void };
  surfaces: { focusSelected(id: number): void };
}

/** The controller entry: locates the launch dialog + its one open button, wires
 * `onLaunched` to the store and to opening the launched session — focused in Focus,
 * promoted in Tiles, keyboard focus in its terminal in both views
 * (kb:adr/launch-opens-launched-session, kb:adr/tiles-launched-session-promoted-into-grid).
 * Returns the `LaunchHandle` `features/shortcuts.ts` dispatches ⌥⌘N/⌘↑ through. */
export function initLaunch(app: App, deps: LaunchDeps): LaunchHandle {
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

  return initLaunchModal(elements, {
    // The card must appear the instant the 201 comes back — before any hook can
    // possibly arrive. The `sessionUpsert` the daemon also broadcasts for this same
    // launch is a harmless duplicate upsert once the WS delivers it.
    onLaunched: (session) => {
      app.store.upsert(session);
      // Focuses in Focus, promotes in Tiles (the grid may be full — `promote`
      // demotes exactly the lowest-priority live tile). `focus.bringForward` is the one
      // owner of this decision, shared with the number chords — reached structurally,
      // never by importing `./focus`.
      deps.focus.bringForward(session);
      // Keyboard focus follows in both views. `dialog.close()` (called by
      // `submit()` before this handler runs) restores focus to the opener synchronously,
      // and the surface this targets is only mounted by `bringForward`'s render/promote
      // above (surfaces.ts's render phase), so this must run last.
      deps.surfaces.focusSelected(session.id);
    },
  });
}
