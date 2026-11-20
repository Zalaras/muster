// The terminals-list revision contract (kb:adr/surfaces-terminal-ended-read-from-lists,
// kb:adr/surfaces-terminals-list-revision, kb:anchor/ws.shell-activity, kb:anchor/ws.snapshot, kb:anchor/sessions.shell § Revisions),
// driven the way the dashboard is wired: `terminals` and `snapshot` arrive as raw `/ws` JSON
// through WsClient and dashboardWsHandlers into an app with initSurfaces, and the four terminal
// routes' replies arrive as HTTP bodies through a stubbed `fetch` into the real ../api/sessions.
// Nothing here names an internal signature, only the wire.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { makeSnapshot } from "../protocol/testfixtures";
import { makeSession } from "../sessions/testfixtures";
import { getSurfaceState } from "../terminal/surfaceswitch";
import { type SocketLike, WsClient } from "../ws";
import { dashboardWsHandlers } from "../wsapp";
import { initSurfaces } from "./surfaces";

class FakeSocket implements SocketLike {
  message: ((event: MessageEvent) => void) | null = null;
  addEventListener(type: string, listener: unknown): void {
    if (type === "message") this.message = listener as (event: MessageEvent) => void;
  }
  close(): void {}
}

const noDeadRefs = () => null;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const info = (n: number, name = `shell ${n}`, busy = false) => ({
  n,
  name,
  busy,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The next fetch stays pending until the returned function answers it with `body`. */
function pendingReply(): (body: unknown, status?: number) => Promise<void> {
  let answer!: (res: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
  return async (body, status = 200) => {
    answer({
      ok: status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response);
    await flush();
  };
}

function wire() {
  const app = createApp();
  const handle = initSurfaces(app, { tilesLive: () => [] });
  const socket = new FakeSocket();
  const connection = {
    connected: vi.fn(),
    disconnected: vi.fn(),
    showProtocolMismatch: vi.fn(),
    claudeCodeChanged: vi.fn(),
  };
  const handlers = dashboardWsHandlers(app, connection, {
    handleRemoved: vi.fn(),
  });
  new WsClient("ws://x", handlers, () => socket).start();
  const send = (message: unknown) =>
    socket.message?.({ data: JSON.stringify(message) } as MessageEvent);
  return {
    handle,
    snapshot(terminalsRev: number | undefined, terminals: Record<number, unknown[]>) {
      send({
        ...makeSnapshot({
          sessions: [makeSession({ id: 1 }), makeSession({ id: 2 })],
          terminals: terminals as never,
        }),
        update: undefined, // an absent key on the wire, as a daemon with no update info sends it
        terminalsRev,
      });
    },
    terminals(sessionId: number, rev: number, list: unknown[]) {
      send({ type: "terminals", sessionId, rev, terminals: list });
    },
  };
}

describe("a terminals list older than a reply already acted on", () => {
  it("a terminals list sent before newTerminal's spawn, arriving after its reply, keeps the new terminal shown", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    const reply = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    await reply({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev: 8 });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 2,
    });

    w.terminals(1, 7, [info(1)]);
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 2,
    });

    w.terminals(1, 8, [info(1), info(2)]);
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 2,
    });
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2]);
  });

  it("a stale [] arriving after select('shell')'s reply keeps shell selected", async () => {
    const w = wire();
    w.snapshot(5, {});
    const reply = pendingReply();
    w.handle.select(1, "shell", noDeadRefs);
    await reply({ target: "muster-1-shell", n: 1, created: true, rev: 6 });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 1,
    });

    w.terminals(1, 5, []);
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 1,
    });

    w.terminals(1, 6, [info(1)]);
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 1,
    });
  });

  it("a terminals list sent before a close, arriving after its reply, is ignored", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1), info(2)] });
    const reply = pendingReply();
    w.handle.closeTerminal(1, 2);
    await reply({ rev: 8 });

    w.terminals(1, 7, [info(1, "shell 1", true), info(2, "shell 2", true)]);
    expect(w.handle.terminals(1)).toEqual([info(1), info(2)]);

    w.terminals(1, 8, [info(1)]);
    expect(w.handle.terminals(1)).toEqual([info(1)]);
  });

  it("a terminals list sent before a rename, arriving after its reply, is ignored", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    const reply = pendingReply();
    w.handle.renameTerminal(1, 1, "build");
    await reply({ n: 1, name: "build", rev: 8 });

    w.terminals(1, 7, [info(1, "shell 1", true)]);
    expect(w.handle.terminals(1)).toEqual([info(1)]);

    w.terminals(1, 8, [info(1, "build")]);
    expect(w.handle.terminals(1)).toEqual([info(1, "build")]);
  });

  it("a reply dropped by a newer selection still raises the seen rev", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1), info(2)] });
    const reply = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    w.handle.select(1, "docs", noDeadRefs);
    await reply({ target: "muster-1-shell-3", n: 3, name: "shell 3", rev: 9 });
    expect(getSurfaceState(w.handle.state(), 1).selected).toBe("docs");

    w.terminals(1, 8, [info(1)]);
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2]);

    w.terminals(1, 9, [info(1), info(2), info(3)]);
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2, 3]);
  });
});

