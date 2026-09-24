// The diagram pass: finds `pre > code` mermaid fences inside an already-rendered reader
// body and replaces each with its diagram, or leaves it in place with a failure line
// (kb:adr/reader-diagram-failure-keeps-source-with-reason). Runs strictly after
// `renderMarkdown` has produced the fragment and assigned heading ids (`features/reader.ts`
// calls this right after `setReaderBody`) and touches nothing but mermaid fences.
import { diagramErrorText, diagramId, isMermaidLanguageClass } from "../reader/mermaid";
import { type MermaidTheme, renderDiagramSvg } from "./mermaid";

/** Retained per rendered figure, for the theme re-render
 * (kb:adr/reader-diagram-theme-maps-to-builtin-themes) — never an attribute, since a
 * diagram's source can be arbitrarily large. Keyed by the figure so a figure that's later
 * replaced (a fresh `renderDiagrams` pass on a new body) drops its entry for free when
 * garbage collected. */
const sourceByFigure = new WeakMap<Element, string>();

export interface DiagramPassOptions {
  /** A caller-minted value that must be unique to this call, unique per reader instance
   * and per pass — two instances rendering the same fence (the same file open in two
   * tiles), or two passes of one instance (a fresh open racing a still in-flight one, or
   * a later theme re-render), must never mint the same SVG id, since a mermaid diagram's
   * own `<style>` selects by `#id` and CSS id selectors aren't scoped to one subtree.
   * `features/reader.ts` draws a fresh value from its module counter on every pass, never
   * reusing one across calls. */
  instance: number;
  /** Re-checked before every DOM write — false once this pass's open has been
   * superseded, its instance disposed, or a newer pass has started. */
  isCurrent(): boolean;
  theme: MermaidTheme;
}

function findFences(body: HTMLElement): HTMLElement[] {
  return Array.from(body.querySelectorAll("pre > code")).filter(
    (code): code is HTMLElement =>
      code instanceof HTMLElement && isMermaidLanguageClass(code.className),
  );
}

function buildFigure(theme: MermaidTheme, svg: DocumentFragment): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "diagram";
  figure.dataset["mermaidTheme"] = theme;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "diagram-enlarge";
  button.setAttribute("aria-label", "Enlarge diagram");
  button.append(svg);
  figure.append(button);
  return figure;
}

function appendErrorLine(pre: HTMLElement, message: string): void {
  const line = document.createElement("p");
  line.className = "diagram-error";
  line.textContent = message;
  pre.after(line);
}

/**
 * Renders every mermaid fence in `body`, sequentially and in document order — a fence
 * that fails to parse or render keeps its `<pre><code>` and gains the failure line as its
 * next sibling (kb:adr/reader-diagram-failure-keeps-source-with-reason); everything else
 * in the document, including other diagrams, is untouched. A no-op (returns immediately)
 * when `body` has no mermaid fence — "a document without one loads nothing extra" starts
 * here, before `render/mermaid.ts`'s dynamic import is ever reached.
 */
export async function renderDiagrams(body: HTMLElement, opts: DiagramPassOptions): Promise<void> {
  const fences = findFences(body);
  let n = 0;
  for (const code of fences) {
    const pre = code.closest("pre");
    if (!pre) continue;
    const source = code.textContent ?? "";
    const id = diagramId(opts.instance, n);
    n += 1;

    let rendered: { ok: true; fragment: DocumentFragment } | { ok: false; message: string };
    try {
      rendered = { ok: true, fragment: await renderDiagramSvg(id, source, opts.theme) };
    } catch (err) {
      rendered = { ok: false, message: diagramErrorText(err) };
    }

    // A result for a superseded open, a disposed instance, or a pass a newer one has
    // already overtaken must never touch the DOM.
    if (!opts.isCurrent()) return;

    if (rendered.ok) {
      const figure = buildFigure(opts.theme, rendered.fragment);
      sourceByFigure.set(figure, source);
      pre.replaceWith(figure);
    } else {
      appendErrorLine(pre, rendered.message);
    }
  }
}

/**
 * The theme pass (kb:adr/reader-diagram-theme-maps-to-builtin-themes): re-renders every
 * already-rendered `figure.diagram` in `body` from its retained source, in the newly
 * mapped theme — never re-fetching the file. Mints a fresh id per figure from
 * `opts.instance` rather than reusing the figure's existing SVG id: reusing it let a stale
 * clone left behind by the enlarge dialog (same id, same document) steal this render —
 * mermaid resolves `render(id, …)` against whichever element with that id it finds first,
 * not necessarily the live figure's own SVG. A figure whose source isn't retained (none
 * should exist, but a defensive skip beats a crash) or that fails to re-render — the
 * source parsed once already, so a throw here would be a mermaid-internal error rather
 * than a real edge case — is left exactly as it was rather than replaced with an error
 * line. Takes the same `DiagramPassOptions` shape as `renderDiagrams` — both passes are
 * keyed by the same instance/isCurrent/theme triple.
 */
export async function rerenderDiagrams(body: HTMLElement, opts: DiagramPassOptions): Promise<void> {
  const figures = Array.from(body.querySelectorAll<HTMLElement>("figure.diagram"));
  let n = 0;
  for (const figure of figures) {
    const source = sourceByFigure.get(figure);
    const existingSvg = figure.querySelector("svg");
    const id = diagramId(opts.instance, n);
    n += 1;
    if (source === undefined || !existingSvg) continue;

    let fragment: DocumentFragment;
    try {
      fragment = await renderDiagramSvg(id, source, opts.theme);
    } catch {
      continue;
    }

    // A theme pass superseded by a newer one (another theme flip, or the document itself
    // changing under it) must never touch the DOM.
    if (!opts.isCurrent()) return;

    const button = figure.querySelector<HTMLButtonElement>(".diagram-enlarge");
    if (!button) continue;
    button.replaceChildren(fragment);
    figure.dataset["mermaidTheme"] = opts.theme;
  }
}
