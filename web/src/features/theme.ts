// Owns `themeChoice`/`claudeFamily`, the `<html>` attributes, and the first-paint hint. No
// dependency on any other controller: it only emits `app.emit("themeChanged")`; every
// listener (features/surfaces.ts, features/reader.ts) reacts on its own account, the same
// way every other broadcast in this app works.
import type { App } from "../app";
import { resolveTheme, writeThemeHint, type ThemeName } from "../theme";
import type { ClaudeFamily } from "../protocol/theme";

export function initTheme(app: App): void {
  // Both default to the values a fresh daemon reports before any snapshot arrives. Neither
  // is applied to the DOM until the first real message — the `<head>` hint script already
  // painted the last-known theme before any JS ran, and overwriting it with these defaults
  // here would destroy that first paint.
  let themeChoice = "follow";
  let claudeFamily: ClaudeFamily = "unknown";
  // What `themeChanged` last carried — a reconnect's `snapshot` emits both `prefs` and
  // `snapshot` in the same task (wsapp.ts), and each reaches `applyAttributes` below; only
  // emitting when the resolved theme or family actually moved keeps that pair (and every
  // other same-task double call) down to one `themeChanged` per real change.
  let appliedTheme: ThemeName | null = null;
  let appliedFamily: ClaudeFamily | null = null;

  /** Applies the resolved theme + Claude family to `<html>`, rewrites the first-paint
   * hint, and emits `themeChanged` iff either actually moved. `resolveTheme` alone is
   * what keeps this deterministic: a known `themeChoice` resolves the same theme regardless
   * of `claudeFamily`, so a family-only change never moves `data-theme` while an override
   * is set, and a `prefs`-only change never touches `data-claude-family`. */
  function applyAttributes(): void {
    const theme = resolveTheme(themeChoice, claudeFamily);
    document.documentElement.dataset["theme"] = theme;
    document.documentElement.dataset["claudeFamily"] = claudeFamily;
    writeThemeHint({ theme, family: claudeFamily });
    const changed = theme !== appliedTheme || claudeFamily !== appliedFamily;
    appliedTheme = theme;
    appliedFamily = claudeFamily;
    if (!changed) return;
    // The one signal every live terminal (features/surfaces.ts) and every reader diagram
    // instance (features/reader.ts) reacts to — emitted after the DOM attributes above are
    // written, since both listeners read the theme back off them.
    app.emit("themeChanged");
  }

  app.on("prefs", (prefs) => {
    // `themeChoice` only ever changes here, from the broadcast — never optimistically from
    // the radio's own click handler (settings.ts).
    themeChoice = prefs.theme;
    applyAttributes();
  });

  app.on("snapshot", (snapshot) => {
    claudeFamily = snapshot.claudeTheme.family;
    applyAttributes();
  });

  // kb:anchor/ws.claude-theme: `claudeTheme` never touches `themeChoice` — only
  // `claudeFamily`, so `data-theme` only moves when `themeChoice` is currently "follow".
  app.on("claudeTheme", (family) => {
    claudeFamily = family;
    applyAttributes();
  });
}
