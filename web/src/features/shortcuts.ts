// Window keydown -> views/focus/tiles/launch (plan code-breakup vocabulary: "shortcuts").
// Matching itself lives in `../shortcuts.ts` (REQ-3) — this only ever dispatches on the
// returned action, never on `event.key`/`event.code` directly (W11). Review Minor 7: the
// one `window` keydown listener for every bound chord — ⌥⌘N (launch modal) and ⌘↑ (parent
// directory) used to be dispatched by a second listener inside `features/launch.ts`
// itself; both now reach `deps.launch` through this module instead.
import type { App } from "../app";
import { matchShortcut } from "../shortcuts";

// W6/INV-4: structural deps, not `import type { ActionsHandle }`/`{ FocusHandle }`/
// `{ ViewsHandle }`/`{ LaunchHandle }` from their owning sibling modules.
export interface ShortcutsDeps {
  views: { toggle(): void };
  focus: { nth(n: number): void; neediest(): void };
  actions: { isBlockingDialogOpen(): boolean };
  launch: { open(): void; isOpen(): boolean; navigateToParentDir(): void };
}

export function initShortcuts(_app: App, deps: ShortcutsDeps): void {
  window.addEventListener("keydown", (event) => {
    const action = matchShortcut(event);
    if (action === null) return;
    switch (action.type) {
      case "toggle-view":
        event.preventDefault();
        deps.views.toggle();
        break;
      case "focus-nth":
        event.preventDefault();
        if (!deps.actions.isBlockingDialogOpen()) deps.focus.nth(action.n);
        break;
      case "focus-neediest":
        event.preventDefault();
        if (!deps.actions.isBlockingDialogOpen()) deps.focus.neediest();
        break;
      case "new-session":
        // preventDefault unconditionally, even with the dialog already open (REQ-8;
        // review m1-sessions cycle-3 minor: preventDefault must precede the open-guard).
        // REQ-2: the browser's own bare ⌘N is left alone — this only ever fires for ⌥⌘N.
        event.preventDefault();
        deps.launch.open();
        break;
      case "launch-parent-dir":
        // REQ-6: ⌘↑ navigates to the parent of the listed directory. Dialog-scoped, not
        // listing-scoped (edge case 11 — it still fires with focus in the Title input) —
        // unlike every other case here, a closed dialog means no `preventDefault` either.
        if (!deps.launch.isOpen()) break;
        event.preventDefault();
        deps.launch.navigateToParentDir();
        break;
      default:
        break;
    }
  });
}
