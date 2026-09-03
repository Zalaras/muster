import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeThemeMessage, Hello, PrefsMessage, Session, Snapshot, Usage, UsageMessage } from "./protocol";
import { backoffDelay, type SocketLike, WsClient, type WsClientHandlers } from "./ws";

const hello: Hello = {
  type: "hello",
  protocolVersion: 1,
  daemon: { version: "0.1.0" },
  claudeCode: { pinned: "2.1.233", installed: "2.1.233", drift: false },
};

const snapshot: Snapshot = {
  type: "snapshot",
  sessions: [],
  usage: { fiveHour: null, sevenDay: null, sampledAt: null, source: "subscription" },
  prefs: { view: "focus", density: "2x2", usageModel: "Fable", railSort: "manual", theme: "follow" },
  claudeTheme: { family: "unknown" },
};

const prefsMessage: PrefsMessage = {
  type: "prefs",
  prefs: { view: "tiles", density: "3x2", usageModel: "Opus", railSort: "manual", theme: "dark" },
};

const usage: Usage = {
  fiveHour: { usedPct: 61.2, resetsAt: "2026-08-23T11:00:00Z" },
  sevenDay: { usedPct: 23.0, resetsAt: "2026-08-25T06:00:00Z" },
  model: { id: "claude-opus-5", displayName: "Opus 5" },
  sampledAt: "2026-08-23T09:15:31Z",
  source: "subscription",
};

const usageMessage: UsageMessage = { type: "usage", usage };

const claudeThemeMessage: ClaudeThemeMessage = { type: "claudeTheme", family: "light" };

const session: Session = {
  id: 1,
  title: "fix the thing",
  titleOverride: null,
  state: "working",
  stateSince: "2026-08-22T00:00:00Z",
  alive: true,
  endedAt: null,
  attention: null,
  failure: null,
  directory: "/Users/damian/code/muster",
  repo: { name: "muster", branch: "main", isWorktree: false },
  model: { id: "claude-sonnet-4-5", displayName: "sonnet" },
  permissionMode: { value: "default", source: "seed" },
  context: { usedPct: null, totalInputTokens: null, windowSize: null, compactions: 0 },
  lastActivity: null,
  claudeSessionId: "claude-session-abc",
  tmuxTarget: "muster:@1",
  firstLaunchHere: false,
  createdAt: "2026-08-22T00:00:00Z",
  pinned: false,
  railPos: 0,
};

describe("backoffDelay", () => {
  it("doubles from 500ms and caps at 8000ms (REQ-17)", () => {
    expect(backoffDelay(0)).toBe(500);
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(2000);
    expect(backoffDelay(3)).toBe(4000);
    expect(backoffDelay(4)).toBe(8000);
    expect(backoffDelay(5)).toBe(8000);
    expect(backoffDelay(9)).toBe(8000);
  });
});

/** A fake socket whose lifecycle events are triggered manually from the test. */
class FakeSocket implements SocketLike {
  listeners: { open: (() => void)[]; message: ((event: MessageEvent) => void)[]; close: (() => void)[]; error: (() => void)[] } = {
    open: [],
    message: [],
    close: [],
    error: [],
  };
  closed = false;

  addEventListener(type: "open" | "message" | "close" | "error", listener: (() => void) | ((event: MessageEvent) => void)): void {
    (this.listeners[type] as ((...args: unknown[]) => void)[]).push(listener as (...args: unknown[]) => void);
  }

  close(): void {
    this.closed = true;
  }

  emitOpen(): void {
    this.listeners.open.forEach((l) => l());
  }

  emitMessage(data: unknown): void {
    this.listeners.message.forEach((l) => l({ data } as MessageEvent));
  }

  emitClose(): void {
    this.listeners.close.forEach((l) => l());
  }

  emitError(): void {
    this.listeners.error.forEach((l) => l());
  }
}

function makeHandlers(): WsClientHandlers & Record<string, ReturnType<typeof vi.fn>> {
  return {
    onConnecting: vi.fn(),
    onConnected: vi.fn(),
    onHello: vi.fn(),
    onSnapshot: vi.fn(),
    onSessionUpsert: vi.fn(),
    onPrefs: vi.fn(),
    onUsage: vi.fn(),
    onSessionRemoved: vi.fn(),
    onClaudeTheme: vi.fn(),
    onDisconnected: vi.fn(),
    onProtocolMismatch: vi.fn(),
  };
}

