// Focus/Tiles switcher, density buttons, and the two view containers' `hidden` (plan
// code-breakup vocabulary: "views"). Owns `app.state.view`/`app.state.density` — the only
// module that ever writes them, always adopted from a `prefs` broadcast, never
// optimistically from a click.
//
// The `prefs` handler reads `prefs.view`/`prefs.density` directly off the incoming
// message rather than off `app.state` (which it is itself about to overwrite) and
// compares against its own `lastView`/`lastDensity` — so it is safe regardless of
// whether `tiles.ts`'s own `prefs` subscriber (which needs the same "did it actually
// change" comparison, to reset `tilesLive`) happens to run before or after this one; see
// tiles.ts's header comment. Edge case 7: a reconnect echoing identical prefs must not
// emit `cancelRenames` or reshuffle anything.
import type { App } from "../app";
import { putPrefs } from "../api";
import { requireElement } from "../dom";
import { renderDensityControl, renderViewSwitcher } from "../render/masthead";
import type { Density } from "../protocol";

export interface ViewsHandle {
  /** design-system §4.1: ⌘\ toggles the view. */
  toggle(): void;
}

export function initViews(app: App): ViewsHandle {
  const viewFocusBtn = requireElement<HTMLButtonElement>("#view-focus-btn");
  const viewTilesBtn = requireElement<HTMLButtonElement>("#view-tiles-btn");
  const density2x2Btn = requireElement<HTMLButtonElement>("#density-2x2-btn");
  const density3x2Btn = requireElement<HTMLButtonElement>("#density-3x2-btn");
  const densityToolbarEl = requireElement<HTMLElement>("#density-toolbar");
  const viewFocusEl = requireElement<HTMLElement>("#view-focus");
  const viewTilesEl = requireElement<HTMLElement>("#view-tiles");

  let lastView = app.state.view;

  function requestView(newView: "focus" | "tiles"): void {
    void putPrefs({ view: newView }).then((result) => {
      if (!result.ok)
        console.error(`PUT /api/prefs failed: ${result.error.code} ${result.error.message}`);
    });
  }

  function requestDensity(newDensity: Density): void {
    void putPrefs({ density: newDensity }).then((result) => {
      if (!result.ok)
        console.error(`PUT /api/prefs failed: ${result.error.code} ${result.error.message}`);
    });
  }

  app.on("prefs", (prefs) => {
    if (prefs.view !== lastView) {
      // review cycle 1 Critical 1: a view switch hides the other view's whole subtree
      // rather than reconciling it, so an open rename editor's blur would otherwise
      // commit — cancel both surfaces before the switch.
      app.emit("cancelRenames");
    }
    lastView = prefs.view;
    app.state.view = prefs.view;
    app.state.density = prefs.density;
  });

  // review cycle 1 Critical 1, live-browser-verified gap: a `mousedown` fires (and its
  // default action blurs any open rename editor) before the paired `click` listener
  // below runs, so cancelling there is too late. A same-view press must NOT cancel — the
  // ordinary mousedown-default blur should reach the field's own `onBlur` and commit
  // (plan claude-status-fixes REQ-6/REQ-7).
  viewFocusBtn.addEventListener("mousedown", (e) => {
    if (e.button === 0 && app.state.view !== "focus") app.emit("cancelRenames");
  });
  viewTilesBtn.addEventListener("mousedown", (e) => {
    if (e.button === 0 && app.state.view !== "tiles") app.emit("cancelRenames");
  });
  viewFocusBtn.addEventListener("click", () => {
    if (app.state.view !== "focus") requestView("focus");
  });
  viewTilesBtn.addEventListener("click", () => {
    if (app.state.view !== "tiles") requestView("tiles");
  });
  density2x2Btn.addEventListener("click", () => requestDensity("2x2"));
  density3x2Btn.addEventListener("click", () => requestDensity("3x2"));

  // Render phase 9 (UI Specifications > Render phase order).
  app.onRender(() => {
    renderViewSwitcher({ focusButton: viewFocusBtn, tilesButton: viewTilesBtn }, app.state.view);
    renderDensityControl(
      {
        container: densityToolbarEl,
        twoByTwoButton: density2x2Btn,
        threeByTwoButton: density3x2Btn,
      },
      app.state.view,
      app.state.density,
    );
    viewFocusEl.hidden = app.state.view !== "focus";
    viewTilesEl.hidden = app.state.view !== "tiles";
  });

  return {
    toggle() {
      requestView(app.state.view === "focus" ? "tiles" : "focus");
    },
  };
}
