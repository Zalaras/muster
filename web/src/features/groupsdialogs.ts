// The rail's two group dialogs, wired: Delete group… (what becomes of its sessions) and the New
// group dialog that names a group made from sessions that already exist. Split out of
// features/groups.ts the way launchgroup.ts is split out of launch.ts. `render/groupdialogs.ts` is
// the DOM half; `features/groups.ts` looks the markup up and hands it in (as `launch.ts` does for
// `launchgroup.ts`), and this module composes the copy (`features/groupscopy.ts`),
// decides what a confirm sends and shows the daemon's answer. Both close on any status change, so a
// stale confirmation cannot be actioned against a dropped connection.
import { createGroup, deleteGroup } from "../api/groups";
import type { ApiResult } from "../api/http";
import type { App } from "../app";
import {
  type DeleteChoiceValue,
  type DeleteGroupElements,
  initDeleteGroupDialog,
  initNewGroupDialog,
  type NewGroupElements,
} from "../render/groupdialogs";
import { groupsInRailOrder, type Section } from "../sessions/sections";
import {
  batchReport,
  DELETE_CHOICES,
  DELETE_CONFIRM_LABEL,
  deleteGroupBody,
  deleteGroupTitle,
  newGroupFromTitle,
} from "./groupscopy";

export interface GroupsDialogsElements {
  newGroup: NewGroupElements;
  deleteGroup: DeleteGroupElements;
}

export interface GroupsDialogsDeps {
  /** A daemon call's one outcome path (shows a refusal, clears the line on success). */
  settle(result: ApiResult<unknown>): boolean;
  /** The one writer of `#action-error` (features/actions.ts). */
  showError(message: string | null): void;
}

export interface GroupsDialogsHandle {
  /** Opens the delete dialog for `section`, a group (not Ungrouped). */
  openDelete(section: Section): void;
  /** Opens the dialog that names a group made from `ids` — the one place a group is named in a
   * dialog, because the sessions already exist. */
  promptNewGroupFrom(ids: readonly number[]): void;
}

export function initGroupsDialogs(
  app: App,
  elements: GroupsDialogsElements,
  deps: GroupsDialogsDeps,
): GroupsDialogsHandle {
  // The group the delete dialog is open for.
  let deleting: Section | null = null;

  function confirmDelete(choice: DeleteChoiceValue, to: number | null): void {
    const section = deleting;
    deleting = null;
    if (!section || section.id === null) return;
    const disposition =
      choice === "move" && to !== null
        ? ({ sessions: "move", to } as const)
        : ({ sessions: choice === "remove" ? "remove" : "ungroup" } as const);
    void deleteGroup(section.id, disposition).then((result) => {
      if (!deps.settle(result)) return;
      if (result.ok) deps.showError(batchReport(result.value.sessions));
    });
  }

  const newGroupDialog = initNewGroupDialog(elements.newGroup);
  const deleteDialog = initDeleteGroupDialog(elements.deleteGroup, { onConfirm: confirmDelete });
  app.on("status", () => {
    deleteDialog.close();
    newGroupDialog.close();
  });

  return {
    openDelete(section) {
      if (section.id === null) return;
      deleting = section;
      deleteDialog.open({
        title: deleteGroupTitle(section.name),
        body: deleteGroupBody(section.cards.length),
        confirmLabel: DELETE_CONFIRM_LABEL,
        labels: DELETE_CHOICES,
        hasMembers: section.cards.length > 0,
        targets: groupsInRailOrder(app.state.groups)
          .filter((g) => g.id !== section.id)
          .map((g) => ({ id: g.id, name: g.name })),
        connected: app.state.connection === "connected",
      });
    },
    promptNewGroupFrom(ids) {
      newGroupDialog.open({
        title: newGroupFromTitle(ids.length),
        submit: async (name) => {
          const result = await createGroup(name, ids);
          if (!result.ok) return result.error.message;
          deps.showError(null);
          return null;
        },
      });
    },
  };
}
