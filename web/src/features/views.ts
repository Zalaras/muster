// Focus/Tiles switcher, density buttons, and the two view containers' `hidden`. Owns
// `app.state.view`/`app.state.density` — the only module that ever writes them, always
// adopted from a `prefs` broadcast, never optimistically from a click.
//
// The `prefs` handler reads `prefs.view`/`prefs.density` directly off the incoming
// message rather than off `app.state` (which it is itself about to overwrite) and
// compares against its own `lastView`/`lastDensity` — so it is safe regardless of
// whether `tiles.ts`'s own `prefs` subscriber (which needs the same "did it actually
// change" comparison, to reset `tilesLive`) happens to run before or after this one; see
// tiles.ts's header comment. A reconnect echoing identical prefs must not
// emit `cancelRenames` or reshuffle anything.
import type { App, RenderFrame } from "../app";
import { sendPrefsPatch } from "../api/prefs";
import { requireElement } from "../dom";
import { renderDensityControl, renderViewSwitcher } from "../render/masthead";
import type { Density, View } from "../protocol/prefs";

export interface ViewsHandle {
  /** design-system §4.1: ⌘\ toggles the view. */
  toggle(): void;
}

/** The one thing `focus`/`tiles` need to be dispatched to by view — a small structural
 * interface rather than importing `FocusHandle`/`TilesHandle` (kb:adr/process-composition-roots-registration-only). */
export interface ViewRenderer {
  renderView(frame: RenderFrame): void;
}

export interface ViewsDeps {
  focus: ViewRenderer;
  tiles: ViewRenderer;
}

export function initViews(app: App, deps: ViewsDeps): ViewsHandle {
  const viewFocusBtn = requireElement<HTMLButtonElement>("#view-focus-btn");
  const viewTilesBtn = requireElement<HTMLButtonElement>("#view-tiles-btn");
  const density2x2Btn = requireElement<HTMLButtonElement>("#density-2x2-btn");
  const density3x2Btn = requireElement<HTMLButtonElement>("#density-3x2-btn");
  const densityToolbarEl = requireElement<HTMLElement>("#density-toolbar");
  const viewFocusEl = requireElement<HTMLElement>("#view-focus");
  const viewTilesEl = requireElement<HTMLElement>("#view-tiles");

  let lastView = app.state.view;

  function requestView(newView: View): void {
    sendPrefsPatch({ view: newView });
  }

  function requestDensity(newDensity: Density): void {
    sendPrefsPatch({ density: newDensity });
  }

  app.on("prefs", (prefs) => {
    if (prefs.view !== lastView) {
      // A view switch hides the other view's whole subtree rather than reconciling it, so
      // an open rename editor's blur would otherwise commit — cancel both surfaces before
      // the switch.
      app.emit("cancelRenames");
    }
    lastView = prefs.view;
    app.state.view = prefs.view;
    app.state.density = prefs.density;
  });

  // Live-browser-verified gap: a `mousedown` fires (and its
  // default action blurs any open rename editor) before the paired `click` listener
  // below runs, so cancelling there is too late. A same-view press must NOT cancel — the
  // ordinary mousedown-default blur should reach the field's own `onBlur` and commit
  // (kb:adr/views-active-segment-click-commits-rename).
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

  // Render phase 10 (main.ts's numbered render-phase order): the switcher/density
  // control and the two view containers' `hidden`, then — inherently split across two
  // other controllers by shared state, so registered here rather than inside either
  // one's own init — Focus's or Tiles' own content render for whichever view is current.
  app.onRender((frame) => {
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
    if (app.state.view === "focus") deps.focus.renderView(frame);
    else deps.tiles.renderView(frame);
  });

  return {
    toggle() {
      requestView(app.state.view === "focus" ? "tiles" : "focus");
    },
  };
}
