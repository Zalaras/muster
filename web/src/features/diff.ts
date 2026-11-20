import { type DiffSummary, fetchDiffSummary } from "../api/diff";
import type { App, RenderFrame } from "../app";
import { requireElement } from "../dom";
import { setText } from "../dom";
import type { DiffView } from "../render/diffbody";
import { readJson, safeLocalStorage, writeJson } from "../storage";
import { diffButtonText, diffButtonTitle } from "./diffbutton";
import { createViewer, type Viewer } from "./diffviewer";

const POLL_MS = 5000;
const VIEW_KEY = "muster.diffView";

export interface DiffDeps {
  surfaces: { focusSelected(id: number): void };
}

export interface DiffHandle {
  viewerRoot(id: number): HTMLElement | null;
  mounted(id: number): void;
  close(id: number): void;
}

function parseView(value: unknown): DiffView | null {
  return value === "unified" || value === "split" || value === "review" ? value : null;
}

function dismissOpenPopover(): boolean {
  const panel = document.querySelector<HTMLElement>("body > .menu");
  if (!panel) return false;
  panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  return true;
}

export function initDiff(app: App, deps: DiffDeps): DiffHandle {
  const button = requireElement<HTMLButtonElement>("#diff-button");
  const storage = safeLocalStorage();
  const summaries = new Map<number, DiffSummary>();
  const viewers = new Map<number, Viewer>();
  const inFlight = new Set<number>();
  let lastKey = "";

  function remembered(): DiffView {
    return readJson(storage, VIEW_KEY, parseView, "unified");
  }

  function viewerFor(id: number): Viewer {
    const existing = viewers.get(id);
    if (existing) return existing;
    const viewer = createViewer({
      id,
      initialView: remembered(),
      rememberView: (view) => writeJson(storage, VIEW_KEY, view),
      reviewChanged: () => poll(id),
      close: () => close(id),
    });
    viewers.set(id, viewer);
    return viewer;
  }

  function polling(): boolean {
    return app.state.view === "focus" && app.state.focusedId !== null && !document.hidden;
  }

  function poll(id: number): void {
    if (!polling() || app.state.focusedId !== id || inFlight.has(id)) return;
    inFlight.add(id);
    void fetchDiffSummary(id).then((result) => {
      inFlight.delete(id);
      if (!result.ok) return;
      summaries.set(id, result.value);
      viewers.get(id)?.counts(result.value);
      app.render();
    });
  }

  function pollFocused(): void {
    if (app.state.focusedId !== null) poll(app.state.focusedId);
  }

  function close(id: number): void {
    const viewer = viewers.get(id);
    if (!viewer?.isOpen()) return;
    const active = document.activeElement;
    const keepFocus = active === document.body || viewer.root.contains(active) || active === button;
    viewer.hide();
    app.render();
    if (keepFocus) deps.surfaces.focusSelected(id);
  }

  function open(id: number): void {
    const summary = summaries.get(id);
    if (!summary) return;
    const viewer = viewerFor(id);
    viewer.open(summary);
    app.render();
    viewer.focus();
  }

  function renderButton(frame: RenderFrame): void {
    const id = app.state.focusedId;
    const session = frame.sessions.find((s) => s.id === id);
    const summary = id !== null ? (summaries.get(id) ?? null) : null;
    const isOpen = id !== null && (viewers.get(id)?.isOpen() ?? false);
    const text = app.state.view === "focus" && session ? diffButtonText(summary, isOpen) : null;
    button.hidden = text === null;
    if (text === null || !summary) {
      setText(button, "");
      return;
    }
    setText(button, text);
    button.setAttribute("aria-pressed", String(isOpen));
    const title = diffButtonTitle(summary);
    if (button.title !== title) button.title = title;
  }

  app.onRender((frame) => {
    const key = `${app.state.view}:${app.state.focusedId}`;
    if (key !== lastKey) {
      lastKey = key;
      pollFocused();
    }
    renderButton(frame);
  });

  button.addEventListener("click", () => {
    const id = app.state.focusedId;
    if (id === null) return;
    if (viewers.get(id)?.isOpen()) close(id);
    else open(id);
  });

  document.addEventListener("keydown", (event) => {
    const id = app.state.focusedId;
    const viewer = id === null ? undefined : viewers.get(id);
    if (event.key !== "Escape" || event.defaultPrevented || !viewer?.isOpen() || id === null)
      return;
    if (app.state.view !== "focus" || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    if (dismissOpenPopover()) return;
    if (!viewer.escape()) close(id);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pollFocused();
  });
  setInterval(pollFocused, POLL_MS);

  app.on("sessionRemoved", (id) => {
    viewers.delete(id);
    summaries.delete(id);
  });

  return {
    viewerRoot(id) {
      const viewer = viewers.get(id);
      return viewer?.isOpen() ? viewer.root : null;
    },
    mounted(id) {
      viewers.get(id)?.onMounted();
    },
    close,
  };
}
