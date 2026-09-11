// Window keydown -> views/focus/tiles (plan code-breakup vocabulary: "shortcuts").
// Matching itself lives in `../shortcuts.ts` (REQ-3) — this only ever dispatches on the
// returned action, never on `event.key`/`event.code` directly (W11). ⌥⌘N (launch modal)
// and ⌘↑ (parent directory) are wired separately in `features/launch.ts`, from the same
// table.
import type { App } from "../app";
import { matchShortcut } from "../shortcuts";

// W6/INV-4: structural deps, not `import type { ActionsHandle }`/`{ FocusHandle }`/
// `{ ViewsHandle }` from their owning sibling modules.
export interface ShortcutsDeps {
  views: { toggle(): void };
  focus: { nth(n: number): void; neediest(): void };
  actions: { isBlockingDialogOpen(): boolean };
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
      default:
        break;
    }
  });
}
