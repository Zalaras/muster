import {
  computed,
  deleteWarning,
  type EffortSession,
  effortStrip,
  effText,
  endSession,
  focusSession,
  headerEff,
  headerModel,
  launchBound,
  OPUS_5_5,
  postEffort,
  settledRows,
  stripDismiss,
  stripSentence,
  tokenColour,
  trackEffortUpserts,
  untouchedByStatus,
  wireEffort,
  effortArg,
} from "./helpers/effort";
import { expect, type Page, settleFor, test } from "./helpers/fixtures";
import { focusedNode, tagNode } from "./helpers/focus-header";
import { envelopedSessionStart } from "./helpers/payloads";
import { resumeFromCardMenu } from "./helpers/rail-menu";
import { envelopeOpts, findSession, getState, sessionCard } from "./helpers/session";
import { activeElementInsideTerminal, terminalRegion } from "./helpers/terminal";

// Plan effort — the header half: the bracketed effort after the model, the launch-mismatch warning
// strip, its Dismiss, and a card-menu Resume's effort. Acceptance E5 to E15 and E17 with REQ-5 to
// REQ-10, REQ-12, REQ-13 and INV-E1 to INV-E6.
//
// The journeys: a later post changing the header, Dismiss and its DELETE round-trip, the warning
// across reloads, restarts, a /clear rebind and a killed daemon, the size note's rows, and the
// card-menu Resume's `--effort`. What the header shows for a given state — the unreported `(…)` and
// the bracketless dead model (E5, E6), the clamped and the no-effort strips (E8, E9), the strip's
// geometry, its wrap at five widths and the --warn family per theme (REQ-12) — moved to the render
// tier on 2026-10-20: web/render/focus.spec.ts against the `effort-header` and `effort-warned-*`
// fixtures (plans/_audit/relevel/focus.md).
//
// Daemon shape (the plan's Fixture plan header): every test takes the per-test `daemon` fixture —
// the warning-survives-restart criterion restarts the daemon and the daemon-down one kills it.
//
// Claude Code is faked: the status line's `effort.level` is synthesized (helpers/effort.ts) from
// kb:fact/status-line-effort-key, as a close pair per kb:fact/status-posts-arrive-in-pairs. Models
// follow kb:fact/effort-levels-per-model: Opus 4.5 clamps `max` to `high`, Haiku 4.5 posts no key.

const clamped = (requested: string, model: string, actual: string) =>
  `Asked for ${requested} — ${model} started at ${actual}.`;

/** A session launched at `max` on Opus 4.5 whose first post reported `high`: the clamped warning. */
async function warnedSession(
  page: Page,
  request: Parameters<typeof launchBound>[1],
  daemon: Parameters<typeof launchBound>[2],
  title: string,
): Promise<EffortSession> {
  const s = await launchBound(page, request, daemon, { title, model: "opus", effort: "max" });
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(effortStrip(page)).toHaveCount(1);
  return s;
}

// --- the bracketed effort (REQ-5, REQ-6) ---

test("a later post with another level changes the header to it with no strip, and a post with no effort key drops the brackets and reads {level: null}, never null (REQ-5, REQ-6, E7, INV-E4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, { title: "effort-live", model: "opus" });

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  expect(await effText(page)).toBe(" (high)");
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: "high" });

  // E7: /effort low, seen only on the next status post.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "low" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (low)");
  expect(await effText(page)).toBe(" (low)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: "low" });

  // /model to a model without effort: the key is absent, so the brackets go.
  await postEffort(request, daemon, s.session, s.claudeId, { level: null });
  await expect(headerModel(page)).toHaveText("Haiku 4.5");
  await expect(headerEff(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: null });

  // And back: the brackets return with the reported level.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
});

