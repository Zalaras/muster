// Plan auto-update, UI Specifications > Text rules: the pure decision behind the Updates
// section's readouts — split out of render/update.ts (review seed B7: a DOM-free decision
// with one controller caller, features/update.ts, lives beside it, not in `render/`).
// `buildUpdateViewModel` is pure so every Text-rules row can be table-tested (W5) without
// a DOM; `render/update.ts`'s `renderUpdateSection` stays the DOM half, taking the
// `UpdateViewModel` this produces as a parameter (that split already existed — only the
// derivation itself moves here).
import type { Prefs } from "../protocol/prefs";
import type { UpdateInfo } from "../protocol/update";
import type { UpdateViewModel } from "../render/update";
import { ageAgo } from "../sessions/format";

/** Every apply phase during which a request is genuinely in flight — REQ-10's
 * `aria-busy="true"` and the "phase not in flight" clause of the Buttons-enabled rule. */
const IN_FLIGHT_PHASES: ReadonlySet<string> = new Set([
  "downloading",
  "verifying",
  "installing",
  "restarting",
]);

/** REQ-10/REQ-13 (plan rail-card-improvements-2): the `Check now` request's own state,
 * owned by `features/update.ts` (never derived from `UpdateInfo` — a manual check's
 * in-flight/error status is this window's own, not daemon-broadcast state). */
export interface CheckState {
  inFlight: boolean;
  /** REQ-12: the reason a user-initiated check failed, or null once cleared (a new check
   * starting, or one succeeding). */
  error: string | null;
}

/** The "Available" readout (UI Specifications > Text rules table, REQ-11). A development
 * build says so rather than showing a version. Every other case carries the age of the
 * last successful check (`ageAgo`) once one has ever completed — `checkedAt` null (never
 * checked, or just cleared by turning the daily-check toggle off) is the one case with no
 * suffix at all, not an empty one (edge case 19). */
function availableText(update: UpdateInfo, isDev: boolean, now: Date): string {
  if (isDev) return "not checked (development build)";
  if (update.checkedAt === null) return "not checked yet";
  const version = update.available !== null ? `v${update.available}` : "up to date";
  return `${version} · checked ${ageAgo(update.checkedAt, now)}`;
}

/** The status line under the buttons (UI Specifications > Text rules table). A failed
 * user-initiated check (REQ-12, `checkError`) wins over everything else — it is the most
 * recent thing the user asked for and the Available readout deliberately keeps showing
 * its previous value, so this line is the only place the failure surfaces. Otherwise,
 * apply-phase progress wins over the "installed, awaiting restart" line, which in turn
 * wins over a standing remedy. */
function statusText(update: UpdateInfo, checkError: string | null): string {
  if (checkError !== null) return checkError;
  switch (update.apply.phase) {
    case "downloading":
      return `Downloading v${update.apply.version ?? ""}…`;
    case "verifying":
      return `Verifying v${update.apply.version ?? ""}…`;
    case "installing":
      return `Installing v${update.apply.version ?? ""}…`;
    case "restarting":
      return "Restarting musterd…";
    case "failed":
      return `Update failed: ${update.apply.error ?? ""}`;
    case "done":
      return `Updated to v${update.installed ?? ""}. Restart musterd to finish.`;
    default:
      if (update.installed !== null) {
        return `Updated to v${update.installed ?? ""}. Restart musterd to finish.`;
      }
      return update.remedy ?? "";
  }
}

/** UI Specifications > Text rules table. `update === null` covers both "before the first
 * snapshot" (the dialog can't be open then anyway — nothing in features/settings.ts opens
 * it before a user click) and edge case 32's permanent
 * case, a pre-plan daemon that never sends `update` at all: renders the same
 * unknown-shaped, no-badge, no-buttons state `parseSnapshot` already tolerates rather than
 * throwing. */
export function buildUpdateViewModel(
  update: UpdateInfo | null,
  prefs: Prefs | null,
  now: Date,
  check: CheckState,
): UpdateViewModel {
  const updateCheck = prefs?.updateCheck ?? true;

  if (!update) {
    return {
      running: "unknown",
      available: "not checked yet",
      toggleChecked: updateCheck,
      toggleDisabled: true,
      buttonsVisible: false,
      updateEnabled: false,
      restartEnabled: false,
      restartLabel: "Update and restart",
      status: "",
      badged: false,
      busy: false,
      // W2/edge case 21: `canCheck` is never known without an `update` object, so the
      // button stays disabled — same shape a pre-plan daemon's absent `update` already
      // produces.
      checkEnabled: false,
      checkBusy: check.inFlight,
    };
  }

  const isDev = update.install === "dev";
  const running = isDev ? `${update.running} (development build)` : `v${update.running}`;

  const available = availableText(update, isDev, now);

  const phase = update.apply.phase;
  const inFlight = IN_FLIGHT_PHASES.has(phase);
  const baseEnabled =
    update.install === "installer" &&
    !inFlight &&
    (update.available !== null || update.installed !== null);
  const updateEnabled = baseEnabled && update.installed === null;
  const restartLabel = update.installed !== null ? "Restart now" : "Update and restart";

  const status = statusText(update, check.error);

  return {
    running,
    available,
    toggleChecked: updateCheck,
    toggleDisabled: isDev,
    buttonsVisible: !isDev,
    updateEnabled,
    restartEnabled: baseEnabled,
    restartLabel,
    status,
    badged: update.available !== null && update.installed === null,
    busy: inFlight,
    // REQ-10: `canCheck` and no manual check of this window's own already running.
    checkEnabled: update.canCheck && !check.inFlight,
    checkBusy: check.inFlight,
  };
}
