// The launch modal: MRU picker + folder browser + form (docs/protocol.md §3.1/§3.2/§3.6;
// plan m1-sessions UI Specifications > Launch modal; ux-flows §1.2). DOM + wiring only —
// every daemon call goes through ../api.ts, and the parsed Session comes back through
// `onLaunched` so main.ts (which owns the session store) decides what happens next.
import { browse, fetchRepos, launchSession, type BrowseResult, type LaunchRequest, type Repo } from "../api";
import type { Session } from "../protocol";
import { formatAge } from "../sessions/format";

const MODEL_PRESETS = ["sonnet", "opus", "haiku"] as const;

export interface LaunchModalElements {
  dialog: HTMLDialogElement;
  openButton: HTMLButtonElement;
  mruList: HTMLElement;
  mruEntryTemplate: HTMLTemplateElement;
  browseButton: HTMLButtonElement;
  browsePanel: HTMLElement;
  browsePath: HTMLElement;
  browseUpButton: HTMLButtonElement;
  browseDirs: HTMLElement;
  subdirEntryTemplate: HTMLTemplateElement;
  useThisFolderButton: HTMLButtonElement;
  selectedDirectoryDisplay: HTMLElement;
  titleInput: HTMLInputElement;
  modelRadios: HTMLInputElement[];
  customModelRow: HTMLElement;
  customModelInput: HTMLInputElement;
  permissionModeRadios: HTMLInputElement[];
  launchError: HTMLElement;
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
  let selectedDirectory: string | null = null;
  let browseState: BrowseResult | null = null;

  function updateCustomModelVisibility(): void {
    elements.customModelRow.hidden = checkedValue(elements.modelRadios) !== "other";
  }

  function setModel(value: string): void {
    const matched = MODEL_PRESETS.includes(value as (typeof MODEL_PRESETS)[number]) && checkRadio(elements.modelRadios, value);
    if (!matched) {
      checkRadio(elements.modelRadios, "other");
      elements.customModelInput.value = value;
    }
    updateCustomModelVisibility();
  }

  function setPermissionMode(value: string): void {
    checkRadio(elements.permissionModeRadios, value);
  }

  function selectedModel(): string {
    if (checkedValue(elements.modelRadios) === "other") {
      return elements.customModelInput.value.trim();
    }
    return checkedValue(elements.modelRadios) ?? "";
  }

  function selectedPermissionMode(): "default" | "plan" | "acceptEdits" {
    const value = checkedValue(elements.permissionModeRadios);
    return value === "plan" || value === "acceptEdits" ? value : "default";
  }

  function showError(message: string): void {
    elements.launchError.textContent = message;
    elements.launchError.hidden = false;
  }

  function clearError(): void {
    elements.launchError.textContent = "";
    elements.launchError.hidden = true;
  }

  function setSelectedDirectory(path: string): void {
    selectedDirectory = path;
    elements.selectedDirectoryDisplay.textContent = path;
    elements.browsePanel.hidden = true;
  }

  function resetForm(): void {
    selectedDirectory = null;
    elements.selectedDirectoryDisplay.textContent = "—";
    elements.titleInput.value = "";
    elements.customModelInput.value = "";
    setModel("sonnet");
    setPermissionMode("default");
    elements.browsePanel.hidden = true;
    clearError();
  }

  function renderMruList(repos: readonly Repo[]): void {
    const now = new Date();
    elements.mruList.replaceChildren(
      ...repos.map((repo) => {
        const fragment = elements.mruEntryTemplate.content.cloneNode(true) as DocumentFragment;
        const button = fragment.querySelector<HTMLButtonElement>("button");
        if (!button) throw new Error("mru-entry-template is missing its button");
        const name = button.querySelector<HTMLElement>(".dir-name");
        const path = button.querySelector<HTMLElement>(".dir-path");
        const br = button.querySelector<HTMLElement>(".dir-branch");
        const age = button.querySelector<HTMLElement>(".dir-age");
        if (name) name.textContent = repo.name;
        // Plan UI spec: "name, path, branch or —, relative last-launch age" — the path is
        // what distinguishes a repo from a linked worktree in the picker (ux-flows §2).
        if (path) path.textContent = repo.path;
        if (br) br.textContent = repo.branch ?? "—";
        if (age) age.textContent = formatAge(repo.lastLaunchedAt, now);
        button.addEventListener("click", () => {
          setSelectedDirectory(repo.path);
          setModel(repo.lastModel ?? "sonnet");
          setPermissionMode(repo.lastPermissionMode ?? "default");
        });
        return button;
      }),
    );
  }

  function renderBrowse(result: BrowseResult): void {
    browseState = result;
    elements.browsePath.textContent = result.path;
    elements.browseDirs.replaceChildren(
      ...result.dirs.map((dir) => {
        const fragment = elements.subdirEntryTemplate.content.cloneNode(true) as DocumentFragment;
        const button = fragment.querySelector<HTMLButtonElement>("button");
        if (!button) throw new Error("subdir-entry-template is missing its button");
        // Plan UI spec: "subdirectory buttons (from GET /api/browse, git checkouts
        // marked)". Additive marker text — the button's name still contains the
        // directory's own name (Testable UI Elements table).
        button.textContent = dir.isGit ? `${dir.name} (git)` : dir.name;
        button.addEventListener("click", () => void loadBrowse(dir.path));
        return button;
      }),
    );
  }

  async function loadBrowse(path?: string): Promise<void> {
    const result = await browse(path);
    // Edge case 14 (plan): a browse failure (removed/unreadable directory) leaves the
    // panel showing its last-known listing rather than clearing it silently — but the
    // failure itself must still be visible (plan: "the browser UI shows the error and
    // stays where it was"), not just silently swallowed.
    if (result.ok) {
      clearError();
      renderBrowse(result.value);
    } else {
      showError(result.error.message);
    }
  }

  async function loadRepos(): Promise<void> {
    const result = await fetchRepos();
    if (result.ok) {
      clearError();
      renderMruList(result.value);
    } else {
      showError(result.error.message);
    }
  }

  async function submit(): Promise<void> {
    if (!selectedDirectory) {
      showError("Choose a directory to launch into.");
      return;
    }
    const model = selectedModel();
    if (!model) {
      showError("Enter a model.");
      return;
    }
    const body: LaunchRequest = {
      directory: selectedDirectory,
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
    void loadRepos();
  }

  elements.openButton.addEventListener("click", openModal);

  // REQ-22 (nice-to-have) / ux-flows keyboard model: Cmd+N opens the launch modal from
  // anywhere in the shell.
  window.addEventListener("keydown", (event) => {
    if (event.metaKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "n") {
      // Guard lives here, not just inside openModal()'s own early return, so it's
      // visible at the point where we swallow the browser's own Cmd+N (review
      // m1-sessions cycle-2 Minor 4).
      if (elements.dialog.open) return;
      event.preventDefault();
      openModal();
    }
  });

  elements.browseButton.addEventListener("click", () => {
    elements.browsePanel.hidden = false;
    void loadBrowse();
  });

  elements.browseUpButton.addEventListener("click", () => {
    if (browseState?.parent) void loadBrowse(browseState.parent);
  });

  elements.useThisFolderButton.addEventListener("click", () => {
    if (browseState) setSelectedDirectory(browseState.path);
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
