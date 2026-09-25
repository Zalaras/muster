// The update-restart record, its banner override, the post-restart reload with its
// `sessionStorage` handoff, and the "Updated to v…" confirmation timer
// (kb:adr/update-restart-reloads-dashboard). No dependency on any other controller
// (kb:adr/process-composition-roots-registration-only) — `features/connection.ts` reads
// both `bannerOverride` and `reloading` through its own structurally-typed
// `ConnectionDeps`, the one cross-feature contact point (`connection.ts` stays the
// banner's sole writer, and the sole decider of whether a mismatched hello shows the
// mismatch screen). Hello arrival reaches this module over the app event bus
// (`helloArrived`, wired in wsapp.ts), same as every other WS signal a feature needs. A deliberate second
// controller for "update" rather than a fold into `update.ts`: this module's state (the
// restart record, the reload handoff, the confirmation timer) is driven entirely by
// connection/WS lifecycle events that `update.ts` never otherwise touches, and
// `connection.ts` needs its output on every render tick, not just `update.ts`'s own
// render phase 3.
import type { App, ConnectionStatus } from "../app";
import { isRecord } from "../protocol/decode";
import { DAEMON_ABSENCE_CLAUSE } from "../render/banner";
import { readJson, removeItem, writeJson, type StorageLike } from "../storage";

// 30 s since the record arrived before the banner falls back to the ordinary unreachable
// text (the record itself stays held — only the text changes).
const RESTART_FALLBACK_MS = 30_000;
// The confirmation shows for 3 s, then hides.
const CONFIRMATION_MS = 3_000;
const HANDOFF_KEY = "muster.update-restart";

/** Wraps the `sessionStorage` *accessor* itself in a try, not just its methods — a
 * browser with site data blocked (observed on Chrome) throws on the global getter
 * before any `getItem`/`setItem` call is reachable, which `storage.ts`'s own
 * `readJson`/`writeJson`/`removeItem` try/catch never gets a chance to run for
 * (kb:adr/update-restart-reloads-dashboard). A throwing accessor degrades to a storage
 * whose methods also throw, tolerated the same way an explicitly disabled storage
 * already is by every `storage.ts` caller. Kept here rather than in `storage.ts` — this
 * is the one caller, and `storage.ts` is shared by the reader and theme features, outside
 * this module's own scope. */
function safeSessionStorage(): StorageLike {
  try {
    return sessionStorage;
  } catch {
    return {
      getItem() {
        throw new Error("sessionStorage unavailable");
      },
      setItem() {
        throw new Error("sessionStorage unavailable");
      },
      removeItem() {
        throw new Error("sessionStorage unavailable");
      },
    };
  }
}

interface RestartRecord {
  version: string;
  arrivedAt: Date;
}

interface ConfirmationRecord {
  version: string;
  startedAt: Date;
}

/** `connection.ts` composes this into the banner element verbatim — the text is fully
 * composed here (render/CLAUDE.md: "every displayed string comes from a pure
 * view-model"), never assembled a second time in `render/`. `neutral` selects the
 * confirmation's informational style over the alarm `--banner-*` tokens. */
export interface BannerOverride {
  text: string;
  neutral: boolean;
}

function restartingText(version: string): string {
  return `Updating musterd to v${version} — restarting; ${DAEMON_ABSENCE_CLAUSE}`;
}

/** Pure — table-tested directly with no socket, storage or DOM. `record`/`confirmation`
 * are this window's own in-memory state (`initUpdateRestart` below); `status` is
 * `app.state.connection`. Returns `null` when neither override applies, so
 * `connection.ts` falls through to its own ordinary daemon-down text. */
export function computeBannerOverride(
  record: RestartRecord | null,
  status: ConnectionStatus,
  now: Date,
  confirmation: ConfirmationRecord | null,
): BannerOverride | null {
  if (confirmation && now.getTime() - confirmation.startedAt.getTime() < CONFIRMATION_MS) {
    return { text: `Updated to v${confirmation.version}.`, neutral: true };
  }
  if (
    record &&
    status !== "connected" &&
    now.getTime() - record.arrivedAt.getTime() < RESTART_FALLBACK_MS
  ) {
    return { text: restartingText(record.version), neutral: false };
  }
  return null;
}

