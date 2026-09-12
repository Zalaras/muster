// The cross-feature seam (plan code-breakup REQ-3): the session store, the shared
// AppState fields more than one feature reads, a typed event bus, the ordered render
// phases, and render() itself. Pure enough to unit-test (no DOM) — every feature module
// builds on top of this rather than main.ts wiring them together directly.
import type { ConnectionStatus } from "./render/masthead";
import type {
  ClaudeFamily,
  Density,
  Prefs,
  RailSort,
  Session,
  Snapshot,
  Usage,
  UpdateInfo,
} from "./protocol";
import { SessionStore } from "./sessions/store";

export type View = "focus" | "tiles";

/** Fields more than one feature reads. Each is written by exactly one feature (noted per
 * field) — everything else stays a closure variable inside the feature that owns it. */
export interface AppState {
  view: View; // written only by features/views.ts (from prefs)
  density: Density; // written only by features/views.ts (from prefs)
  railSort: RailSort; // written only by features/rail.ts (from prefs)
  focusedId: number | null; // written only via app.focus(id)
  connection: ConnectionStatus; // written only by features/connection.ts
}

export interface RenderFrame {
  sessions: readonly Session[];
  now: Date;
  connected: boolean;
}

export interface AppEvents {
  status: (status: ConnectionStatus) => void; // after state.connection changed
  snapshot: (snapshot: Snapshot) => void; // after store.replaceAll
  prefs: (prefs: Prefs) => void; // snapshot.prefs and every prefs broadcast
  claudeTheme: (family: ClaudeFamily) => void;
  usage: (usage: Usage) => void;
  update: (update: UpdateInfo) => void;
  sessionRemoved: (id: number) => void; // WS sessionRemoved, and a successful DELETE
  focusChanged: (id: number | null) => void; // before the render that follows app.focus
  cancelRenames: () => void; // any trigger that must not let a blur-commit through
}

export interface App {
  readonly store: SessionStore;
  readonly state: AppState;
  on<E extends keyof AppEvents>(event: E, fn: AppEvents[E]): void;
  emit<E extends keyof AppEvents>(event: E, ...args: Parameters<AppEvents[E]>): void;
  onRender(phase: (frame: RenderFrame) => void): void; // called in registration order
  render(): void; // synchronous: builds the frame, runs every phase
  focus(id: number | null): void; // sets state.focusedId, emits focusChanged (no render)
}

// TS cannot keep a mapped-type's per-key function signature aligned with a generic key
// `E` all the way through storage and invocation (a known limitation, not a real type
// hole here: `on`'s and `emit`'s own signatures above are what callers see, and those
// stay fully checked against `AppEvents`). Internally, listeners are erased to this one
// shape and recovered with a narrow cast at each of the two boundaries below.
type ErasedListener = (...args: never[]) => void;

export function createApp(): App {
  const store = new SessionStore();
  const state: AppState = {
    view: "focus",
    density: "2x2",
    railSort: "manual",
    focusedId: null,
    connection: "connecting",
  };
  const listeners = new Map<keyof AppEvents, ErasedListener[]>();
  const phases: Array<(frame: RenderFrame) => void> = [];

  function on<E extends keyof AppEvents>(event: E, fn: AppEvents[E]): void {
    const list = listeners.get(event) ?? [];
    list.push(fn as ErasedListener);
    listeners.set(event, list);
  }

  function emit<E extends keyof AppEvents>(event: E, ...args: Parameters<AppEvents[E]>): void {
    const list = listeners.get(event);
    if (!list) return;
    for (const fn of list.slice()) (fn as (...args: Parameters<AppEvents[E]>) => void)(...args);
  }

  function onRender(phase: (frame: RenderFrame) => void): void {
    phases.push(phase);
  }

  function render(): void {
    const frame: RenderFrame = {
      sessions: store.values(),
      now: new Date(),
      connected: state.connection === "connected",
    };
    for (const phase of phases) phase(frame);
  }

  function focus(id: number | null): void {
    state.focusedId = id;
    emit("focusChanged", id);
  }

  return { store, state, on, emit, onRender, render, focus };
}
