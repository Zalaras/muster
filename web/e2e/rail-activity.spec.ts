import { expect, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawStop, rawUserPromptSubmit } from "./helpers/payloads";
import { cardActivityClaude, cardActivityYou, railActivityRadio } from "./helpers/railcards";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
} from "./helpers/session";
import { openSettingsDialog, settingsCloseButton } from "./helpers/theme";

// The turn-aware activity line and
// its `railActivity` pref: the journeys where a turn's hooks or a prefs round-trip drive
// the line. The display properties — the Settings fieldset, Both mode's per-side show/hide
// and the failed-turn last-reply rule for a given snapshot — are render tests in
// web/render/rail.spec.ts (plans/_audit/relevel/rail.md). Fixture plan header:
// `prefs.railActivity` is daemon-global, so every test takes the per-test `daemon`
// fixture (helpers/fixtures.ts).

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
