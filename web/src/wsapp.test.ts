import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { parseMessage } from "./protocol/messages";
import { WsClient, type WsClientHandlers } from "./ws";
import {
  coreWsHandlers,
  dashboardWsHandlers,
  popoutWsHandlers,
  type WsAppConnection,
} from "./wsapp";

// The groups half of the WS-to-App mapping (plan groups, kb:anchor/ws.groups): a `groups` message and
// a snapshot both reach the bus whole, so every window redraws from the daemon's list and never
// from a click (kb:adr/rail-groups-daemon-rows-whole-list-broadcast).
const connection: WsAppConnection = { connected: () => {}, disconnected: () => {} };

const snapshotFrame = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: { view: "focus", density: "2x2" },
};
const wireGroups = [
  { id: 3, name: "PR reviews", pos: 0, collapsed: false },
  { id: 5, name: "Hotfix", pos: 2, collapsed: true },
];

function wire() {
  const app = createApp();
  const events: string[] = [];
  const groupsSeen: Array<{ groups: unknown; ungrouped: unknown }> = [];
  app.on("groups", (groups, ungrouped) => {
    events.push("groups");
    groupsSeen.push({ groups, ungrouped });
  });
  app.on("prefs", () => events.push("prefs"));
  app.on("snapshot", () => events.push("snapshot"));
  const render = vi.fn();
  app.onRender(render);
  // dispatch goes through the real parser, so the wire shape is what is under test.
  const client = new WsClient("ws://x", coreWsHandlers(app, connection));
  const receive = (frame: unknown) => client.dispatch(parseMessage(frame));
  return { app, events, groupsSeen, render, receive };
}

describe("coreWsHandlers — groups", () => {
  it("a groups message emits the whole list and Ungrouped's layout, then renders once", () => {
    const { events, groupsSeen, render, receive } = wire();
    receive({ type: "groups", groups: wireGroups, ungrouped: { pos: 1, collapsed: true } });
    expect(events).toEqual(["groups"]);
    expect(groupsSeen).toEqual([{ groups: wireGroups, ungrouped: { pos: 1, collapsed: true } }]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("a groups message touches no session: membership arrives on each session's own upsert", () => {
    const { app, receive } = wire();
    receive({ type: "groups", groups: wireGroups, ungrouped: { pos: 1, collapsed: false } });
    expect(app.store.values()).toEqual([]);
  });

  it("an empty groups message is delivered as the empty list, so a deleted last group clears the rail's headers", () => {
    const { groupsSeen, receive } = wire();
    receive({ type: "groups", groups: wireGroups, ungrouped: { pos: 1, collapsed: false } });
    receive({ type: "groups", groups: [], ungrouped: { pos: 0, collapsed: false } });
    expect(groupsSeen.at(-1)).toEqual({ groups: [], ungrouped: { pos: 0, collapsed: false } });
  });

  it("a malformed groups message is dropped: nothing emitted, nothing rendered", () => {
    const { events, render, receive } = wire();
    receive({ type: "groups", groups: [{ id: "3" }], ungrouped: { pos: 1, collapsed: false } });
    receive({ type: "groups", groups: [] });
    expect(events).toEqual([]);
    expect(render).not.toHaveBeenCalled();
  });

  it("a snapshot emits the groups after prefs and before the snapshot event, then renders once", () => {
    const { events, groupsSeen, render, receive } = wire();
    receive({ ...snapshotFrame, groups: wireGroups, ungrouped: { pos: 1, collapsed: true } });
    expect(events).toEqual(["prefs", "groups", "snapshot"]);
    expect(groupsSeen).toEqual([{ groups: wireGroups, ungrouped: { pos: 1, collapsed: true } }]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("a snapshot from an older daemon (neither key) emits no groups and Ungrouped last and expanded", () => {
    const { groupsSeen, receive } = wire();
    receive(snapshotFrame);
    expect(groupsSeen).toEqual([{ groups: [], ungrouped: { pos: 0, collapsed: false } }]);
  });

  it("a reconnect's snapshot replaces the list rather than merging with what was held", () => {
    const { groupsSeen, receive } = wire();
    receive({ ...snapshotFrame, groups: wireGroups, ungrouped: { pos: 1, collapsed: false } });
    receive({ ...snapshotFrame, groups: [wireGroups[0]], ungrouped: { pos: 1, collapsed: false } });
    expect(groupsSeen.at(-1)?.groups).toEqual([wireGroups[0]]);
  });
});

// The update-restart signals are relayed by the pop-out's set as well as the dashboard's, so
// an open pop-out reloads onto the new version (kb:adr/update-restart-reloads-dashboard).
describe("update relays — popoutWsHandlers and dashboardWsHandlers share them", () => {
  const updateInfo = { available: true } as never;
  const sets: Array<[string, (app: ReturnType<typeof createApp>) => WsClientHandlers]> = [
    ["popout", (app) => popoutWsHandlers(app, connection)],
    [
      "dashboard",
      (app) =>
        dashboardWsHandlers(
          app,
          { ...connection, showProtocolMismatch: () => {}, claudeCodeChanged: () => {} },
          { handleRemoved: () => {} },
        ),
    ],
  ];

  it.each(sets)(
    "%s: onUpdate emits update with the bare object, then renders once",
    (_n, build) => {
      const app = createApp();
      const seen = vi.fn();
      const render = vi.fn();
      app.on("update", seen);
      app.onRender(render);
      build(app).onUpdate?.(updateInfo);
      expect(seen).toHaveBeenCalledWith(updateInfo);
      expect(render).toHaveBeenCalledTimes(1);
    },
  );

  it.each(sets)("%s: onHelloArrived emits helloArrived and does not render", (_n, build) => {
    const app = createApp();
    const seen = vi.fn();
    const render = vi.fn();
    app.on("helloArrived", seen);
    app.onRender(render);
    build(app).onHelloArrived?.();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it("the pop-out set carries no dashboard-only handler", () => {
    const h = popoutWsHandlers(createApp(), connection);
    expect(h.onSessionRemoved).toBeUndefined();
    expect(h.onUsage).toBeUndefined();
    expect(h.onProtocolMismatch).toBeUndefined();
  });
});