test("a status post that changes only the effort never changes state, stateSince, attention, failure, alive, permissionMode or compactions (INV-E5)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, { title: "effort-inv-e5", model: "opus" });
  const before = untouchedByStatus(findSession(await getState(page, daemon), s.session.id));

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  await postEffort(request, daemon, s.session, s.claudeId, { level: "xhigh" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (xhigh)");
  await postEffort(request, daemon, s.session, s.claudeId, { level: null });
  await expect(headerModel(page)).toHaveText("Haiku 4.5");

  expect(untouchedByStatus(findSession(await getState(page, daemon), s.session.id))).toEqual(
    before,
  );
});

test("a changed effort is broadcast as exactly one session upsert and an unchanged one as none (REQ-5, D5)", async ({
  page,
  request,
  daemon,
}) => {
  const upserts = trackEffortUpserts(page);
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, { title: "effort-upserts", model: "opus" });
  const id = s.session.id;

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect
    .poll(() => upserts.forSession(id).some((u) => u.effort?.level === "high"))
    .toBe(true);
  await settleFor(page, 500);
  const afterFirst = upserts.forSession(id).length;

  // The same pair again: nothing changed, nothing broadcast.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await settleFor(page, 800);
  expect(upserts.forSession(id)).toHaveLength(afterFirst);

  // A new level, everything else identical: exactly one upsert, carrying it.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "low" });
  await expect.poll(() => upserts.forSession(id).some((u) => u.effort?.level === "low")).toBe(true);
  await settleFor(page, 500);
  expect(upserts.forSession(id)).toHaveLength(afterFirst + 1);
  expect(upserts.forSession(id).at(-1)?.effort).toEqual({ level: "low" });
});

test("a level outside the five is shown and stored verbatim and compared verbatim against the request (REQ-5, D5)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-verbatim",
    model: "opus",
    effort: "high",
  });

  await postEffort(request, daemon, s.session, s.claudeId, { level: "ultra" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (ultra)");
  expect(await effText(page)).toBe(" (ultra)");
  const wire = await wireEffort(page, daemon, s.session.id);
  expect(wire.effort).toEqual({ level: "ultra" });
  expect(wire.effortWarning).toEqual({ requested: "high", actual: "ultra", model: "Opus 4.5" });
  await expect(effortStrip(page)).toContainText("started at ultra");
});

test("effort survives Stop, a /clear rebind and a daemon restart: a dead session that reported keeps its level, and none of them nulls it (INV-E4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, { title: "effort-keeps", model: "opus" });
  await postEffort(request, daemon, s.session, s.claudeId, { level: "xhigh" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (xhigh)");

  // /clear: a new claude session id in the same pane.
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart("claude-effort-keeps-2", {
      ...(await envelopeOpts(s.session, daemon)),
      source: "clear",
      model: null,
    }),
  });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (xhigh)");
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: "xhigh" });

  // A restart while the pane lives: an already-ended row is swept at the next start
  // (kb:adr/lifecycle-ended-rows-swept-next-start), a live one is kept with its stored effort.
  await daemon.restart();
  await expect
    .poll(async () => (await wireEffort(page, daemon, s.session.id)).effort)
    .toEqual({ level: "xhigh" });
  await page.reload();
  await focusSession(page, "effort-keeps");
  await expect(headerModel(page)).toHaveText("Opus 4.5 (xhigh)");

  await endSession(page, daemon, s.session.id);
  await expect(page.locator("#mainhead .meta .ended-at")).toBeVisible();
  await expect(headerModel(page)).toHaveText("Opus 4.5 (xhigh)");
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: "xhigh" });
});

// --- the launch-mismatch warning (REQ-7, REQ-8) ---

