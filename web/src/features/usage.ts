// The masthead's usage gauges: text readout, track/resets markup, model readout, and the
// per-model weekly window (plan code-breakup vocabulary: "usage"; plans m3-usage,
// usage-model-bar). No dependency on any other controller.
import type { App } from "../app";
import { putPrefs, refreshUsage } from "../api";
import { requireElement } from "../dom";
import {
  renderModelWeek,
  renderUsage,
  renderUsageModel,
  renderUsageTrack,
} from "../render/masthead";
import { UNKNOWN_USAGE, type Usage } from "../protocol";

export function initUsage(app: App): void {
  const usageFiveHourEl = requireElement<HTMLElement>("#usage-5h");
  const usageSevenDayEl = requireElement<HTMLElement>("#usage-7d");
  const usageModelWeekEl = requireElement<HTMLElement>("#usage-model-week");
  const usageRefreshBtn = requireElement<HTMLButtonElement>("#usage-refresh");
  const usageModelEl = requireElement<HTMLElement>("#usage-model");

  // M3: the account-global Usage object, from the initial `snapshot` and every
  // subsequent `usage` broadcast — re-rendered every pass so REQ-14's reset-time
  // formatting stays current against the wall clock.
  let currentUsage: Usage = UNKNOWN_USAGE;
  // Plan usage-model-bar: which model-scoped window the masthead's third readout shows —
  // same "daemon's `prefs` broadcast is the single source of truth" rule as
  // view/density/railSort/themeChoice; the daemon's own default before any PUT is "Fable".
  let usageModel = "Fable";

  let usageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  function clearUsageRefreshBusy(): void {
    usageRefreshBtn.removeAttribute("aria-busy");
    if (usageRefreshTimer !== null) {
      clearTimeout(usageRefreshTimer);
      usageRefreshTimer = null;
    }
  }

  /** REQ-12: the model-week `<select>`'s change handler — fire-and-forget;
   * `usageModel` only ever changes via the `prefs` echo, never optimistically here. */
  function requestUsageModel(newModel: string): void {
    void putPrefs({ usageModel: newModel }).then((result) => {
      if (!result.ok)
        console.error(`PUT /api/prefs failed: ${result.error.code} ${result.error.message}`);
    });
  }

  app.on("snapshot", (snapshot) => {
    currentUsage = snapshot.usage;
  });
  app.on("usage", (usage) => {
    currentUsage = usage;
    clearUsageRefreshBusy();
  });
  app.on("prefs", (prefs) => {
    usageModel = prefs.usageModel;
  });

  usageRefreshBtn.addEventListener("click", () => {
    // REQ-12: aria-busy from click until the next `usage` message or 5s, whichever is
    // first — the fallback for a fetch that hangs or a result that never triggers a
    // broadcast because the list didn't change.
    usageRefreshBtn.setAttribute("aria-busy", "true");
    if (usageRefreshTimer !== null) clearTimeout(usageRefreshTimer);
    usageRefreshTimer = setTimeout(clearUsageRefreshBusy, 5000);
    void refreshUsage().then((result) => {
      if (!result.ok) {
        console.error(
          `POST /api/usage/refresh failed: ${result.error.code} ${result.error.message}`,
        );
        clearUsageRefreshBusy();
      }
    });
  });

  // Render phase 2 (UI Specifications > Render phase order).
  app.onRender((frame) => {
    renderUsage({ fiveHour: usageFiveHourEl, sevenDay: usageSevenDayEl }, currentUsage);
    renderUsageTrack(usageFiveHourEl, currentUsage.fiveHour, frame.now);
    renderUsageTrack(usageSevenDayEl, currentUsage.sevenDay, frame.now);
    renderUsageModel(usageModelEl, currentUsage.model);
    renderModelWeek(usageModelWeekEl, currentUsage, usageModel, frame.now, requestUsageModel);
  });
}