describe("the seen revision per session", () => {
  it("a terminals message at the seen rev applies, one below it does not", () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    w.terminals(1, 5, [info(1), info(2)]);
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2]);

    w.terminals(1, 4, [info(1)]);
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2]);
  });

  it("a snapshot resets every session's seen rev to terminalsRev", () => {
    const w = wire();
    w.snapshot(1, {});
    w.terminals(1, 20, [info(1)]);
    w.terminals(2, 20, [info(1)]);

    w.snapshot(3, { 1: [info(1), info(2)], 2: [info(1), info(2)] });
    for (const id of [1, 2]) {
      w.terminals(id, 2, [info(1)]);
      expect(w.handle.terminals(id).map((t) => t.n)).toEqual([1, 2]);
      w.terminals(id, 4, [info(1), info(2), info(3)]);
      expect(w.handle.terminals(id).map((t) => t.n)).toEqual([1, 2, 3]);
    }
  });
});

describe("a snapshot without terminalsRev", () => {
  it("resets every session's seen rev to 0", () => {
    const w = wire();
    w.snapshot(1, {});
    w.terminals(1, 20, [info(1)]);

    w.snapshot(undefined, { 1: [info(1)] });
    w.terminals(1, 1, [info(1), info(2)]);
    expect(w.handle.terminals(1).map((t) => t.n)).toEqual([1, 2]);
  });
});

describe("a spawn reply at or below the seen rev whose terminal is missing from the list", () => {
  it("newTerminal leaves the selection and the terminal shown as they were", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    w.terminals(1, 9, [info(1)]);
    const reply = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    await reply({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev: 9 });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "claude",
      shell: 1,
    });
  });

  it("select('shell') with an empty list stays on the surface it was on", async () => {
    const w = wire();
    w.snapshot(5, {});
    w.terminals(1, 9, []);
    const reply = pendingReply();
    w.handle.select(1, "shell", noDeadRefs);
    await reply({ target: "muster-1-shell", n: 1, created: true, rev: 9 });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "claude",
      shell: null,
    });
  });

  // Green today: the last-shown fallback already gives this (kb:adr/surfaces-last-shown-terminal-per-window).
  it("select('shell') with a non-empty list shows the terminal the list gives", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(3)] });
    w.terminals(1, 9, [info(3)]);
    const reply = pendingReply();
    w.handle.select(1, "shell", noDeadRefs);
    await reply({ target: "muster-1-shell", n: 1, created: false, rev: 9 });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({
      selected: "shell",
      shell: 3,
    });
  });
});

describe("a spawn reply judged against the snapshot's terminalsRev alone (no terminals message yet)", () => {
  it.each([
    [9, { selected: "claude", shell: 1 }],
    [10, { selected: "shell", shell: 2 }],
  ])("reply rev %s with a snapshot list lacking n", async (rev, expected) => {
    const w = wire();
    w.snapshot(9, { 1: [info(1)] });
    const reply = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    await reply({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev });
    expect(getSurfaceState(w.handle.state(), 1)).toEqual(expected);
  });
});

describe("a rename or close reply arriving before the list carrying a new terminal", () => {
  const shown = (w: ReturnType<typeof wire>, shell: number) => {
    expect(getSurfaceState(w.handle.state(), 1)).toEqual({ selected: "shell", shell });
  };

  it("a rename reply first still shows the spawned terminal", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    const spawn = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    const rename = pendingReply();
    w.handle.renameTerminal(1, 1, "build");
    await rename({ n: 1, name: "build", rev: 7 });
    await spawn({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev: 6 });
    shown(w, 2);
  });

  it("a close reply first still shows the spawned terminal", async () => {
    const w = wire();
    w.snapshot(5, { 1: [info(1)] });
    const spawn = pendingReply();
    w.handle.newTerminal(1, noDeadRefs);
    const close = pendingReply();
    w.handle.closeTerminal(1, 1);
    await close({ rev: 7 });
    await spawn({ target: "muster-1-shell-2", n: 2, name: "shell 2", rev: 6 });
    shown(w, 2);
  });

  it("a rename reply first still shows the terminal select('shell') made", async () => {
    const w = wire();
    w.snapshot(5, {});
    const spawn = pendingReply();
    w.handle.select(1, "shell", noDeadRefs);
    const rename = pendingReply();
    w.handle.renameTerminal(1, 1, "build");
    await rename({ n: 1, name: "build", rev: 7 });
    await spawn({ target: "muster-1-shell", n: 1, created: true, rev: 6 });
    shown(w, 1);
  });
});
