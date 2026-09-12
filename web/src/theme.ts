// REQ-7 (plan new-ui-design-colors): the web theme registry. The daemon treats
// `prefs.theme` as opaque (kb:anchor/prefs.put) — the client owns the list of known
// theme names, so adding a theme never needs a daemon release, only a new
// `[data-theme]` block in style.css plus a new entry in THEMES below.
import type { ClaudeFamily } from "./protocol";

export const THEMES = ["instrument", "dark", "light"] as const;
export type ThemeName = (typeof THEMES)[number];
export type ThemeChoice = "follow" | ThemeName;
export type { ClaudeFamily };

function isThemeName(value: string): value is ThemeName {
  return (THEMES as readonly string[]).includes(value);
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

function isClaudeFamily(value: unknown): value is ClaudeFamily {
  return value === "light" || value === "dark" || value === "unknown";
}

/** REQ-11: reads the hint the last `writeThemeHint` call wrote. `null` for anything not
 * a recognisable hint — absent, malformed JSON, an unknown theme name, or storage that
 * throws (private mode, disabled storage) — so a caller never half-applies one. */
export function readThemeHint(storage: Pick<Storage, "getItem"> = localStorage): ThemeHint | null {
  let raw: string | null;
  try {
    raw = storage.getItem(HINT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const theme = record["theme"];
  const family = record["family"];
  if (typeof theme !== "string" || !isThemeName(theme)) return null;
  if (!isClaudeFamily(family)) return null;
  return { theme, family };
}

/** REQ-11/REQ-12: `features/theme.ts` rewrites this every time it applies a theme or family.
 * Swallows a throwing storage — the hint is a best-effort first-paint optimisation,
 * never a hard dependency of the render path that calls this. */
export function writeThemeHint(
  hint: ThemeHint,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(HINT_KEY, JSON.stringify(hint));
  } catch {
    // best-effort only — see doc comment above.
  }
}
