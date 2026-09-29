// The launch dialog's Resume tab (kb:adr/launch-resume-listed-from-transcripts-by-cwd):
// the New | Resume tab pair itself, fetching the listed directory's past Claude Code
// sessions, the filter box and the row selection, and the resume submit call. Split out
// of features/launch.ts the same way features/launchmodels.ts/launchrestore.ts are — a
// DOM-free-enough controller with one caller, but this one is large enough (its own
// fetch/filter/selection state machine) to want the "own file" half of that split's rule
// rather than living inline (docs/conventions.md § Composition roots).
//
// This module owns no daemon call beyond its own list/resume endpoints and touches no
// element outside the ones it's handed — `features/launch.ts` still owns the dialog
// itself (open/reset/navigate/submit dispatch, the New tab's own fields) and threads its
// own state through `LaunchResumeHandlers` rather than this module reaching back in.
import { fetchPastSessions, resumeFromList, type PastSession } from "../api/launch";
import type { ApiResult } from "../api/http";
import type { Session } from "../protocol/session";
import { basename } from "../sessions/paths";
import {
  renderPastError,
  renderPastHead,
  renderPastList,
  renderPastLoading,
} from "../render/launchpast";
import { defaultSelection, filterPastSessions, pastRowView } from "./launchpastlist";

export interface LaunchResumeElements {
  tabNewBtn: HTMLButtonElement;
  tabResumeBtn: HTMLButtonElement;
  pickerEl: HTMLElement;
  fieldsEl: HTMLElement;
  pastSection: HTMLElement;
  pastHeadEl: HTMLElement;
  pastFilterInput: HTMLInputElement;
  pastListEl: HTMLElement;
}

export interface LaunchResumeHandlers {
  /** Fires on every change that could move `#launch-button`'s face, its footer text or
   * its disabled state — tab switch, a list landing, a selection, a filter keystroke.
   * `features/launch.ts` recomputes all three from this one hook rather than this module
   * writing them itself, so the New tab's own equivalents (model verdicts, mode changes)
   * go through the identical single recompute. */
  onFaceChange: () => void;
  /** Fires only on an explicit user action that should drop a stale `#launch-error` — a
   * tab switch or picking a different row — deliberately narrower than `onFaceChange`
   * above, which also fires on a fetch landing: `past-sessions.spec.ts`'s "resuming a
   * fixture deleted after listing" test resumes, gets a 404, and its own error handling
   * triggers a refetch that must NOT wipe the very message it's about to show. */
  onUserAction: () => void;
}

export interface LaunchResumeHandle {
  isActive(): boolean;
  /** The selected row's own last permission mode (the transcript's raw wire string), or
   * `null` while nothing is selected — `sessions/permission.ts`'s `launchPrimaryFace`'s
   * third argument. */
  selectedMode(): string | null;
  /** The selected row's title, its "(untitled)" fallback already applied by
   * `pastRowView` — `null` strictly means nothing is selected, never a selected row with
   * a null title. `render/launch.ts`'s `renderResumeFooter` shows the fallback dash only
   * for this `null` case. */
  selectedTitle(): string | null;
  /** Whether a resumable row is currently selected — Resume-tab's own half of
   * `#launch-button`'s disabled state. */
  hasSelection(): boolean;
  /** The dialog just opened fresh: back to New, no fetch, no filter, no selection. */
  reset(): void;
  /** The picker's listed directory changed (including the very first browse to resolve).
   * Refetches immediately while active; otherwise just remembers it for the next
   * `activate()`. */
  onDirectoryChanged(path: string | null): void;
  /** The Resume tab's own submit — `features/launch.ts`'s `submit()` calls this instead
   * of its own POST when `isActive()`. */
  submit(): Promise<ApiResult<Session>>;
}

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sessions: PastSession[]; truncated: boolean };

const FETCH_ERROR_MESSAGE = "Couldn't read sessions — try again";

