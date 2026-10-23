import type { App } from "../app";
import { createMenu, type MenuEntry } from "../render/menu";
import type { CardMenuRequest } from "../render/sessions";
import { displayTitle, type SessionAction } from "../sessions/card";
import type { Session } from "../protocol/session";
import {
  type CardMenuAction,
  type CardMenuItems,
  cardMenuItems,
  selectionMenuItems,
} from "./railmenuitems";

export interface RailMenuDeps {
  actions: {
    dispatch(action: SessionAction, id: number): void;
    dispatchMany(action: "end" | "remove", ids: readonly number[], origin: "selection"): void;
    inFlight(id: number): boolean;
  };
  groups: {
    selecting(): boolean;
    selectedIds(): ReadonlySet<number>;
    moveToEntries(sessions: readonly Session[], disabled: boolean): MenuEntry[];
  };
}

export interface RailMenuHandle {
  open(request: CardMenuRequest): void;
}

function actionEntries(
  actions: readonly CardMenuAction[],
  run: (action: SessionAction) => void,
): MenuEntry[] {
  return actions.map(
    (item): MenuEntry => ({
      kind: "item",
      label: item.label,
      danger: item.danger,
      disabled: item.disabled,
      onSelect: () => run(item.action),
    }),
  );
}

export function initRailMenu(app: App, deps: RailMenuDeps): RailMenuHandle {
  const menu = createMenu();
  let openFor: readonly number[] = [];

  const connected = (): boolean => app.state.connection === "connected";

  function cardEntries(session: Session, items: CardMenuItems): MenuEntry[] {
    return [
      ...actionEntries(items.actions, (action) => deps.actions.dispatch(action, session.id)),
      { kind: "separator" },
      ...deps.groups.moveToEntries([session], items.moveDisabled),
      { kind: "separator" },
      {
        kind: "item",
        label: items.pin.label,
        disabled: items.pin.disabled,
        onSelect: () => deps.actions.dispatch("pin", session.id),
      },
    ];
  }

  function openCard({ id, card, at }: CardMenuRequest, session: Session): void {
    const items = cardMenuItems(session, {
      connected: connected(),
      busy: deps.actions.inFlight(id),
    });
    openFor = [id];
    menu.open(card, cardEntries(session, items), {
      at,
      label: `Actions for ${displayTitle(session)}`,
    });
  }

  function openSelection({ card, at }: CardMenuRequest, sessions: readonly Session[]): void {
    const ids = sessions.map((s) => s.id);
    const items = selectionMenuItems(sessions, {
      connected: connected(),
      busy: ids.some(deps.actions.inFlight),
    });
    openFor = ids;
    const many = (action: SessionAction): void => {
      if (action === "end" || action === "remove")
        deps.actions.dispatchMany(action, ids, "selection");
    };
    menu.open(
      card,
      [
        ...actionEntries(items.actions, many),
        { kind: "separator" },
        ...deps.groups.moveToEntries(sessions, items.moveDisabled),
      ],
      { at, label: items.label },
    );
  }

  app.on("status", () => menu.close());
  app.on("sessionRemoved", (id) => {
    if (openFor.includes(id)) menu.close();
  });

  return {
    open(request) {
      const sessions = app.store.values();
      const session = sessions.find((s) => s.id === request.id);
      if (!session) return;
      if (deps.groups.selecting() && deps.groups.selectedIds().has(request.id)) {
        openSelection(
          request,
          sessions.filter((s) => deps.groups.selectedIds().has(s.id)),
        );
      } else openCard(request, session);
    },
  };
}
