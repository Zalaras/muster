import type { App } from "../app";
import { createMenu, type MenuEntry } from "../render/menu";
import type { CardMenuRequest } from "../render/sessions";
import { displayTitle, type SessionAction } from "../sessions/card";
import type { Session } from "../protocol/session";
import { type CardMenuItems, cardMenuItems } from "./railmenuitems";

export interface RailMenuDeps {
  actions: {
    dispatch(action: SessionAction, id: number): void;
    inFlight(id: number): boolean;
  };
  groups: {
    moveToEntries(session: Session, disabled: boolean): MenuEntry[];
  };
}

export interface RailMenuHandle {
  open(request: CardMenuRequest): void;
}

export function initRailMenu(app: App, deps: RailMenuDeps): RailMenuHandle {
  const menu = createMenu();
  let openFor: number | null = null;

  function entriesFor(session: Session, items: CardMenuItems): MenuEntry[] {
    const act = (action: SessionAction) => (): void => deps.actions.dispatch(action, session.id);
    return [
      ...items.actions.map(
        (item): MenuEntry => ({
          kind: "item",
          label: item.label,
          danger: item.danger,
          disabled: item.disabled,
          onSelect: act(item.action),
        }),
      ),
      { kind: "separator" },
      ...deps.groups.moveToEntries(session, items.moveDisabled),
      { kind: "separator" },
      {
        kind: "item",
        label: items.pin.label,
        disabled: items.pin.disabled,
        onSelect: act("pin"),
      },
    ];
  }

  app.on("status", () => menu.close());
  app.on("sessionRemoved", (id) => {
    if (openFor === id) menu.close();
  });

  return {
    open({ id, card, at }) {
      const session = app.store.values().find((s) => s.id === id);
      if (!session) return;
      const items = cardMenuItems(session, {
        connected: app.state.connection === "connected",
        busy: deps.actions.inFlight(id),
      });
      openFor = id;
      menu.open(card, entriesFor(session, items), {
        at,
        label: `Actions for ${displayTitle(session)}`,
      });
    },
  };
}