test("a launch whose first post reports the level it asked for shows no strip, and a later post at another level never raises one (REQ-7, E10, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-matching",
    model: "opus",
    effort: "max",
  });

  await postEffort(request, daemon, s.session, s.claudeId, { level: "max", model: OPUS_5_5 });
  await expect(headerModel(page)).toHaveText("Opus 5.5 (max)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();

  // /effort low: a later report, never checked against the launch.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "low", model: OPUS_5_5 });
  await expect(headerModel(page)).toHaveText("Opus 5.5 (low)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("a default launch shows no strip after its first post, whatever level that reports, and none after a later one (REQ-7, E10, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-default-no-warn",
    model: "opus",
    effort: null,
  });

  await postEffort(request, daemon, s.session, s.claudeId, { level: "medium", model: OPUS_5_5 });
  await expect(headerModel(page)).toHaveText("Opus 5.5 (medium)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();

  await postEffort(request, daemon, s.session, s.claudeId, { level: "max", model: OPUS_5_5 });
  await expect(headerModel(page)).toHaveText("Opus 5.5 (max)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("a bystander's first report never sets or clears another session's warning (INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const pending = await launchBound(page, request, daemon, {
    title: "effort-pending-a",
    model: "opus",
    effort: "max",
  });
  const bystander = await launchBound(page, request, daemon, {
    title: "effort-bystander-b",
    model: "opus",
    effort: "low",
  });

  // The bystander reports first, clamped differently: A's pending check is untouched.
  await postEffort(request, daemon, bystander.session, bystander.claudeId, { level: "high" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  await expect(effortStrip(page)).toHaveCount(1);
  expect((await wireEffort(page, daemon, pending.session.id)).effortWarning).toBeNull();
  expect((await wireEffort(page, daemon, pending.session.id)).effort).toBeNull();

  // A's own first report is still checked.
  await postEffort(request, daemon, pending.session, pending.claudeId, { level: "high" });
  await expect
    .poll(async () => (await wireEffort(page, daemon, pending.session.id)).effortWarning)
    .toEqual({ requested: "max", actual: "high", model: "Opus 4.5" });
  expect((await wireEffort(page, daemon, bystander.session.id)).effortWarning).toEqual({
    requested: "low",
    actual: "high",
    model: "Opus 4.5",
  });
});

// --- Dismiss (REQ-9) ---

test("Dismiss removes the strip and the tint, leaves the effort and the model as they were, and persists the clear (REQ-9, E8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-dismiss");
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  const warnColour = await tokenColour(page, "--warn");
  await expect.poll(() => computed(headerEff(page), "color")).toBe(warnColour);

  await stripDismiss(page).click();

  await expect(effortStrip(page)).toHaveCount(0);
  await expect(headerEff(page)).not.toHaveClass(/\bwarn\b/);
  // A positive value: the tint is gone when .eff resolves to the colour .model itself has.
  await expect.poll(() => computed(headerModel(page), "color")).toMatch(/^rgb/);
  await expect
    .poll(
      async () =>
        (await computed(headerEff(page), "color")) === (await computed(headerModel(page), "color")),
    )
    .toBe(true);
  await expect.poll(() => computed(headerEff(page), "color")).not.toBe(warnColour);
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  expect(await wireEffort(page, daemon, s.session.id)).toEqual({
    effort: { level: "high" },
    effortWarning: null,
  });

  // A later report at the same level does not bring it back (INV-E2: dismissed source state).
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await postEffort(request, daemon, s.session, s.claudeId, { level: "low" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (low)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("Dismiss is reachable and activates from the keyboard (REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await warnedSession(page, request, daemon, "effort-dismiss-key");

  // Setup, not evidence: focus on the button. The key press is the activation.
  await stripDismiss(page).focus();
  await expect(stripDismiss(page)).toBeFocused();
  await tagNode(stripDismiss(page), "dismiss");
  await settleFor(page, 1_200);
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "dismiss" });

  await page.keyboard.press("Enter");

  await expect(effortStrip(page)).toHaveCount(0);
  await expect(headerEff(page)).not.toHaveClass(/\bwarn\b/);
});

test("the header's effort node survives render ticks and a repeat post of the same level, still reading its bracket and tint (REQ-6, REQ-8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-node-identity");
  await expect(headerEff(page)).toHaveText(" (high)");
  await tagNode(headerEff(page), "eff");

  await settleFor(page, 2_500);
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await settleFor(page, 1_500);

  await expect(page.locator('#mainhead .meta .model .eff[data-e2e-node="eff"]')).toHaveText(
    " (high)",
  );
  await expect(page.locator("#mainhead .meta .model .eff")).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  await expect
    .poll(() => computed(headerEff(page), "color"))
    .toBe(await tokenColour(page, "--warn"));
});

test("DELETE /api/sessions/{id}/effort-warning answers 204, broadcasts one upsert, answers 204 again with none, and 404 unknown_session for an id that does not exist (REQ-9, D13)", async ({
  page,
  request,
  daemon,
}) => {
  const upserts = trackEffortUpserts(page);
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-delete-api");
  const id = s.session.id;
  await settleFor(page, 500);
  const before = upserts.forSession(id).length;

  const first = await deleteWarning(page, daemon, id);
  expect(first.status()).toBe(204);
  expect(await first.text()).toBe("");
  await expect.poll(() => upserts.forSession(id).length).toBe(before + 1);
  expect(upserts.forSession(id).at(-1)?.effortWarning).toBeNull();
  expect(upserts.forSession(id).at(-1)?.effort).toEqual({ level: "high" });

  // A second window racing the same Dismiss: 204 and no broadcast.
  const second = await deleteWarning(page, daemon, id);
  expect(second.status()).toBe(204);
  await settleFor(page, 800);
  expect(upserts.forSession(id)).toHaveLength(before + 1);

  const unknown = await deleteWarning(page, daemon, 987654);
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({
    error: { code: "unknown_session", message: "unknown session id" },
  });
});

test("DELETE /api/sessions/{id}/effort-warning without the UI cookie is refused 401 unauthorized and leaves the warning set (REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-delete-401");

  const res = await request.delete(`${daemon.baseURL}/api/sessions/${s.session.id}/effort-warning`);
  expect(res.status()).toBe(401);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthorized");
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).not.toBeNull();
  await expect(effortStrip(page)).toHaveCount(1);
});

