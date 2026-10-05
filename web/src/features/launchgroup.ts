// The launch dialog's Group row (kb:spec/launch): a select of No group, every group and New
// group…, and — only while New group… is chosen — a name field beside it. Split out of
// features/launch.ts the way launchresume.ts is. It owns the row's two controls and nothing else:
// `features/launch.ts` decides when to reset it, hands it the groups it should offer, and puts what
// `request()` returns into the launch body.
//
// The select is the state: its chosen value is read from the control, never mirrored, and its
// options are rebuilt only when the offered set changes, so a user mid-typeahead keeps the node
// and the choice across a `groups` message that changes nothing about them.
import type { LaunchGroup } from "../api/launch";
import type { Group } from "../protocol/groups";
import type { Session } from "../protocol/session";
import { renderGroupOptions } from "../render/launch";
import {
  defaultGroupValue,
  groupChoice,
  groupOptions,
  groupOptionsKey,
  keepGroupValue,
  NEW_GROUP_VALUE,
} from "./launchgroupchoice";

export interface LaunchGroupElements {
  select: HTMLSelectElement;
  nameInput: HTMLInputElement;
  /** The row's wrapper (`#launch-group`): its label and its controls move together. */
  field: HTMLElement;
  /** The Title input the row follows on the New tab. */
  titleInput: HTMLElement;
  /** Where the row sits on the Resume tab, whose `.fields` (Title included) is hidden. */
  resumeSlot: HTMLElement;
}

export interface LaunchGroupHandle {
  /** The dialog just opened: the focused session's group (else No group), an empty name. */
  reset(focused: Session | null, groups: readonly Group[]): void;
  /** The groups changed under an open dialog: re-offer them, keeping the choice if it survives. */
  sync(groups: readonly Group[]): void;
  /** The row follows the tab: under Title on New, under the past-sessions list on Resume. */
  place(tab: "new" | "resume"): void;
  /** The launch body's group fields, or the message to show when `New group…` has no name. */
  request(): { ok: true; group: LaunchGroup } | { ok: false; message: string };
}

export function initLaunchGroup(elements: LaunchGroupElements): LaunchGroupHandle {
  let optionsKey = "";

  function showNameIfNew(): void {
    elements.nameInput.hidden = elements.select.value !== NEW_GROUP_VALUE;
  }

  /** Rebuilds the select for `groups` holding `value`. */
  function offer(groups: readonly Group[], value: string): void {
    const options = groupOptions(groups);
    optionsKey = groupOptionsKey(options);
    renderGroupOptions(elements.select, options, value);
    showNameIfNew();
  }

  elements.select.addEventListener("change", showNameIfNew);

  return {
    reset(focused, groups) {
      elements.nameInput.value = "";
      offer(groups, defaultGroupValue(focused, groups));
    },
    sync(groups) {
      const options = groupOptions(groups);
      // Nothing about the offered options changed: leave the control, its focus and its choice be.
      if (groupOptionsKey(options) === optionsKey) return;
      offer(groups, keepGroupValue(elements.select.value, options));
    },
    place(tab) {
      if (tab === "resume") {
        if (elements.field.parentElement !== elements.resumeSlot)
          elements.resumeSlot.append(elements.field);
      } else if (elements.field.parentElement === elements.resumeSlot) {
        elements.titleInput.after(elements.field);
      }
    },
    request: () => groupChoice(elements.select.value, elements.nameInput.value),
  };
}
