// Wires the one `dialog.diagram-modal` per reader root
// (kb:adr/reader-diagram-enlarge-is-a-zoomable-modal): opening it from any
// `.diagram-enlarge` click, zoom/pan from wheel, pointer drag, the keyboard and the
// toolbar buttons, and closing on Escape, a backdrop click or `Close` with focus
// restored. Delegated listeners only — figures are rebuilt by `render/diagrams.ts` on
// every open/re-fetch, so nothing here holds a reference to a particular figure across a
// render pass.
import { fitScale, panBy, resetZoom, transformOf, wheelFactor, zoomAround } from "../reader/zoom";
import type { ReaderRefs } from "./reader";

const ZOOM_STEP = 1.25;
const ARROW_PAN_PX = 40;

/** The clone's natural pixel size — the DOM sketch's fallback chain: `viewBox` first
 * (mermaid always sets one), then the `width`/`height` presentation attributes, then
 * `getBBox()` for anything stranger. */
function intrinsicSize(svg: SVGSVGElement): { w: number; h: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { w: viewBox.width, h: viewBox.height };
  }
  const attrW = Number.parseFloat(svg.getAttribute("width") ?? "");
  const attrH = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (attrW > 0 && attrH > 0) return { w: attrW, h: attrH };
  const bbox = svg.getBBox();
  return { w: bbox.width || 1, h: bbox.height || 1 };
}

/** Wires the dialog for one reader instance's refs — called once from `buildReader`.
 * `state`/`fit` are this closure's own private variables — one dialog per reader root —
 * never exposed on `ReaderRefs`. */
export function wireDiagramDialog(refs: ReaderRefs): void {
  let state = resetZoom();
  let fit = 1;
  let openedButton: HTMLButtonElement | null = null;
  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    fromX: number;
    fromY: number;
  } | null = null;

  function apply(): void {
    refs.diagramStage.dataset["zoom"] = state.zoom.toFixed(2);
    refs.diagramCanvas.style.transform = transformOf(state, fit);
  }

  /** `fit` (and the canvas's own centred position, kept out of the pan state so `Reset
   * zoom` can restore literal `translate(0px, 0px)`) is computed on open and on `Reset
   * zoom` only — never on every zoom step, and never on window resize. */
  function computeFitAndCenter(): void {
    const svg = refs.diagramCanvas.querySelector("svg");
    if (!svg) return;
    const { w, h } = intrinsicSize(svg);
    const stageW = refs.diagramStage.clientWidth;
    const stageH = refs.diagramStage.clientHeight;
    fit = fitScale(w, h, stageW, stageH);
    refs.diagramCanvas.style.width = `${w}px`;
    refs.diagramCanvas.style.height = `${h}px`;
    refs.diagramCanvas.style.left = `${(stageW - w * fit) / 2}px`;
    refs.diagramCanvas.style.top = `${(stageH - h * fit) / 2}px`;
  }

  function stageCenter(): { x: number; y: number } {
    return { x: refs.diagramStage.clientWidth / 2, y: refs.diagramStage.clientHeight / 2 };
  }

  function zoomByStep(factor: number): void {
    const c = stageCenter();
    state = zoomAround(state, factor, c.x, c.y);
    apply();
  }

  function resetToFit(): void {
    state = resetZoom();
    computeFitAndCenter();
    apply();
  }

  function open(button: HTMLButtonElement): void {
    const figure = button.closest("figure.diagram");
    const svg = figure?.querySelector("svg");
    if (!svg) return;
    openedButton = button;
    // A clone, never the live node — the dialog must survive the body being replaced
    // under it and never lets the modal's own transform touch the figure's on-page SVG.
    refs.diagramCanvas.replaceChildren(svg.cloneNode(true));
    state = resetZoom();
    if (!refs.diagramDialog.open) refs.diagramDialog.showModal();
    computeFitAndCenter();
    apply();
    refs.diagramStage.focus();
  }

  // Delegated (figures are rebuilt on every render pass, so no per-button listener
  // could outlive one).
  refs.root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(".diagram-enlarge");
    if (button && refs.root.contains(button)) open(button);
  });

  // A click that lands on the dialog element itself (never a descendant, since the stage
  // and toolbar fill its entire box) is a backdrop click — the well-known `<dialog>`
  // pattern, since `::backdrop` isn't a real node a listener can target directly.
  refs.diagramDialog.addEventListener("click", (event) => {
    if (event.target === refs.diagramDialog) refs.diagramDialog.close();
  });
  refs.diagramClose.addEventListener("click", () => refs.diagramDialog.close());

  // Escape (native `cancel` → `close`), the backdrop and `Close` above all end here.
  refs.diagramDialog.addEventListener("close", () => {
    const button = openedButton;
    openedButton = null;
    drag = null;
    // The canvas holds a clone of the figure's own SVG, id included. `rerenderDiagrams`
    // mints a fresh id per pass rather than reusing the figure's, so this clear is
    // defence in depth rather than the only thing preventing a stale-id collision — but
    // it's independently sufficient, and it stops a closed modal holding a full SVG copy,
    // and its duplicate ids, in the document until the next open.
    refs.diagramCanvas.replaceChildren();
    // The body may have re-rendered while the dialog was open, detaching
    // the original button — fall back to `article.md` rather than focusing nothing.
    if (button?.isConnected) button.focus();
    else refs.body.focus();
  });

  refs.diagramZoomIn.addEventListener("click", () => zoomByStep(ZOOM_STEP));
  refs.diagramZoomOut.addEventListener("click", () => zoomByStep(1 / ZOOM_STEP));
  refs.diagramZoomReset.addEventListener("click", resetToFit);

  // Non-passive so `preventDefault` actually stops the page/browser from zooming too —
  // the same handler covers a trackpad pinch, which arrives as a `wheel` event with
  // `ctrlKey` set.
  refs.diagramStage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = refs.diagramStage.getBoundingClientRect();
      state = zoomAround(
        state,
        wheelFactor(event.deltaY),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
      apply();
    },
    { passive: false },
  );

  refs.diagramStage.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "+":
      case "=":
        zoomByStep(ZOOM_STEP);
        break;
      case "-":
        zoomByStep(1 / ZOOM_STEP);
        break;
      case "0":
        resetToFit();
        break;
      case "ArrowLeft":
        state = panBy(state, -ARROW_PAN_PX, 0);
        apply();
        break;
      case "ArrowRight":
        state = panBy(state, ARROW_PAN_PX, 0);
        apply();
        break;
      case "ArrowUp":
        state = panBy(state, 0, -ARROW_PAN_PX);
        apply();
        break;
      case "ArrowDown":
        state = panBy(state, 0, ARROW_PAN_PX);
        apply();
        break;
      default:
        return;
    }
    // Escape isn't handled here — it's the dialog's own native cancel behaviour — but
    // every key this switch does handle stops here so it never reaches whatever
    // `document`-level shortcut listener is behind it.
    event.preventDefault();
  });

  refs.diagramStage.addEventListener("pointerdown", (event) => {
    refs.diagramStage.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fromX: state.x,
      fromY: state.y,
    };
  });
  refs.diagramStage.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    state = {
      zoom: state.zoom,
      x: drag.fromX + (event.clientX - drag.startX),
      y: drag.fromY + (event.clientY - drag.startY),
    };
    apply();
  });
  function endDrag(event: PointerEvent): void {
    if (drag?.pointerId !== event.pointerId) return;
    refs.diagramStage.releasePointerCapture(event.pointerId);
    drag = null;
  }
  refs.diagramStage.addEventListener("pointerup", endDrag);
  refs.diagramStage.addEventListener("pointercancel", endDrag);
}
