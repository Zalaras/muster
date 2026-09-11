// `themeChoice`/`claudeFamily`, `<html>` attributes, and the first-paint hint (plan
// code-breakup vocabulary: "theme"; plan new-ui-design-colors). `deps.surfaces` is a real
// value — `surfaces` is constructed before `theme` (main.ts's init order).
import type { App } from "../app";
import { resolveTheme, writeThemeHint } from "../theme";
import type { ClaudeFamily } from "../protocol";

// W6/INV-4: structural, not a sibling import of SurfacesHandle from the surfaces module.
export function initTheme(app: App, deps: { surfaces: { applyTheme(): void } }): void {
  // Plan new-ui-design-colors: both default to the values a fresh daemon reports before
  // any snapshot arrives. Neither is applied to the DOM until the first real message —
  // the `<head>` hint script already painted the last-known theme before any JS ran
  // (REQ-11), and overwriting it with these defaults here would destroy that first paint.
  let themeChoice = "follow";
  let claudeFamily: ClaudeFamily = "unknown";

  /** Applies the resolved theme + Claude family to `<html>`, re-themes every live
   * terminal surface in place, and rewrites the first-paint hint. `resolveTheme` alone is
   * what makes INV-1/INV-2 hold: a known `themeChoice` resolves the same theme regardless
   * of `claudeFamily`, so a family-only change never moves `data-theme` while an override
   * is set, and a `prefs`-only change never touches `data-claude-family`. */
  function applyAttributes(): void {
    const theme = resolveTheme(themeChoice, claudeFamily);
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.dataset["claudeFamily"] = claudeFamily;
    deps.surfaces.applyTheme();
    writeThemeHint({ theme, family: claudeFamily });
  }

  app.on("prefs", (prefs) => {
    // INV-7: `themeChoice` only ever changes here, from the broadcast — never
    // optimistically from the radio's own click handler (settings.ts).
    themeChoice = prefs.theme;
    applyAttributes();
  });

  app.on("snapshot", (snapshot) => {
    claudeFamily = snapshot.claudeTheme.family;
    applyAttributes();
  });

  // kb:anchor/ws.claude-theme/INV-2: never touches `themeChoice` — only `claudeFamily`, so `data-theme` only
  // moves when `themeChoice` is currently "follow".
  app.on("claudeTheme", (family) => {
    claudeFamily = family;
    applyAttributes();
  });
}