function isHandoff(value: unknown): value is { version: string } {
  return isRecord(value) && typeof value["version"] === "string";
}

/** Reads and consumes (removes) the reload handoff written just before a previous
 * `location.reload()` (kb:adr/update-restart-reloads-dashboard) — read once, at
 * construction, so a later reload of the same tab finds nothing. A throwing storage
 * yields `null` the same as a missing key (storage.ts's own tolerance). */
function takeHandoffVersion(storage: StorageLike): string | null {
  const version = readJson(storage, HANDOFF_KEY, (v) => (isHandoff(v) ? v.version : null), null);
  removeItem(storage, HANDOFF_KEY);
  return version;
}

export interface UpdateRestartHandle {
  /** `features/connection.ts`'s per-render banner hook. */
  bannerOverride(now: Date, status: ConnectionStatus): BannerOverride | null;
  /** True once this window has kicked off its one update-restart `location.reload()`
   * for a held record, and stays true for the rest of this page's life (the page is
   * unloading). `location.reload()` only schedules the navigation — `ws.ts`'s `dispatch`
   * keeps running synchronously after `onHelloArrived`, so a protocol-mismatched hello on
   * the same tick would otherwise still reach `connection.ts`'s `showProtocolMismatch`.
   * `features/connection.ts` reads this through `ConnectionDeps` to skip that for the
   * hello that triggered the reload (kb:adr/update-restart-reloads-dashboard). */
  reloading(): boolean;
}

export function initUpdateRestart(
  app: App,
  storage: StorageLike = safeSessionStorage(),
): UpdateRestartHandle {
  let record: RestartRecord | null = null;
  let confirmation: ConfirmationRecord | null = null;
  let reloaded = false; // a second hello before unload must not reload twice
  let handoffChecked = false; // only the first snapshot of this page's life may confirm
  const pendingHandoffVersion = takeHandoffVersion(storage);

  app.on("update", (update) => {
    if (update.apply.phase === "restarting") {
      // `apply.version` is non-null whenever `phase` isn't "idle" (kb:anchor/ws.update);
      // the `?? ""` fallback matches features/updateview.ts's own degrade for the same
      // field rather than asserting an invariant the type system can't see.
      record = { version: update.apply.version ?? "", arrivedAt: new Date() };
    } else if (app.state.connection === "connected") {
      record = null; // connected again with no restart in flight — nothing left to show
    }
  });

  // The confirmation is decided once, off the first snapshot this page ever sees — a
  // later reconnect's snapshot must not re-arm it.
  app.on("snapshot", (snapshot) => {
    if (handoffChecked) return;
    handoffChecked = true;
    if (
      pendingHandoffVersion !== null &&
      snapshot.update !== null &&
      snapshot.update.running === pendingHandoffVersion
    ) {
      confirmation = { version: pendingHandoffVersion, startedAt: new Date() };
      // `app.onRender`'s 1 s tick alone can leave the confirmation showing for up to one
      // extra 1 s tick past CONFIRMATION_MS (`setInterval(app.render, 1000)`, main.ts) —
      // this schedules one extra render right after the 3 s mark so the hide lands within
      // about 100 ms of it regardless of where the tick phase falls
      // (kb:adr/update-restart-reloads-dashboard). A harmless no-op if a reload or a later
      // confirmation has already superseded this one by the time it fires.
      setTimeout(() => app.render(), CONFIRMATION_MS + 50);
    }
  });

  // Every hello, matched or protocol-mismatched, reloads this window while it holds a
  // record (`helloArrived` fires before the mismatch gate; see ws.ts's dispatch;
  // kb:adr/update-restart-reloads-dashboard). `reloading()` below is what actually keeps
  // `connection.ts`'s `showProtocolMismatch` from painting the mismatch screen for this
  // same hello — `location.reload()` itself only schedules the navigation.
  app.on("helloArrived", () => {
    if (record === null || reloaded) return;
    reloaded = true;
    writeJson(storage, HANDOFF_KEY, { version: record.version });
    location.reload();
  });

  return {
    bannerOverride(now, status) {
      return computeBannerOverride(record, status, now, confirmation);
    },
    reloading() {
      return reloaded;
    },
  };
}
