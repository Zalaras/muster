// Pure keyboard-shortcut matching (plan shortcut-fixes REQ-3/REQ-4). The whole bound
// chord table lives here — features/shortcuts.ts and features/launch.ts dispatch from `matchShortcut`
// rather than matching keys themselves, so the binding set can't drift apart across
// files again. `event.code` is physical-key based: immune to macOS's ⌥ dead-key
// transform (⌥N delivers `key: "˜"`, ⌥1 delivers `key: "¡"`) and to keyboard layout,
// unlike `event.key` (edge case 1, W16).

export type ShortcutAction =
  | { readonly type: "new-session" }
  | { readonly type: "toggle-view" }
  | { readonly type: "launch-parent-dir" }
  | { readonly type: "focus-neediest" }
  | { readonly type: "focus-nth"; readonly n: number };

interface Binding {
  readonly code: string;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly action: ShortcutAction;
}

const DIGIT_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
] as const;

// The Binding Table (plan shortcut-fixes). Digits match the main row only (`DigitN`) —
// `NumpadN` is deliberately unbound (edge case 11), and every chord requires an exact
// modifier signature (INV-2): a held ⌃ or ⇧ alongside a bound chord does not match.
const BINDINGS: readonly Binding[] = [
  { code: "KeyN", metaKey: true, altKey: true, shiftKey: false, ctrlKey: false, action: { type: "new-session" } },
  { code: "Backslash", metaKey: true, altKey: false, shiftKey: false, ctrlKey: false, action: { type: "toggle-view" } },
  {
    code: "ArrowUp",
    metaKey: true,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "launch-parent-dir" },
  },
  {
    code: "Digit0",
    metaKey: true,
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    action: { type: "focus-neediest" },
  },
  ...DIGIT_CODES.map(
    (code, index): Binding => ({
      code,
      metaKey: true,
      altKey: true,
      shiftKey: false,
      ctrlKey: false,
      action: { type: "focus-nth", n: index + 1 },
    }),
  ),
];

/** Maps a keydown to its bound action, or `null` if the event doesn't match any bound
 * chord exactly — all four modifier booleans (`metaKey`/`altKey`/`shiftKey`/`ctrlKey`)
 * must equal the binding's (INV-2), so an extra held modifier never triggers a
 * neighbouring action. Matches on `event.code`, never `event.key`. */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  for (const binding of BINDINGS) {
    if (
      event.code === binding.code &&
      event.metaKey === binding.metaKey &&
      event.altKey === binding.altKey &&
      event.shiftKey === binding.shiftKey &&
      event.ctrlKey === binding.ctrlKey
    ) {
      return binding.action;
    }
  }
  return null;
}

/** REQ-12: the binding table as label+chord data, for a future shortcuts-help overlay —
 * none is built here, the keyboard model itself is out of scope (ux-flows §4). */
export const SHORTCUT_HELP: ReadonlyArray<{ readonly label: string; readonly chord: string }> = [
  { label: "New session", chord: "⌥⌘N" },
  { label: "Focus / promote session n", chord: "⌥⌘1–9" },
  { label: "Jump to neediest session", chord: "⌥⌘0" },
  { label: "Toggle Focus / Tiles", chord: "⌘\\" },
  { label: "Launch dialog: parent directory", chord: "⌘↑" },
];