test("with two warned sessions, Dismiss on one removes its strip and tint in both dashboards at once, and the other session's strip and warning remain (REQ-9, E12, INV-E3)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await warnedSession(page, request, daemon, "effort-two-a");
  const b = await warnedSession(page, request, daemon, "effort-two-b");

  const other = await page.context().newPage();
  await other.goto(daemon.dashboardUrl);
  await focusSession(other, "effort-two-a");
  await expect(effortStrip(other)).toHaveCount(1);
  await expect(headerEff(other)).toHaveClass(/\bwarn\b/);

  // Dismiss A in the first dashboard; the second, sitting on A, loses it live.
  await focusSession(page, "effort-two-a");
  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);
  await expect(effortStrip(other)).toHaveCount(0);
  await expect(headerEff(other)).not.toHaveClass(/\bwarn\b/);
  await expect(headerModel(other)).toHaveText("Opus 4.5 (high)");

  // B is untouched in both, on the wire and on screen.
  expect((await wireEffort(page, daemon, a.session.id)).effortWarning).toBeNull();
  expect((await wireEffort(page, daemon, b.session.id)).effortWarning).toEqual({
    requested: "max",
    actual: "high",
    model: "Opus 4.5",
  });
  await focusSession(page, "effort-two-b");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  await focusSession(other, "effort-two-b");
  await expect(effortStrip(other)).toHaveCount(1);
  await expect(headerEff(other)).toHaveClass(/\bwarn\b/);
});

// --- persistence and connection (E11, E13) ---

test("an undismissed strip survives a page reload, appears in a second dashboard on the same daemon, and survives a daemon restart (REQ-7, E11, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-persist");
  const warning = { requested: "max", actual: "high", model: "Opus 4.5" };

  await page.reload();
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);

  const second = await page.context().newPage();
  await second.goto(daemon.dashboardUrl);
  await expect.poll(() => stripSentence(second)).toBe(clamped("max", "Opus 4.5", "high"));
  await expect(headerEff(second)).toHaveClass(/\bwarn\b/);

  await daemon.restart();
  await expect
    .poll(async () => (await wireEffort(page, daemon, s.session.id)).effortWarning)
    .toEqual(warning);
  await page.reload();
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
});

test("a launch whose check is still pending when the daemon restarts is still checked on the first post after it (INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-pending-restart",
    model: "opus",
    effort: "max",
  });

  await daemon.restart();
  await page.reload();
  await expect(headerModel(page)).toHaveText(/\(…\)$/);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toEqual({
    requested: "max",
    actual: "high",
    model: "Opus 4.5",
  });
});

