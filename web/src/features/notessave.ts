import type { ApiResult } from "../api/http";
import type { DraftStore } from "./notesdrafts";

export const SAVE_DEBOUNCE_MS = 1000;

export type SaveOutcome = "saved" | "gone" | "unreachable";

export interface SendOptions {
  keepalive: boolean;
}

export interface NoteSaverDeps {
  drafts: DraftStore;
  send(id: number, text: string, options: SendOptions): Promise<SaveOutcome>;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  onChange(): void;
}

export interface NoteSaver {
  edit(id: number, text: string): void;
  flush(id: number, options?: SendOptions): void;
  flushAll(options?: SendOptions): void;
  resend(id: number): void;
  forget(id: number): void;
  failed(id: number): boolean;
}

const PLAIN: SendOptions = { keepalive: false };

export function outcomeOf(result: ApiResult<null>): SaveOutcome {
  if (result.ok) return "saved";
  return result.error.code === "unknown_session" ? "gone" : "unreachable";
}

export function createNoteSaver(deps: NoteSaverDeps): NoteSaver {
  const timers = new Map<number, unknown>();
  const inflight = new Set<number>();
  const failedIds = new Set<number>();

  function setFailed(id: number, failed: boolean): void {
    if (failedIds.has(id) === failed) return;
    if (failed) failedIds.add(id);
    else failedIds.delete(id);
    deps.onChange();
  }

  function cancelTimer(id: number): void {
    const handle = timers.get(id);
    if (handle === undefined) return;
    deps.clearTimer(handle);
    timers.delete(id);
  }

  async function pump(id: number, options: SendOptions): Promise<void> {
    const text = deps.drafts.get(id);
    if (text === undefined || inflight.has(id)) return;
    inflight.add(id);
    const outcome = await deps.send(id, text, options);
    inflight.delete(id);
    if (outcome === "saved") {
      deps.drafts.acknowledge(id, text);
      setFailed(id, false);
    } else if (outcome === "gone") {
      deps.drafts.drop(id);
      setFailed(id, false);
    } else {
      setFailed(id, true);
      return;
    }
    if (deps.drafts.get(id) !== undefined) await pump(id, PLAIN);
  }

  function edit(id: number, text: string): void {
    deps.drafts.set(id, text);
    cancelTimer(id);
    timers.set(
      id,
      deps.setTimer(() => {
        timers.delete(id);
        void pump(id, PLAIN);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  function flush(id: number, options: SendOptions = PLAIN): void {
    cancelTimer(id);
    void pump(id, options);
  }

  function flushAll(options: SendOptions = PLAIN): void {
    for (const id of deps.drafts.pending().keys()) flush(id, options);
  }

  function forget(id: number): void {
    cancelTimer(id);
    deps.drafts.drop(id);
    setFailed(id, false);
  }

  return {
    edit,
    flush,
    flushAll,
    resend: (id) => flush(id),
    forget,
    failed: (id) => failedIds.has(id),
  };
}
