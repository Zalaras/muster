// REQ-7 (plan new-ui-design-colors): the web theme registry. The daemon treats
// `prefs.theme` as opaque (kb:anchor/prefs.put) — the client owns the list of known
// theme names, so adding a theme never needs a daemon release, only a new
// `[data-theme]` block in style.css plus a new entry in THEMES below.
import type { ClaudeFamily } from "./protocol/theme";
import { writeJson } from "./storage";

export const THEMES = ["instrument", "dark", "light"] as const;
export type ThemeName = (typeof THEMES)[number];
export type ThemeChoice = "follow" | ThemeName;

function isThemeName(value: string): value is ThemeName {
  return (THEMES as readonly string[]).includes(value);
}

/** REQ-9's Settings-radio guard: every registry name, plus `"follow"`. Derived from THEMES
 * so a new theme stays "a `[data-theme]` block plus a THEMES entry" — a hand-listed copy
 * silently leaves the new radio dead, since the daemon stores the value opaquely
 * (kb:adr/theme-pref-enum-follow-not-nullable) and this is the only validation there is
 * (`plans/new-ui-design-colors/review.md` cycle 1, Minor 1). `"follow"` stays a literal:
 * it is a choice, not a registry member. */
export function isThemeChoice(value: string): value is ThemeChoice {
  return value === "follow" || isThemeName(value);
}

/** REQ-7's resolver: a known theme name wins outright; `"follow"` or any unrecognised
 * string (a renamed/removed theme, edge case 6) resolves by Claude's family —
 * `"light"` -> `"light"`, `"dark"`/`"unknown"` -> `"instrument"`. Pure; INV-1 covers
 * every pref x family cell in Vitest. */
export function resolveTheme(choice: string, family: ClaudeFamily): ThemeName {
  if (isThemeName(choice)) return choice;
  return family === "light" ? "light" : "instrument";
}

const HINT_KEY = "muster.theme-hint";

/** REQ-11's first-paint hint shape, mirrored (deliberately duplicated, not imported —
 * the head script in index.html is plain inline JS, not a module) by the try/catch read
 * at the top of `<head>`. */
export interface ThemeHint {
  theme: ThemeName;
  family: ClaudeFamily;
}

/** REQ-11/REQ-12: `features/theme.ts` rewrites this every time it applies a theme or family.
 * Read back only by the plain inline script in `index.html`/`doc.html` (deliberately
 * duplicated there, not imported — see its own comment), never by this module. */
export function writeThemeHint(
  hint: ThemeHint,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  writeJson(storage, HINT_KEY, hint);
}