export function initLaunchResume(
  elements: LaunchResumeElements,
  handlers: LaunchResumeHandlers,
): LaunchResumeHandle {
  let active = false;
  let directory: string | null = null;
  let filterQuery = "";
  let selectedId: string | null = null;
  let requestId = 0;
  let listState: ListState = { status: "ready", sessions: [], truncated: false };

  // Searches the *visible* (filtered) set, not the full fetched list — a selection the
  // filter has since hidden is no longer a selection (States: "filter excludes
  // everything: … button disabled"; a stale row nobody can see must not still submit).
  function findSelected(): PastSession | null {
    return visibleSessions().find((session) => session.claudeSessionId === selectedId) ?? null;
  }

  function visibleSessions(): PastSession[] {
    return listState.status === "ready" ? filterPastSessions(listState.sessions, filterQuery) : [];
  }

  function selectRow(session: PastSession): void {
    selectedId = session.claudeSessionId;
    render();
    handlers.onFaceChange();
    handlers.onUserAction();
  }

  function render(): void {
    if (!active) return;
    const dirName = directory ? basename(directory) : "";
    if (listState.status === "loading") {
      renderPastHead(elements.pastHeadEl, dirName, null);
      renderPastLoading(elements.pastListEl);
      return;
    }
    if (listState.status === "error") {
      renderPastHead(elements.pastHeadEl, dirName, null);
      renderPastError(elements.pastListEl, listState.message);
      return;
    }
    renderPastHead(elements.pastHeadEl, dirName, listState.sessions.length);
    renderPastList(
      elements.pastListEl,
      visibleSessions().map(pastRowView),
      listState.sessions.length === 0,
      listState.truncated,
      selectedId,
      new Date(),
      selectRow,
    );
  }

  /** Fetches `directory`'s past sessions — the one place `requestId` is bumped, so a
   * response for a directory the user has since navigated away from is dropped rather
   * than merged into a newer fetch's state. Fires even before the picker's own browse
   * has ever resolved (`directory === null`, an empty-string request) — with the daemon
   * down, the New tab's own browse never resolves either, so a directory-gated fetch
   * would never fire at all and the Resume tab could never show its own "daemon down"
   * state. A real, healthy daemon still just answers `400 invalid_request` for the empty
   * path, corrected moments later by the picker's own `onDirectoryChanged` once its
   * browse lands. */
  function fetchList(): void {
    const dir = directory ?? "";
    listState = { status: "loading" };
    selectedId = null;
    render();
    handlers.onFaceChange();
    const id = ++requestId;
    void (async () => {
      const result = await fetchPastSessions(dir);
      if (id !== requestId) return;
      if (!result.ok) {
        listState = { status: "error", message: FETCH_ERROR_MESSAGE };
      } else {
        listState = {
          status: "ready",
          sessions: result.value.sessions,
          truncated: result.value.truncated,
        };
        selectedId = defaultSelection(result.value.sessions)?.claudeSessionId ?? null;
      }
      render();
      handlers.onFaceChange();
    })();
  }

  function activate(): void {
    active = true;
    elements.tabNewBtn.setAttribute("aria-selected", "false");
    elements.tabResumeBtn.setAttribute("aria-selected", "true");
    elements.pickerEl.classList.add("resume");
    elements.fieldsEl.hidden = true;
    elements.pastSection.hidden = false;
    fetchList();
  }

  function deactivate(): void {
    active = false;
    elements.tabNewBtn.setAttribute("aria-selected", "true");
    elements.tabResumeBtn.setAttribute("aria-selected", "false");
    elements.pickerEl.classList.remove("resume");
    elements.fieldsEl.hidden = false;
    elements.pastSection.hidden = true;
  }

  function switchToNew(): void {
    if (!active) return;
    deactivate();
    handlers.onFaceChange();
    handlers.onUserAction();
  }

  function switchToResume(): void {
    if (active) return;
    activate();
    handlers.onFaceChange();
    handlers.onUserAction();
  }

  elements.tabNewBtn.addEventListener("click", switchToNew);
  elements.tabResumeBtn.addEventListener("click", switchToResume);

  // ARIA authoring-practices tab pattern. With exactly two tabs, either arrow key moves
  // to — and selects — the one that isn't focused; there is nowhere else to go, so both
  // keys tie.
  elements.tabNewBtn.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    switchToResume();
    elements.tabResumeBtn.focus();
  });
  elements.tabResumeBtn.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    switchToNew();
    elements.tabNewBtn.focus();
  });
  elements.pastFilterInput.addEventListener("input", () => {
    filterQuery = elements.pastFilterInput.value;
    render();
    handlers.onFaceChange();
  });

  function reset(): void {
    directory = null;
    filterQuery = "";
    selectedId = null;
    listState = { status: "ready", sessions: [], truncated: false };
    elements.pastFilterInput.value = "";
    deactivate();
  }

  function onDirectoryChanged(path: string | null): void {
    directory = path;
    if (active) fetchList();
  }

  async function submit(): Promise<ApiResult<Session>> {
    const dir = directory;
    const session = findSelected();
    if (!dir || !session) {
      return {
        ok: false,
        error: { code: "invalid_request", message: "Choose a session to resume." },
      };
    }
    const result = await resumeFromList({
      directory: dir,
      resumeSessionId: session.claudeSessionId,
    });
    // A transcript deleted between list and POST refetches, so the list drops the
    // now-gone row rather than leaving it stale and clickable.
    if (!result.ok && result.error.code === "unknown_claude_session") fetchList();
    return result;
  }

  return {
    isActive: () => active,
    selectedMode: () => (active ? (findSelected()?.permissionMode ?? null) : null),
    selectedTitle: () => {
      if (!active) return null;
      const session = findSelected();
      return session ? pastRowView(session).title : null;
    },
    hasSelection: () => active && findSelected() !== null,
    reset,
    onDirectoryChanged,
    submit,
  };
}