test("a /clear rebind leaves a set warning and a pending check as they were, so the next post is still the one checked (INV-E2, INV-E3)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  // A warning set before the rebind stays after it.
  const warned = await warnedSession(page, request, daemon, "effort-clear-warned");
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart("claude-effort-clear-warned-2", {
      ...(await envelopeOpts(warned.session, daemon)),
      source: "clear",
      model: null,
    }),
  });
  await expect
    .poll(
      async () =>
        (await getState(page, daemon)).sessions.find((x) => x.id === warned.session.id)
          ?.claudeSessionId,
    )
    .toBe("claude-effort-clear-warned-2");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  expect((await wireEffort(page, daemon, warned.session.id)).effortWarning).toEqual({
    requested: "max",
    actual: "high",
    model: "Opus 4.5",
  });

  // A check pending before the rebind is still pending after it.
  const pending = await launchBound(page, request, daemon, {
    title: "effort-clear-pending",
    model: "opus",
    effort: "max",
  });
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart("claude-effort-clear-pending-2", {
      ...(await envelopeOpts(pending.session, daemon)),
      source: "clear",
      model: null,
    }),
  });
  await expect
    .poll(
      async () =>
        (await getState(page, daemon)).sessions.find((x) => x.id === pending.session.id)
          ?.claudeSessionId,
    )
    .toBe("claude-effort-clear-pending-2");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, pending.session.id)).effort).toBeNull();
  await postEffort(request, daemon, pending.session, "claude-effort-clear-pending-2", {
    level: "high",
  });
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));
});

test("with the daemon killed the header keeps its effort and the strip stays, a Dismiss then fails into the action-error line, and works once the daemon is back (REQ-8, E13)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-down");

  await daemon.kill();
  await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);

  // The connection-level failure: the request never gets an answer.
  await stripDismiss(page).click();
  await expect(page.locator("#action-error")).toBeVisible();
  await expect(page.locator("#action-error")).toHaveText("Could not reach musterd.");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);

  await daemon.restart();
  await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
  // The unreachable message goes with the outage: the line clears when the connection returns,
  // before any later action replaces it (#e8, REQ-9).
  await expect(page.locator("#action-error")).toBeHidden();
  await expect(effortStrip(page)).toHaveCount(1);
  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("a Dismiss the daemon answers with a 500 leaves the strip and the tint and reports the failure in the action-error line, and a retry succeeds (REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-dismiss-500");
  await page.route("**/api/sessions/*/effort-warning", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "boom" } }),
    }),
  );

  await stripDismiss(page).click();
  await expect(page.locator("#action-error")).toBeVisible();
  await expect(page.locator("#action-error")).not.toHaveText("");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).not.toBeNull();

  await page.unroute("**/api/sessions/*/effort-warning");
  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);
  await expect(headerEff(page)).not.toHaveClass(/\bwarn\b/);
});

test("a daemon refusal shown in the action-error line survives the daemon going away and coming back (REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await warnedSession(page, request, daemon, "effort-refusal-survives");
  await page.route("**/api/sessions/*/effort-warning", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "boom" } }),
    }),
  );

  await stripDismiss(page).click();
  await expect(page.locator("#action-error")).toHaveText("boom");

  await daemon.kill();
  await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeVisible();
  await daemon.restart();
  await expect(page.getByRole("alert").filter({ hasText: /musterd unreachable/i })).toBeHidden();
  // A refusal is not about reachability: it stays after the reconnect's hello.
  await settleFor(page, 1000);
  await expect(page.locator("#action-error")).toHaveText("boom");
  await expect(effortStrip(page)).toHaveCount(1);
});

test("a Dismiss whose request is aborted before any answer leaves the strip and the tint and reports the failure in the action-error line (REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-dismiss-abort");
  await page.route("**/api/sessions/*/effort-warning", (route) => route.abort("failed"));

  await stripDismiss(page).click();
  await expect(page.locator("#action-error")).toBeVisible();
  await expect(page.locator("#action-error")).not.toHaveText("");
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).not.toBeNull();
});

// --- layout (REQ-12, REQ-13, INV-E6) ---

