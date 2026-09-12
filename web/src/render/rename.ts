// Shared inline rename editor (plan ui-text-and-focus REQ-13-16) — the Focus mainhead's
// heading and every Tiles tile header attach one of these to their own container. DOM
// and key handling only, modelled on features/settings.ts's controller shape (elements/
// handlers in, a small controller out); `titleCommand` (sessions/rename.ts) decides what
// a commit actually sends, `features/rename.ts` turns the result into a `putTitle` call —
// this module never touches the network.
//
// `container` must already hold, as its only child, the `<button type="button"
// class="rename">` the caller built (mainhead.ts's static markup; tiles.ts's `buildTile`
// for `.nm`) — this module swaps that exact button node out for an `input.name-edit` and
// back, never rebuilding either, so the button's own click listener (wired once, below)
// survives every open/close cycle.
import type { Session } from "../protocol";
import { titleCommand, type TitleCommand } from "../sessions/rename";

export interface RenameEditorHandlers {
  /** Read fresh at every `open()`/commit — never cached, so a session that changed
   * underneath (a broadcast, a demotion) is always the one the edit acts on. `null`
   * means there is currently nothing to rename (the editor silently declines to open). */
  getSession: () => Session | null;
  /** Fires once, only for a `"set"`/`"clear"` outcome — a `"noop"` never reaches here. */
  onCommit: (id: number, command: TitleCommand) => void;
}

export interface RenameEditorController {
  /** Opens the editor (button -> input) unless already open, or `getSession()` is null. */
  open: () => void;
  /** Closes the editor with no request, if open. Safe to call when not editing. */
  cancel: () => void;
  isEditing: () => boolean;
  /** Mirrors the mainhead's End/Resume/Remove siblings: the trigger is disabled while
   * the WS is down. Safe to call whether or not the button is currently mounted. */
  setEnabled: (enabled: boolean) => void;
  /** Detaches the button's click listener — call once, before the container itself is
   * discarded (a tile leaving the grid). `cancel()` first if an edit may be open. */
  dispose: () => void;
}

export function attachRenameEditor(
  container: HTMLElement,
  handlers: RenameEditorHandlers,
): RenameEditorController {
  // Re-typed to a definite `HTMLButtonElement` (not narrowed from the nullable
  // querySelector result) — a `const` narrowed only by an `if` guard does NOT stay
  // narrowed inside the nested closures below (TS doesn't carry control-flow narrowing
  // into callbacks), so `closeEditor`/`finish` would otherwise still see `| null`.
  const maybeButton = container.querySelector<HTMLButtonElement>("button.rename");
  if (!maybeButton) throw new Error("attachRenameEditor: container has no button.rename child");
  const button: HTMLButtonElement = maybeButton;

  let input: HTMLInputElement | null = null;
  // Edge case 11: Enter commits, removes the input, and the removal's own blur must not
  // commit a second time. Set the instant either Enter or blur starts closing the edit.
  let settled = true;

  function thead(): HTMLElement | null {
    return container.closest<HTMLElement>(".thead");
  }

  function closeEditor(): void {
    if (!input) return;
    input.removeEventListener("keydown", onKeydown);
    input.removeEventListener("blur", onBlur);
    container.replaceChildren(button);
    delete container.dataset["editing"];
    const head = thead();
    if (head) head.setAttribute("draggable", "true");
    input = null;
  }

  function finish(action: "commit" | "cancel"): void {
    if (settled) return;
    settled = true;
    if (action === "commit" && input) {
      const session = handlers.getSession();
      if (session) {
        const command = titleCommand(input.value, session);
        if (command.kind !== "noop") handlers.onCommit(session.id, command);
      }
    }
    closeEditor();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      finish("commit");
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish("cancel");
    }
  }

  function onBlur(): void {
    finish("commit");
  }

  function open(): void {
    if (input) return; // already editing
    const session = handlers.getSession();
    if (!session) return;
    settled = false;

    const field = document.createElement("input");
    field.type = "text";
    field.className = "name-edit";
    field.setAttribute("aria-label", "Session title");
    field.maxLength = 100;
    field.value = session.title ?? "";

    input = field;
    container.replaceChildren(field);
    container.dataset["editing"] = "true";
    const head = thead();
    if (head) head.setAttribute("draggable", "false");

    field.addEventListener("keydown", onKeydown);
    field.addEventListener("blur", onBlur);
    field.focus();
    field.select();
  }

  function onButtonClick(): void {
    open();
  }
  button.addEventListener("click", onButtonClick);

  return {
    open,
    cancel: () => finish("cancel"),
    isEditing: () => input !== null,
    setEnabled: (enabled: boolean) => {
      button.disabled = !enabled;
    },
    dispose: () => {
      button.removeEventListener("click", onButtonClick);
    },
  };
}
