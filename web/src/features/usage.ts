// The masthead's usage gauges: text readout, track/resets markup, model readout, and the
// per-model weekly window. No dependency on any other controller.
import type { App } from "../app";
import { requestPrefs, refreshUsage } from "../api/prefs";
import { requireElement } from "../dom";
import {
  buildUsageBucket,
  buildUsageModelWeek,
  renderUsageBucket,
  renderUsageModel,
  renderUsageModelWeek,
} from "../render/masthead";
import { UNKNOWN_USAGE, type Usage } from "../protocol/usage";

export function initUsage(app: App): void {
  const usageFiveHourEl = requireElement<HTMLElement>("#usage-5h");
  const usageSevenDayEl = requireElement<HTMLElement>("#usage-7d");
  const usageModelWeekEl = requireElement<HTMLElement>("#usage-model-week");
  const usageRefreshBtn = requireElement<HTMLButtonElement>("#usage-refresh");
  const usageModelEl = requireElement<HTMLElement>("#usage-model");

  // The account-global Usage object, from the initial `snapshot` and every subsequent
  // `usage` broadcast — re-rendered every pass so the reset-time formatting stays current
  // against the wall clock.
  let currentUsage: Usage = UNKNOWN_USAGE;
  // Which model-scoped window the masthead's third readout shows — same "daemon's `prefs`
  // broadcast is the single source of truth" rule as view/density/railSort/themeChoice; the
  // daemon's own default before any PUT is "Fable"
  // (kb:adr/usage-masthead-one-selectable-model-window).
  let usageModel = "Fable";

  /** The model-week `<select>`'s change handler — fire-and-forget;
   * `usageModel` only ever changes via the `prefs` echo, never optimistically here. */
  function requestUsageModel(newModel: string): void {
    requestPrefs({ usageModel: newModel });
  }

  // Each bucket's DOM refs are built once, here, and held across
  // every render pass — `render/CLAUDE.md`'s render-state rule (the model-week `<select>`
  // used to persist in a module-level `WeakMap` inside `render/masthead.ts` instead).
  const fiveHourRefs = buildUsageBucket(usageFiveHourEl, "5h");
  const sevenDayRefs = buildUsageBucket(usageSevenDayEl, "7d");
  const modelWeekRefs = buildUsageModelWeek(
    usageModelWeekEl,
    [usageModel],
    false,
    false,
    usageModel,
    requestUsageModel,
  );

  let usageRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  function clearUsageRefreshBusy(): void {
    usageRefreshBtn.removeAttribute("aria-busy");
    if (usageRefreshTimer !== null) {
      clearTimeout(usageRefreshTimer);
      usageRefreshTimer = null;
    }
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
    // aria-busy from click until the next `usage` message or 5s, whichever is
    // first — the fallback for a fetch that hangs or a result that never triggers a
    // broadcast because the list didn't change.
    usageRefreshBtn.setAttribute("aria-busy", "true");
    if (usageRefreshTimer !== null) clearTimeout(usageRefreshTimer);
    usageRefreshTimer = setTimeout(clearUsageRefreshBusy, 5000);
    // http.ts's `logApiFailure` already logs a failed request under its own route.
    void refreshUsage().then((result) => {
      if (!result.ok) clearUsageRefreshBusy();
    });
  });

  // Render phase 2 (UI Specifications > Render phase order).
  app.onRender((frame) => {
    renderUsageBucket(fiveHourRefs, currentUsage.fiveHour, frame.now);
    renderUsageBucket(sevenDayRefs, currentUsage.sevenDay, frame.now);
    renderUsageModel(usageModelEl, currentUsage.model);
    renderUsageModelWeek(modelWeekRefs, currentUsage, usageModel, frame.now, requestUsageModel);
  });
}