test("the size note's row count drops when the strip appears and returns when it is dismissed, and the terminal never sits under the strip (REQ-13, E14, INV-E6)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-geometry",
    model: "opus",
    effort: "max",
  });
  await expect(terminalRegion(page, "effort-geometry")).toContainText("MUSTER-STUB-READY");
  const rowsBefore = await settledRows(page, daemon, s.session.tmuxTarget);

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(effortStrip(page)).toHaveCount(1);
  // Both sides re-read inside the retry: the size note and tmux's own window height.
  await expect
    .poll(async () => await settledRows(page, daemon, s.session.tmuxTarget))
    .toBeLessThan(rowsBefore);

  const [strip, terminal] = await Promise.all([
    effortStrip(page).boundingBox(),
    terminalRegion(page, "effort-geometry").boundingBox(),
  ]);
  if (!strip || !terminal) throw new Error("expected the strip and the terminal to be laid out");
  expect(strip.y + strip.height).toBeLessThanOrEqual(terminal.y + 1);

  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);
  await expect
    .poll(async () => await settledRows(page, daemon, s.session.tmuxTarget))
    .toBe(rowsBefore);
});

test("a terminal that holds keyboard focus keeps the same focused node when the strip appears and across a render tick (REQ-13, INV-E6)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-term-focus",
    model: "opus",
    effort: "max",
  });
  await expect(terminalRegion(page, "effort-term-focus")).toContainText("MUSTER-STUB-READY");
  await terminalRegion(page, "effort-term-focus").click();
  await expect.poll(() => activeElementInsideTerminal(page, "effort-term-focus")).toBe(true);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement).dataset.e2eNode = "term-focus";
  });

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(effortStrip(page)).toHaveCount(1);
  await settleFor(page, 1_200);

  expect(await activeElementInsideTerminal(page, "effort-term-focus")).toBe(true);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.e2eNode)).toBe(
    "term-focus",
  );
});

test("the strip belongs to the Focus view only: Tiles shows none, and Focus shows it again (REQ-8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await warnedSession(page, request, daemon, "effort-views");

  await page.getByRole("button", { name: "Tiles" }).click();
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(effortStrip(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Focus" }).click();
  await expect(effortStrip(page)).toHaveCount(1);
  await expect(headerEff(page)).toHaveClass(/\bwarn\b/);
});

// --- the card-menu Resume (REQ-10, E15, E17) ---

test("Resume from the card menu on a session whose last post reported medium spawns the pane with --effort medium and the header reads (medium) before any new post (REQ-10, E15)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-resume-medium",
    model: "opus",
  });
  await postEffort(request, daemon, s.session, s.claudeId, { level: "medium" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (medium)");

  await endSession(page, daemon, s.session.id);
  await expect(sessionCard(page, "effort-resume-medium")).toHaveClass(/ended/);
  await expect(headerModel(page)).toHaveText("Opus 4.5 (medium)");

  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-medium"));

  const resumed = findSession(await getState(page, daemon), s.session.id);
  expect(resumed.alive).toBe(true);
  const startCommand = await daemon.paneStartCommand(resumed.tmuxTarget);
  expect(startCommand).toContain(`--resume ${s.claudeId}`);
  expect(effortArg(startCommand)).toBe("medium");
  // No post since the resume: the level is the row's own, shown at once.
  await expect(headerModel(page)).toHaveText("Opus 4.5 (medium)");
  expect(await effText(page)).toBe(" (medium)");
  expect((await wireEffort(page, daemon, s.session.id)).effort).toEqual({ level: "medium" });
});

test("Resume from the card menu passes no --effort for a session that never reported or reported no effort, and keeps its effort exactly as it was (REQ-10, INV-E4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);

  const never = await launchBound(page, request, daemon, {
    title: "effort-resume-never",
    model: "opus",
  });
  await endSession(page, daemon, never.session.id);
  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-never"));
  const neverResumed = findSession(await getState(page, daemon), never.session.id);
  expect(await daemon.paneStartCommand(neverResumed.tmuxTarget)).not.toContain("--effort");
  expect((await wireEffort(page, daemon, never.session.id)).effort).toBeNull();
  await expect(headerModel(page)).toHaveText(/\(…\)$/);

  const bare = await launchBound(page, request, daemon, {
    title: "effort-resume-bare",
    model: "haiku",
  });
  await postEffort(request, daemon, bare.session, bare.claudeId, { level: null });
  await expect(headerModel(page)).toHaveText("Haiku 4.5");
  await endSession(page, daemon, bare.session.id);
  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-bare"));
  const bareResumed = findSession(await getState(page, daemon), bare.session.id);
  expect(await daemon.paneStartCommand(bareResumed.tmuxTarget)).not.toContain("--effort");
  expect((await wireEffort(page, daemon, bare.session.id)).effort).toEqual({ level: null });
  await expect(headerModel(page)).toHaveText("Haiku 4.5");
  await expect(headerEff(page)).toHaveCount(0);
});