describe("WsClient.dispatch — pure message application, no socket involved", () => {
  it("routes a supported hello to onHello and resets the reconnect attempt", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(hello);
    expect(handlers.onHello).toHaveBeenCalledWith(hello);
    expect(handlers.onProtocolMismatch).not.toHaveBeenCalled();
  });

  it("routes a hello with an unsupported protocolVersion to onProtocolMismatch, not onHello", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    const badHello: Hello = { ...hello, protocolVersion: 2 };
    client.dispatch(badHello);
    expect(handlers.onProtocolMismatch).toHaveBeenCalledWith(2);
    expect(handlers.onHello).not.toHaveBeenCalled();
  });

  it("routes a snapshot to onSnapshot", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(snapshot);
    expect(handlers.onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("calls no handler for a null message (unknown/malformed)", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(null);
    expect(handlers.onHello).not.toHaveBeenCalled();
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
    expect(handlers.onProtocolMismatch).not.toHaveBeenCalled();
  });

  it("routes a sessionUpsert to onSessionUpsert with the bare session, not onSnapshot", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch({ type: "sessionUpsert", session });
    expect(handlers.onSessionUpsert).toHaveBeenCalledWith(session);
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
  });

  it("routes a prefs message to onPrefs with the bare prefs object, not onSnapshot (M2 REQ-10/INV-4)", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(prefsMessage);
    expect(handlers.onPrefs).toHaveBeenCalledWith(prefsMessage.prefs);
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
  });

  it("routes a usage message to onUsage with the bare usage object, not onSnapshot (M3 protocol §5.4)", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(usageMessage);
    expect(handlers.onUsage).toHaveBeenCalledWith(usage);
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
  });

  it("routes a sessionRemoved message to onSessionRemoved with the bare id, not onSnapshot (M4 protocol §5.5, REQ-15)", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch({ type: "sessionRemoved", id: 7 });
    expect(handlers.onSessionRemoved).toHaveBeenCalledWith(7);
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
  });

  it("routes a claudeTheme message to onClaudeTheme with the bare family, not onSnapshot (plan new-ui-design-colors §5.6)", () => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch(claudeThemeMessage);
    expect(handlers.onClaudeTheme).toHaveBeenCalledWith("light");
    expect(handlers.onSnapshot).not.toHaveBeenCalled();
  });

  it.each(["light", "dark", "unknown"] as const)("routes each known claudeTheme family (%s) to onClaudeTheme", (family) => {
    const handlers = makeHandlers();
    const client = new WsClient("ws://x", handlers);
    client.dispatch({ type: "claudeTheme", family });
    expect(handlers.onClaudeTheme).toHaveBeenCalledWith(family);
  });
});

describe("WsClient — full socket lifecycle via an injected fake socket", () => {
  let sockets: FakeSocket[];
  let handlers: WsClientHandlers & Record<string, ReturnType<typeof vi.fn>>;
  let client: WsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    handlers = makeHandlers();
    client = new WsClient("ws://daemon/ws", handlers, () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onConnecting immediately on start()", () => {
    client.start();
    expect(handlers.onConnecting).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
  });

  it("calls onConnected when the socket opens, and dispatches a parsed hello on message", () => {
    client.start();
    sockets[0]!.emitOpen();
    expect(handlers.onConnected).toHaveBeenCalledTimes(1);

    sockets[0]!.emitMessage(JSON.stringify(hello));
    expect(handlers.onHello).toHaveBeenCalledWith(hello);
  });

  it("ignores a non-JSON message frame instead of throwing", () => {
    client.start();
    sockets[0]!.emitOpen();
    expect(() => sockets[0]!.emitMessage("not json{")).not.toThrow();
    expect(handlers.onHello).not.toHaveBeenCalled();
  });

  it("dispatches a sessionUpsert frame to onSessionUpsert", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(JSON.stringify({ type: "sessionUpsert", session }));
    expect(handlers.onSessionUpsert).toHaveBeenCalledWith(session);
  });

  it("dispatches a prefs frame to onPrefs", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(JSON.stringify(prefsMessage));
    expect(handlers.onPrefs).toHaveBeenCalledWith(prefsMessage.prefs);
  });

  it("dispatches a usage frame to onUsage", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(JSON.stringify(usageMessage));
    expect(handlers.onUsage).toHaveBeenCalledWith(usage);
  });

  it("dispatches a sessionRemoved frame to onSessionRemoved", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(JSON.stringify({ type: "sessionRemoved", id: 3 }));
    expect(handlers.onSessionRemoved).toHaveBeenCalledWith(3);
  });

  it("dispatches a claudeTheme frame to onClaudeTheme", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(JSON.stringify(claudeThemeMessage));
    expect(handlers.onClaudeTheme).toHaveBeenCalledWith("light");
  });

  it("ignores a binary (non-string) message frame", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitMessage(new ArrayBuffer(4));
    expect(handlers.onHello).not.toHaveBeenCalled();
  });

  it("on close: calls onDisconnected and reconnects after backoffDelay(0) = 500ms", () => {
    client.start();
    sockets[0]!.emitOpen();
    sockets[0]!.emitClose();
    expect(handlers.onDisconnected).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
  });

  it("backs off across repeated drops, following the 500/1000/2000... schedule", () => {
    client.start();
    sockets[0]!.emitClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emitClose();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("resets the backoff attempt counter after a hello is received", () => {
    client.start();
    sockets[0]!.emitClose(); // attempt 0 used, next delay would be 1000
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emitMessage(JSON.stringify(hello)); // resets attempt to 0
    sockets[1]!.emitClose();
    vi.advanceTimersByTime(500); // would be 1000ms if not reset
    expect(sockets).toHaveLength(3);
  });

  it("a protocol-mismatch hello does not reset the backoff attempt counter", () => {
    client.start();
    sockets[0]!.emitClose(); // attempt now 1, next delay 1000ms
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emitMessage(JSON.stringify({ ...hello, protocolVersion: 99 }));
    expect(handlers.onProtocolMismatch).toHaveBeenCalledWith(99);
    sockets[1]!.emitClose();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2); // still waiting — the 1000ms delay, not reset to 500
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("closes the socket on an error event (triggering the normal close/reconnect path)", () => {
    client.start();
    sockets[0]!.emitError();
    expect(sockets[0]!.closed).toBe(true);
  });

  it("stop() prevents any further reconnect attempt", () => {
    client.start();
    sockets[0]!.emitClose();
    client.stop();
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
  });

  it("a close event from a superseded (already-replaced) socket is not double-handled", () => {
    client.start();
    sockets[0]!.emitClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    // the old socket fires a late close after being superseded — must be a no-op
    sockets[0]!.emitClose();
    expect(handlers.onDisconnected).toHaveBeenCalledTimes(1);
  });
});
