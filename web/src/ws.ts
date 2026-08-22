// The single WebSocket client module (docs/conventions.md — "one WebSocket client
// module owns the daemon connection"; nothing else may construct a WebSocket, enforced
// by the W7 automated check: `rg -n "new WebSocket" web/src --glob '!web/src/ws.ts'`).
//
// Owns: connecting, reconnecting with backoff, and dispatching parsed messages to
// handlers. Message parsing and the protocol-version gate live in protocol.ts; this
// module just wires the socket lifecycle to them.
import { type Hello, type Message, type Session, type Snapshot, isSupportedProtocolVersion, parseMessage } from "./protocol";

const RECONNECT_BASE_MS = 500;
const RECONNECT_CAP_MS = 8000;

/** 500ms doubling per attempt, capped at 8s (REQ-17). Pure — Vitest covers the schedule. */
export function backoffDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_CAP_MS);
}

export interface WsClientHandlers {
  onConnecting?: () => void;
  onConnected?: () => void;
  onHello?: (hello: Hello) => void;
  onSnapshot?: (snapshot: Snapshot) => void;
  onSessionUpsert?: (session: Session) => void;
  onDisconnected?: () => void;
  onProtocolMismatch?: (protocolVersion: number) => void;
}

/** Minimal surface WsClient needs from a socket — real `WebSocket` satisfies it. */
export interface SocketLike {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: () => void): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

// The only place a real WebSocket is constructed. Injectable so Vitest can drive
// `WsClient` with a fake socket instead of a real one (docs/conventions.md — Vitest
// covers logic only, no real sockets).
const defaultSocketFactory: SocketFactory = (url) => new WebSocket(url);

export class WsClient {
  private readonly url: string;
  private readonly handlers: WsClientHandlers;
  private readonly socketFactory: SocketFactory;
  private socket: SocketLike | null = null;
  private attempt = 0;
  private stopped = false;

  constructor(url: string, handlers: WsClientHandlers, socketFactory: SocketFactory = defaultSocketFactory) {
    this.url = url;
    this.handlers = handlers;
    this.socketFactory = socketFactory;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    this.handlers.onConnecting?.();
    const socket = this.socketFactory(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.handlers.onConnected?.();
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return; // superseded by a newer socket already
      this.socket = null;
      this.handlers.onDisconnected?.();
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private handleRawMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    this.dispatch(parseMessage(parsed));
  }

  /** Applies one already-parsed message. Exposed so Vitest can test dispatch and the
   * protocol-version gate without a socket at all. */
  dispatch(message: Message | null): void {
    if (!message) return;
    if (message.type === "hello") {
      if (!isSupportedProtocolVersion(message.protocolVersion)) {
        this.handlers.onProtocolMismatch?.(message.protocolVersion);
        return;
      }
      this.attempt = 0;
      this.handlers.onHello?.(message);
      return;
    }
    if (message.type === "sessionUpsert") {
      this.handlers.onSessionUpsert?.(message.session);
      return;
    }
    this.handlers.onSnapshot?.(message);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delay);
  }
}