test("a card-menu resume of a warned session keeps the existing warning, raises no new one after its first post, and the warning stays until dismissed (REQ-10, E17, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-resume-warned");
  const warning = { requested: "max", actual: "high", model: "Opus 4.5" };

  await endSession(page, daemon, s.session.id);
  await expect(sessionCard(page, "effort-resume-warned")).toHaveClass(/ended/);
  await expect(effortStrip(page)).toHaveCount(1);
  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-warned"));

  const resumed = findSession(await getState(page, daemon), s.session.id);
  expect(effortArg(await daemon.paneStartCommand(resumed.tmuxTarget))).toBe("high");
  await expect(effortStrip(page)).toHaveCount(1);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toEqual(warning);

  // The resumed process's first post reports what the resume passed: no re-check, nothing new.
  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await settleFor(page, 800);
  await expect(effortStrip(page)).toHaveCount(1);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toEqual(warning);
  await expect.poll(() => stripSentence(page)).toBe(clamped("max", "Opus 4.5", "high"));

  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);
});

test("a card-menu resume of a session whose warning was dismissed raises none after its first post (REQ-7, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await warnedSession(page, request, daemon, "effort-resume-dismissed");
  await stripDismiss(page).click();
  await expect(effortStrip(page)).toHaveCount(0);

  await endSession(page, daemon, s.session.id);
  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-dismissed"));
  await postEffort(request, daemon, s.session, s.claudeId, { level: "low" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (low)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("a card-menu resume of a session that ended before its first post cancels the pending check, so its later first post raises no warning (REQ-7, REQ-10, INV-E2)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const s = await launchBound(page, request, daemon, {
    title: "effort-resume-pending",
    model: "opus",
    effort: "max",
  });
  await endSession(page, daemon, s.session.id);
  await resumeFromCardMenu(page, sessionCard(page, "effort-resume-pending"));
  const resumed = findSession(await getState(page, daemon), s.session.id);
  expect(await daemon.paneStartCommand(resumed.tmuxTarget)).not.toContain("--effort");

  await postEffort(request, daemon, s.session, s.claudeId, { level: "high" });
  await expect(headerModel(page)).toHaveText("Opus 4.5 (high)");
  await expect(effortStrip(page)).toHaveCount(0);
  expect((await wireEffort(page, daemon, s.session.id)).effortWarning).toBeNull();
});

test("card-menu resumes of two sessions each pass their own level and leave the other's untouched (REQ-10)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchBound(page, request, daemon, { title: "effort-multi-a", model: "opus" });
  const b = await launchBound(page, request, daemon, { title: "effort-multi-b", model: "opus" });
  await postEffort(request, daemon, a.session, a.claudeId, { level: "low" });
  await postEffort(request, daemon, b.session, b.claudeId, { level: "xhigh", model: OPUS_5_5 });

  await focusSession(page, "effort-multi-a");
  await endSession(page, daemon, a.session.id);
  await resumeFromCardMenu(page, sessionCard(page, "effort-multi-a"));

  const state = await getState(page, daemon);
  expect(
    effortArg(await daemon.paneStartCommand(findSession(state, a.session.id).tmuxTarget)),
  ).toBe("low");
  expect(findSession(state, b.session.id).alive).toBe(true);
  expect((await wireEffort(page, daemon, b.session.id)).effort).toEqual({ level: "xhigh" });
  await focusSession(page, "effort-multi-b");
  await expect(headerModel(page)).toHaveText("Opus 5.5 (xhigh)");
});
