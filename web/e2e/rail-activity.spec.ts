import { expect, test } from "./helpers/fixtures";
import {
  envelopedSessionStart,
  rawStop,
  rawStopFailure,
  rawUserPromptSubmit,
} from "./helpers/payloads";
import {
  cardActivityClaude,
  cardActivityYou,
  railActivityLegend,
  railActivityRadio,
  railActivityRadios,
} from "./helpers/railcards";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { openSettingsDialog, settingsCloseButton } from "./helpers/theme";

// Plan rail-card-improvements — REQ-12 through REQ-14 (the turn-aware activity line and
// its `railActivity` pref). Plan acceptance: E8, E9, E13. Fixture plan header:
// `prefs.railActivity` is daemon-global, so every test takes the per-test `daemon`
// fixture (helpers/fixtures.ts).

test("Settings offers a Rail card shows fieldset with four radios in Turn-aware/Your prompt/Claude's reply/Both order, defaulting to Turn-aware (REQ-13)", async ({
  page,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await expect(railActivityLegend(dialog)).toHaveText("Rail card shows");

  const radios = railActivityRadios(dialog);
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(0)).toHaveAccessibleName("Turn-aware");
  await expect(radios.nth(1)).toHaveAccessibleName("Your prompt");
  await expect(radios.nth(2)).toHaveAccessibleName("Claude's reply");
  await expect(radios.nth(3)).toHaveAccessibleName("Both");
  await expect(railActivityRadio(dialog, "Turn-aware")).toBeChecked();
});

test("in Turn-aware mode a prompt-submit gives the card an on: line and the following Stop replaces it with a claude: line (E9)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "activity-e9",
    });
    const card = sessionCard(page, "activity-e9");

    // No data yet — both lines hidden, no empty "on:"/"claude:" prefix (edge case 23).
    await expect(cardActivityYou(card)).toBeHidden();
    await expect(cardActivityClaude(card)).toBeHidden();

    const claudeId = "claude-activity-e9";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { prompt: "fix the flaky retry" }),
    });
    await expect(stateBadge(card)).toHaveText(/working/i);
    await expect(cardActivityYou(card)).toHaveText("on: fix the flaky retry");
    await expect(cardActivityClaude(card)).toBeHidden();

    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { lastAssistantMessage: "fixed the retry and reran the suite" }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    await expect(cardActivityYou(card)).toBeHidden();
    await expect(cardActivityClaude(card)).toHaveText(
      "claude: fixed the retry and reran the suite",
    );
  } finally {
    await cleanup();
  }
});

test("choosing Your prompt in Settings turns an idle card's line into a you: line, and the choice persists across a reload (E8)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "activity-e8",
    });
    const claudeId = "claude-activity-e8";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { prompt: "summarise the changes" }),
    });
    await request.post(daemon.ingestURL("hook"), { data: rawStop(claudeId) });
    const card = sessionCard(page, "activity-e8");
    await expect(stateBadge(card)).toHaveText(/idle/i);

    const dialog = await openSettingsDialog(page);
    await railActivityRadio(dialog, "Your prompt").check();
    await expect(cardActivityYou(card)).toHaveText("you: summarise the changes");
    await expect(cardActivityClaude(card)).toBeHidden();
    await settingsCloseButton(dialog).click();

    await page.reload();
    const dialog2 = await openSettingsDialog(page);
    await expect(railActivityRadio(dialog2, "Your prompt")).toBeChecked();
    await expect(cardActivityYou(sessionCard(page, "activity-e8"))).toHaveText(
      "you: summarise the changes",
    );
  } finally {
    await cleanup();
  }
});

test("a synthetic background-completion prompt-submit leaves the card's on: line unchanged (E13)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "activity-e13",
    });
    const claudeId = "claude-activity-e13";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { prompt: "first real prompt" }),
    });
    const card = sessionCard(page, "activity-e13");
    await expect(cardActivityYou(card)).toHaveText("on: first real prompt");

    // A finished background task re-invokes the main agent with a synthetic prompt
    // beginning the measured background-completion tag
    // (kb:fact/background-completion-new-prompt-id) — the adapter supplies no `Prompt`
    // for it, so the still-open turn's "on:" line must stay exactly what the real
    // prompt set.
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, {
        promptId: "p2",
        prompt: "<task-notification> a background task finished",
      }),
    });
    await expect(cardActivityYou(card)).toHaveText("on: first real prompt");
  } finally {
    await cleanup();
  }
});

test("Both mode shows only the sides that have data, and hides both when neither does (edge cases 23, 24)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "activity-both",
    });
    const card = sessionCard(page, "activity-both");

    const dialog = await openSettingsDialog(page);
    await railActivityRadio(dialog, "Both").check();
    await settingsCloseButton(dialog).click();

    // No prompt or reply yet — both lines hidden, no empty "you:"/"claude:" prefix.
    await expect(cardActivityYou(card)).toBeHidden();
    await expect(cardActivityClaude(card)).toBeHidden();

    const claudeId = "claude-activity-both";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { prompt: "do it" }),
    });

    // Turn open, no reply yet — one side only.
    await expect(cardActivityYou(card)).toHaveText("you: do it");
    await expect(cardActivityClaude(card)).toBeHidden();

    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { lastAssistantMessage: "ok, done" }),
    });
    await expect(cardActivityYou(card)).toHaveText("you: do it");
    await expect(cardActivityClaude(card)).toHaveText("claude: ok, done");
  } finally {
    await cleanup();
  }
});

test("Turn-aware mode on a failed session shows the last reply's claude: line, not an on: line (edge case 25)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "activity-failed",
    });
    const claudeId = "claude-activity-failed";
    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
    });
    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p1", prompt: "try this" }),
    });
    const card = sessionCard(page, "activity-failed");
    await expect(cardActivityYou(card)).toHaveText("on: try this");

    // REQ-14's "last reply" (`lastActivity`) is written only by a successful `Stop`
    // (`KindTurnClosed`, internal/session/machine.go) — `StopFailure` never touches it,
    // only `Failure.Message` (the failure note, outside REQ-14's scope). A failed turn
    // with no prior successful one would leave `lastActivity` null, which cannot
    // distinguish "shows the last reply" from "shows nothing", so this closes a first
    // turn successfully before opening the one that fails.
    await request.post(daemon.ingestURL("hook"), {
      data: rawStop(claudeId, { promptId: "p1", lastAssistantMessage: "here's an attempt" }),
    });
    await expect(stateBadge(card)).toHaveText(/idle/i);
    await expect(cardActivityClaude(card)).toHaveText("claude: here's an attempt");

    await request.post(daemon.ingestURL("hook"), {
      data: rawUserPromptSubmit(claudeId, { promptId: "p2", prompt: "try again" }),
    });
    await expect(cardActivityYou(card)).toHaveText("on: try again");

    await request.post(daemon.ingestURL("hook"), {
      data: rawStopFailure(claudeId, { promptId: "p2", lastAssistantMessage: "hit an error" }),
    });
    await expect(stateBadge(card)).toHaveText(/failed/i);
    await expect(cardActivityYou(card)).toBeHidden();
    // The claude: line still reads the *prior* successful turn's reply, never this
    // failed turn's message — proving activityLines' "otherwise" branch reads
    // `lastActivity`, not `Failure.Message`.
    await expect(cardActivityClaude(card)).toHaveText("claude: here's an attempt");
  } finally {
    await cleanup();
  }
});
