// The only module that names mermaid (kb:adr/reader-diagrams-mermaid-12-bundled-lazily).
// DOM-only, like
// `reader/markdown.ts` (needs a real `window`, not Vitest-importable —
// `web/src/reader/CLAUDE.md`). Owns the dynamic import, mermaid's own
// configuration and the DOMPurify pass the SVG crosses before it can ever
// reach `article.md` (kb:adr/reader-diagram-svg-crosses-dompurify) — the sanitizer
// boundary stays in the one place `reader-markdown-rendered-in-browser` established.
import DOMPurify from "dompurify";

export type MermaidTheme = "dark" | "default";

type MermaidModule = typeof import("mermaid")["default"];

// Memoised across the whole page — the chunk is requested once, on the first
// fence any rendered document contains, never per-instance or per-pass.
let enginePromise: Promise<MermaidModule> | null = null;
let lastTheme: MermaidTheme | null = null;
let lastFontFamily: string | null = null;

/** The dynamic import — the one line under `web/src` that names the package (the
 * only-dynamic-import guard excludes it: it isn't a static `import … from "mermaid"`). */
function loadEngine(): Promise<MermaidModule> {
  enginePromise ??= import("mermaid").then((mod) => mod.default);
  return enginePromise;
}

/** mermaid's `fontFamily` is the dashboard's own `--sans` stack
 * (kb:adr/reader-diagram-theme-maps-to-builtin-themes), read fresh each
 * call (cheap) rather than cached — the token itself never changes at runtime, but
 * nothing here needs to assume that. */
function readSansStack(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
}

/** `initialize` is idempotent but re-running it on every render
 * would still re-parse mermaid's whole config; skipped when neither varying value
 * (`theme`, `fontFamily`) has actually changed since the last call. */
function ensureInitialized(mermaid: MermaidModule, theme: MermaidTheme): void {
  const fontFamily = readSansStack();
  if (theme === lastTheme && fontFamily === lastFontFamily) return;
  lastTheme = theme;
  lastFontFamily = fontFamily;
  // Strict security level, HTML labels off (root and the deprecated
  // per-diagram flowchart flag alike, per the installed 12.0.0 config type — the root
  // setting takes precedence but flowchart's own is set too for clarity), mermaid's own
  // error SVG suppressed since a parse failure is always caught before render
  // (kb:adr/reader-diagram-svg-crosses-dompurify).
  // `layout` is deliberately never set — ELK is 12's default and a diagram's own
  // frontmatter may still ask for it or override it
  // (kb:adr/reader-diagrams-mermaid-12-bundled-lazily).
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    suppressErrorRendering: true,
    theme,
    fontFamily,
  });
}

/**
 * Parses, then renders, one fence's mermaid source into a sanitized fragment.
 *
 * Parsing first means a syntax error throws here — with mermaid's own message — before
 * `render` could ever produce mermaid's red error SVG (kb:adr/reader-diagram-svg-crosses-dompurify);
 * `render`'s own
 * `bindFunctions` is read from nowhere and therefore never invoked. The SVG string
 * crosses DOMPurify with the `html`+`svg`+`svgFilters` profiles before it becomes a
 * fragment — measured against the installed 12.0.0 output: the
 * default profile already keeps the `<style>` element and `#id`-scoped rules mermaid's
 * theme depends on (a flowchart node's `fill` came back non-default, `rgb(31, 32, 32)`,
 * with no `ADD_TAGS` needed), so none is added here.
 */
export async function renderDiagramSvg(
  id: string,
  source: string,
  theme: MermaidTheme,
): Promise<DocumentFragment> {
  const mermaid = await loadEngine();
  ensureInitialized(mermaid, theme);
  await mermaid.parse(source);
  const { svg } = await mermaid.render(id, source);
  const fragment = DOMPurify.sanitize(svg, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  });
  // mermaid emits its own `width="100%"` attribute plus an inline
  // `style="max-width: <intrinsic>px"` — a responsive-image sizing pair meant to shrink a
  // wide diagram to fit its container. Removing both isn't enough: measured live, an
  // inline `<svg>` with no width/height at all doesn't fall back to its `viewBox`'s own
  // pixel size in Chromium — the CSS replaced-element default-sizing algorithm instead
  // stretches it to fill the containing block's width (a 7656×61 viewBox rendered at
  // 796×6px, not 7656×61), so a wide diagram never overflowed `figure.diagram` at all
  // (measured: `figure.scrollWidth === figure.clientWidth` — the regression covered by
  // web/e2e/reader-mermaid.spec.ts's wide-diagram scrolling test). Setting `width`/`height` explicitly, in px, from the `viewBox` is what makes
  // the SVG render at its natural size — one user unit per CSS pixel — so
  // `overflow-x: auto` on `figure.diagram` has something to scroll, exactly like `.md
  // pre` scrolls a wide code block.
  const svgEl = fragment.querySelector("svg");
  if (svgEl) {
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.style.removeProperty("max-width");
    const box = svgEl.viewBox.baseVal;
    if (box && box.width > 0 && box.height > 0) {
      svgEl.style.width = `${box.width}px`;
      svgEl.style.height = `${box.height}px`;
    }
  }
  return fragment;
}
