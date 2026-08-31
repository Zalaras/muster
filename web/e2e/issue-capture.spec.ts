import { expect, test, type Locator, type Page } from "@playwright/test";
import { ISSUE_REPO_FIXTURE, type ScratchDaemon, type ScratchDaemonOptions, startScratchDaemon } from "./helpers/daemon";
import { FAKE_GH_TOKEN, FakeGitHubAPI, issueTokenFileContent } from "./helpers/ghapi";
import {
  DASHBOARD_SCOPE_OPTION_TEXT,
  issueButton,
  issueCancelButton,
  issueCapturedAt,
  issueCloseButton,
  issueErrorDetail,
  issueErrorSummary,
  issueNoteTextarea,
  issuePreview,
  issuePreviewHeading,
  issueSessionOptions,
  issueSessionSelect,
  issueSubmitButton,
  issueSuccessLink,
  issueSuccessStatus,
  issueTitleInput,
  openIssueDialog,
} from "./helpers/issue";
import { envelopedSessionStart, rawStopFailure, rawUserPromptSubmit } from "./helpers/payloads";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";

// Plan issue-capture — E1 through E8, plus REQ-1 (masthead button) and REQ-6/Edge Case
// 20 (client-side Submit gating), which have no dedicated E-acceptance id but are
// Must-Have requirements this suite still owes coverage. Nothing here reaches real
// GitHub or runs a real `gh`: every daemon in this file gets `-issue-api-url` and
// `-issue-token-file` unconditionally (helpers/daemon.ts, REQ-17) — either pointed at a
// local `FakeGitHubAPI` (helpers/ghapi.ts) this file starts and controls, or at the
// daemon's own per-run deny stub for tests that never call POST /api/issues.
//
// Every test gets its own daemon (`withIssueDaemon`): the capture store and the
// `-issue-api-url` binding are both daemon-global, and several tests configure a
// `FakeGitHubAPI`'s response mid-test — sharing a daemon/fake pair across concurrently
// running tests (this config is `fullyParallel`) would race those responses, mirroring
// usage-model.spec.ts's `withUsageDaemon` rationale.

interface CaptureSnapshotSession {
  context: unknown;
  model: unknown;
  tmuxTarget: string;
  failure?: { error: string };
}

interface CaptureSnapshot {
  session?: CaptureSnapshotSession;
  [key: string]: unknown;
}

interface CaptureResponse {
  captureId: string;
  capturedAt: string;
  snapshot: CaptureSnapshot;
  snapshotMarkdown: string;
}

async function withIssueDaemon(
  opts: ScratchDaemonOptions,
  fn: (daemon: ScratchDaemon) => Promise<void>,
): Promise<void> {
  const daemon = await startScratchDaemon(opts);
  try {
    await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

/** Resolves with the JSON body of the next `POST /api/issue/captures` response — the
 * request the dialog fires the instant it opens (plan User Flows step 2). Must be
 * called (not awaited) BEFORE the action that opens the dialog, since it registers the
 * listener synchronously up to its first `await`. */
async function waitForCapture(page: Page, daemon: ScratchDaemon): Promise<CaptureResponse> {
  const res = await page.waitForResponse(
    (r) => r.url() === `${daemon.baseURL}/api/issue/captures` && r.request().method() === "POST",
  );
  return (await res.json()) as CaptureResponse;
}

/** Opens the dialog and returns both its locator and the capture response the open
 * triggered, so a test can assert on the wire shape directly rather than only the DOM. */
async function openIssueDialogAndCapture(
  page: Page,
  daemon: ScratchDaemon,
): Promise<{ dialog: Locator; capture: CaptureResponse }> {
  const capturePromise = waitForCapture(page, daemon);
  const dialog = await openIssueDialog(page);
  const capture = await capturePromise;
  return { dialog, capture };
}

test("the Issue button is visible in both Focus and Tiles (REQ-1)", async ({ page }) => {
  await withIssueDaemon({}, async (daemon) => {
    await page.goto(daemon.dashboardUrl);

    await expect(issueButton(page)).toBeVisible();
    await expect(issueButton(page)).toHaveCSS("opacity", "1");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(issueButton(page)).toBeVisible();
    await expect(issueButton(page)).toHaveCSS("opacity", "1");
  });
});

test("sentinel title/directory/last-assistant-message never leak into the preview, the capture response, or the posted GitHub body, with bystander sessions present (E1, INV-1)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    gh.setResponse(201, { number: 42, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/42` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory("SENTINEL-DIR-e1-");
        const { path: dirB, cleanup: cleanupB } = await scratchDirectory();
        const { path: dirC, cleanup: cleanupC } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);

          // Bystanders (INV-1's "with other sessions present" bullet): distinct
          // identifying data that must leave no trace in a capture scoped to a
          // different session.
          const bystanderA = await launchSession(page, daemon, { directory: dirB, title: "BYSTANDER-A-9f2" });
          const bystanderB = await launchSession(page, daemon, { directory: dirC, title: "BYSTANDER-B-9f2" });

          const session = await launchSession(page, daemon, { directory: dir, title: "SENTINEL-TITLE-9f2" });
          const claudeId = "claude-e1-sentinel";
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart(claudeId, { musterSession: session.id }),
          });
          await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
          // StopFailure is the only hook that sets `Failure.Message` (= the raw
          // `last_assistant_message`, hard exclusion 5) — the sentinel that matters
          // most, since `Failure.Error` (a different string) IS allowlisted.
          await request.post(daemon.ingestURL("hook"), {
            data: rawStopFailure(claudeId, { error: "server_error", lastAssistantMessage: "SENTINEL-ASSISTANT-MSG-9f2" }),
          });

          await sessionCard(page, "SENTINEL-TITLE-9f2").click();

          const { dialog, capture } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);

          const forbidden = [
            dir,
            dirB,
            dirC,
            "SENTINEL-TITLE-9f2",
            "SENTINEL-ASSISTANT-MSG-9f2",
            "BYSTANDER-A-9f2",
            "BYSTANDER-B-9f2",
            bystanderA.tmuxTarget,
            bystanderB.tmuxTarget,
          ];

          const snapshotJson = JSON.stringify(capture.snapshot);
          const previewText = (await issuePreview(dialog).textContent()) ?? "";
          for (const needle of forbidden) {
            expect(snapshotJson, `snapshot must not contain ${JSON.stringify(needle)}`).not.toContain(needle);
            expect(capture.snapshotMarkdown, `snapshotMarkdown must not contain ${JSON.stringify(needle)}`).not.toContain(
              needle,
            );
            expect(previewText, `#issue-preview must not contain ${JSON.stringify(needle)}`).not.toContain(needle);
          }

          // Positive controls: the allowlisted error TOKEN (distinct from the excluded
          // message) and the focused session's own tmuxTarget — an independent-oracle
          // equality, not a substring guess — both legitimately appear, proving this
          // captured the right session rather than merely nothing.
          expect(snapshotJson).toContain("server_error");
          expect(previewText).toContain("server_error");
          expect(capture.snapshot.session?.tmuxTarget).toBe(session.tmuxTarget);

          await issueTitleInput(dialog).fill("sentinel check");
          await issueSubmitButton(dialog).click();
          await expect(issueSuccessStatus(dialog)).toBeVisible();

          expect(gh.requests.length).toBe(1);
          const postedBody = gh.lastRequest?.body?.body ?? "";
          for (const needle of forbidden) {
            expect(postedBody, `posted body must not contain ${JSON.stringify(needle)}`).not.toContain(needle);
          }
          expect(postedBody).toContain("server_error");
        } finally {
          await cleanup();
          await cleanupB();
          await cleanupC();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("the preview text at submit time is byte-identical to the body the fake GitHub receives, for an empty note and no sessions (E2, INV-2, Edge Case 15)", async ({
  page,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    gh.setResponse(201, { number: 7, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/7` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        await page.goto(daemon.dashboardUrl);

        // No sessions launched at all — Edge Case 15: the select holds only the
        // dashboard option, and a dashboard-scope capture files normally.
        const { dialog, capture } = await openIssueDialogAndCapture(page, daemon);
        expect(capture.snapshot.session).toBeUndefined();
        await expect(issuePreviewHeading(dialog)).toBeVisible();
        await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
        await expect(issueCapturedAt(dialog)).not.toHaveText("");
        await expect(issueSessionOptions(dialog)).toHaveCount(1);

        const previewText = await issuePreview(dialog).textContent();
        await issueTitleInput(dialog).fill("empty note check");
        await issueSubmitButton(dialog).click();
        await expect(issueSuccessStatus(dialog)).toBeVisible();

        expect(gh.requests.length).toBe(1);
        expect(gh.lastRequest?.body?.body).toBe(previewText);
        // No note typed — the body is the snapshot markdown alone, with no
        // "## What happened" section.
        expect(gh.lastRequest?.body?.body).not.toContain("## What happened");
      },
    );
  } finally {
    await gh.stop();
  }
});

test("the preview text at submit time is byte-identical to the body the fake GitHub receives, for a note with backticks, a fence, a pipe and </details>, typed via real keystrokes (E2, INV-2)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    gh.setResponse(201, { number: 8, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/8` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "e2-tricky-note" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-e2-tricky", { musterSession: session.id }),
          });
          await sessionCard(page, "e2-tricky-note").click();

          const { dialog } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
          await issueTitleInput(dialog).fill("tricky note check");

          // Real per-key events — not `.fill()` — so this is a genuine keyboard round
          // trip through the live-preview wiring (REQ-7), not a value set from outside
          // the page.
          const note = "line one with `code` and a | pipe\n```fence```\nand a </details> tag";
          const textarea = issueNoteTextarea(dialog);
          await textarea.click();
          await textarea.pressSequentially(note, { delay: 5 });

          // Live update, before Submit: the note section is already in the preview.
          await expect(issuePreview(dialog)).toContainText("## What happened");
          await expect(issuePreview(dialog)).toContainText("`code`");

          const previewText = await issuePreview(dialog).textContent();
          await issueSubmitButton(dialog).click();
          await expect(issueSuccessStatus(dialog)).toBeVisible();

          expect(gh.requests.length).toBe(1);
          const posted = gh.lastRequest?.body?.body ?? "";
          expect(posted).toBe(previewText);
          expect(posted).toContain("`code`");
          expect(posted).toContain("| pipe");
          expect(posted).toContain("</details>");
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("filing succeeds against the fake GitHub server — Submit disables while the POST is in flight, the success line reads Filed <owner>/<repo>#<n> linked to the returned URL, and Close dismisses the dialog (E3)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "e3-file" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-e3", { musterSession: session.id }),
          });
          await sessionCard(page, "e3-file").click();

          const { dialog } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
          await issueTitleInput(dialog).fill("filed via e2e");

          // Hold-and-release (usage-model.spec.ts E4 pattern): observe the in-flight
          // disabled window deterministically instead of racing a fast fake response.
          gh.setResponse(201, { number: 14, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/14` });
          gh.hold();
          await issueSubmitButton(dialog).click();
          await expect(issueSubmitButton(dialog)).toBeDisabled();

          gh.release();

          await expect(issueSuccessStatus(dialog)).toBeVisible();
          await expect(issueSuccessStatus(dialog)).toHaveText(`Filed ${ISSUE_REPO_FIXTURE}#14`);
          await expect(issueSuccessLink(dialog)).toHaveText(`${ISSUE_REPO_FIXTURE}#14`);
          await expect(issueSuccessLink(dialog)).toHaveAttribute(
            "href",
            `https://github.com/${ISSUE_REPO_FIXTURE}/issues/14`,
          );
          await expect(issueSubmitButton(dialog)).toBeHidden();
          await expect(issueCancelButton(dialog)).toBeHidden();
          await expect(issueCloseButton(dialog)).toBeVisible();

          // REQ-8's protocol contract: the exact headers the daemon must send.
          expect(gh.lastRequest?.authorization).toBe(`Bearer ${FAKE_GH_TOKEN}`);
          expect(gh.lastRequest?.accept).toBe("application/vnd.github+json");
          expect(gh.lastRequest?.apiVersion).toBe("2022-11-28");

          await issueCloseButton(dialog).click();
          await expect(dialog).toBeHidden();
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("a fake GitHub 403 leaves the dialog open with the form intact, shows the alert and selectable detail carrying issue_post_failed, re-enables Submit, and the fake token never appears in the daemon's log (E4, INV-3)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "e4-fail" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-e4", { musterSession: session.id }),
          });
          await sessionCard(page, "e4-fail").click();

          const { dialog } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
          await issueTitleInput(dialog).fill("will fail");

          gh.setResponse(403, { message: "secondary rate limit" });
          await issueSubmitButton(dialog).click();

          await expect(issueErrorSummary(dialog)).toBeVisible();
          await expect(issueErrorSummary(dialog)).toHaveText("Could not file the issue.");
          await expect(issueErrorDetail(dialog)).toBeVisible();
          await expect(issueErrorDetail(dialog)).toHaveText(/^issue_post_failed — /);

          // Form intact, Submit re-enabled — retry works without re-capturing.
          await expect(issueTitleInput(dialog)).toHaveValue("will fail");
          await expect(issueSubmitButton(dialog)).toBeEnabled();
          await expect(issueSuccessStatus(dialog)).toHaveCount(0);
          await expect(dialog).toBeVisible();

          expect(daemon.log).not.toContain(FAKE_GH_TOKEN);
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("a dashboard-scope capture (— none (dashboard only) — selected) posts a body whose table has no session rows (E5)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    gh.setResponse(201, { number: 20, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/20` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "e5-session" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-e5", { musterSession: session.id }),
          });
          await sessionCard(page, "e5-session").click();

          const { dialog, capture } = await openIssueDialogAndCapture(page, daemon);
          // Sanity: default selection (focusedId) is session-scoped.
          expect(capture.snapshot.session).toBeDefined();
          await expect(issueSessionOptions(dialog)).toHaveCount(2);

          const capturePromise = waitForCapture(page, daemon);
          await issueSessionSelect(dialog).selectOption({ label: DASHBOARD_SCOPE_OPTION_TEXT });
          const dashboardCapture = await capturePromise;

          expect(dashboardCapture.snapshot.session).toBeUndefined();
          expect(dashboardCapture.snapshotMarkdown).not.toMatch(/\|\s*state\s*\|/);
          expect(dashboardCapture.snapshotMarkdown).not.toMatch(/\|\s*tmux\s*\|/);
          expect(dashboardCapture.snapshotMarkdown).not.toMatch(/\|\s*model\s*\|/);
          expect(dashboardCapture.snapshotMarkdown).not.toContain(session.tmuxTarget);
          expect(dashboardCapture.snapshotMarkdown).toMatch(/\|\s*dashboard\s*\|/);

          await issueTitleInput(dialog).fill("dashboard scope check");
          await issueSubmitButton(dialog).click();
          await expect(issueSuccessStatus(dialog)).toBeVisible();

          const posted = gh.lastRequest?.body?.body ?? "";
          expect(posted).not.toMatch(/\|\s*state\s*\|/);
          expect(posted).not.toMatch(/\|\s*tmux\s*\|/);
          expect(posted).not.toContain(session.tmuxTarget);
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("killing the daemon disables the Issue button and closes an open dialog; reconnecting re-enables it (E6)", async ({
  page,
}) => {
  await withIssueDaemon({}, async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openIssueDialog(page);
    await expect(dialog).toBeVisible();

    await daemon.kill();
    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    await expect(dialog).toBeHidden();
    await expect(issueButton(page)).toBeDisabled();

    await daemon.restart();
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(issueButton(page)).toBeEnabled();

    // The dialog does not reopen itself (plan States: "On reconnect the button
    // re-enables; the dialog does not reopen itself.").
    await expect(dialog).toBeHidden();
  });
});

test("a session with no context yet renders unknown in the preview, never 0% (E7, REQ-12, Edge Case 16)", async ({
  page,
  request,
}) => {
  await withIssueDaemon({}, async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "e7-unknown" });
      // `POST /api/sessions` requires a non-empty `model` (docs/protocol.md §3.1), and
      // `internal/session/machine.go`'s `applyBind` only ever overwrites `sess.Model`,
      // never nulls it — so `session.model` can never be null for a session reachable
      // through the real launch API. That state (REQ-12's "model" branch) is exercised
      // by the daemon's own `TestRenderSnapshotMarkdown_UnknownRendering` unit test
      // against a directly-constructed Session instead. This test owns the other
      // reachable half of Edge Case 16: `context` stays null until a status line
      // supplies one, which no hook in this test ever sends.
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart("claude-e7", { musterSession: session.id }),
      });
      await sessionCard(page, "e7-unknown").click();

      const { dialog, capture } = await openIssueDialogAndCapture(page, daemon);
      expect(capture.snapshot.session?.context).toBeNull();

      await expect(issuePreview(dialog)).toContainText(/\|\s*context\s*\|\s*unknown\s*\|/);

      const previewText = (await issuePreview(dialog).textContent()) ?? "";
      expect(previewText).not.toContain("0%");
    } finally {
      await cleanup();
    }
  });
});

test("Submit stays disabled until a non-whitespace title is entered via real keystrokes, disables again for whitespace-only, and Cancel closes the dialog (REQ-6, Edge Case 20)", async ({
  page,
  request,
}) => {
  await withIssueDaemon({}, async (daemon) => {
    const { path: dir, cleanup } = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, { directory: dir, title: "e-req6" });
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart("claude-req6", { musterSession: session.id }),
      });
      await sessionCard(page, "e-req6").click();

      const { dialog } = await openIssueDialogAndCapture(page, daemon);
      await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
      await expect(issueSubmitButton(dialog)).toBeDisabled();

      const title = issueTitleInput(dialog);
      await title.click();
      await title.pressSequentially("real title", { delay: 5 });
      await expect(issueSubmitButton(dialog)).toBeEnabled();

      await title.fill("   ");
      await expect(issueSubmitButton(dialog)).toBeDisabled();

      await issueCancelButton(dialog).click();
      await expect(dialog).toBeHidden();
    } finally {
      await cleanup();
    }
  });
});

// Review cycle 1, fix wave 3: coverage for daemon-impl's Fix Attempt 1 (commit 891d392,
// review cycle 1 Minors 1/3/4). Wave 1 changed three behaviours the dialog surface can
// observe; the rune-count fix (Minor 1) is otherwise unit-covered
// (daemon-tests.md's TestHandleCreateIssue_Title/NoteExactly200/8000MultibyteRunesIsAccepted)
// but the dialog is still the only place that proves the browser's own UTF-16-code-unit
// `maxlength="200"` gate and the daemon's `utf8.RuneCountInString` gate agree — that's a
// client+server interaction no Go unit test can exercise, so it gets one E2E test below.

test("a capture consumed by a concurrent filing shows the capture_expired remedy sentence and keeps Submit disabled (Edge Case 2, Minor 3)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    gh.setResponse(201, { number: 30, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/30` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "expired-capture" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-expired", { musterSession: session.id }),
          });
          await sessionCard(page, "expired-capture").click();

          const { dialog, capture } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
          await issueTitleInput(dialog).fill("will be beaten to the post");

          // Consume the exact capture the dialog is holding, out from under it — a real
          // browser cookie'd request (page.request shares the UI cookie), mirroring the
          // daemon's own D10 second-POST-with-a-consumed-id scenario. The dialog does not
          // learn about this; its next Submit click still carries the same captureId.
          const externalFile = await page.request.post(`${daemon.baseURL}/api/issues`, {
            data: { captureId: capture.captureId, title: "filed from elsewhere", note: "" },
          });
          expect(externalFile.status()).toBe(201);

          await issueSubmitButton(dialog).click();

          await expect(issueErrorSummary(dialog)).toBeVisible();
          await expect(issueErrorSummary(dialog)).toHaveText("Could not file the issue.");
          await expect(issueErrorDetail(dialog)).toBeVisible();
          await expect(issueErrorDetail(dialog)).toHaveText(/^capture_expired — /);
          // Minor 3 (review cycle 1) named the remedy; review cycle 2 Minor 1 then
          // dropped the false "this snapshot expired" diagnosis (the daemon doesn't
          // actually know that's why the capture is gone) while keeping the remedy
          // verbatim, reaching the selectable detail line exactly as amended.
          await expect(issueErrorDetail(dialog)).toContainText(
            "capture is unknown, expired, in flight, or already filed; reopen the dialog to take a fresh snapshot",
          );

          // Edge Case 2's behavioural half: unlike a generic filing failure (E4, which
          // re-enables Submit), a capture_expired response nulls the held capture, so
          // Submit stays disabled until the session selection changes or the dialog
          // reopens — a bare retry click cannot resubmit the dead capture.
          await expect(issueSubmitButton(dialog)).toBeDisabled();
          await expect(issueTitleInput(dialog)).toHaveValue("will be beaten to the post");
          await expect(issueSuccessStatus(dialog)).toHaveCount(0);
          await expect(dialog).toBeVisible();

          // Only the externally filed issue exists — the dialog's own click never
          // reached GitHub a second time.
          expect(gh.requests).toHaveLength(1);
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("a 2xx GitHub body with no issue number/URL shows the filing failure state, never Filed <repo>#0 (Minor 4)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "maybe-created" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-maybe-created", { musterSession: session.id }),
          });
          await sessionCard(page, "maybe-created").click();

          const { dialog } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);
          await issueTitleInput(dialog).fill("maybe created upstream");

          // A 2xx body that parses cleanly but carries no usable issue (GitHub's own
          // documented "{}"  edge case) — the daemon must treat this as a failure, not
          // render a `Filed <repo>#0` link to an empty href.
          gh.setResponse(201, {});
          await issueSubmitButton(dialog).click();

          await expect(issueErrorSummary(dialog)).toBeVisible();
          await expect(issueErrorSummary(dialog)).toHaveText("Could not file the issue.");
          await expect(issueErrorDetail(dialog)).toBeVisible();
          await expect(issueErrorDetail(dialog)).toHaveText(/^issue_post_failed — /);
          await expect(issueErrorDetail(dialog)).toContainText("may nonetheless have been created");

          // Never the false-success rendering the fix exists to prevent. `innerText()`
          // (unlike `textContent()`) respects the native `hidden` attribute's
          // `display: none`, so this only sees what a real user would actually see — the
          // static "Filed <a>" markup that sits hidden in the DOM at all times must not
          // leak into a visibility-aware read. The regex is anchored to the success
          // panel's own "Filed <repo>#<n>" shape (not just the word "Filed") because the
          // visible preview's own `<sub>` provenance footer legitimately reads "Filed
          // from the Muster dashboard" — a false match there would be a spec bug, not a
          // product one.
          await expect(issueSuccessStatus(dialog)).toHaveCount(0);
          await expect(issueSuccessLink(dialog)).toHaveCount(0);
          const visibleDialogText = await dialog.innerText();
          expect(visibleDialogText).not.toContain(`${ISSUE_REPO_FIXTURE}#0`);
          expect(visibleDialogText).not.toMatch(/Filed \S*#\d/);

          // A generic post failure (unlike capture_expired) leaves the capture usable —
          // Submit re-enables and the form survives for a retry (REQ-10).
          await expect(issueSubmitButton(dialog)).toBeEnabled();
          await expect(issueTitleInput(dialog)).toHaveValue("maybe created upstream");
          await expect(dialog).toBeVisible();
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});

test("a 200-character title made of two-byte UTF-8 runes is accepted, proving the client's UTF-16 maxlength gate and the daemon's rune-count gate agree (Minor 1)", async ({
  page,
  request,
}) => {
  const gh = await FakeGitHubAPI.start();
  try {
    // "é" (U+00E9, precomposed) is exactly 1 UTF-16 code unit (so the input's native
    // maxlength="200" — a UTF-16-code-unit count — accepts it), exactly 1 rune, but 2
    // bytes in UTF-8: a 200-rune title is 400 bytes. Before Minor 1's fix the daemon
    // rejected this with 400 invalid_request (len(title) > 200 was a byte count), even
    // though the browser itself only ever let the user type 200 characters.
    const title = "é".repeat(200);
    gh.setResponse(201, { number: 40, html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/40` });
    await withIssueDaemon(
      { issueApiURL: gh.baseURL, issueTokenContent: issueTokenFileContent() },
      async (daemon) => {
        const { path: dir, cleanup } = await scratchDirectory();
        try {
          await page.goto(daemon.dashboardUrl);
          const session = await launchSession(page, daemon, { directory: dir, title: "multibyte-title" });
          await request.post(daemon.ingestURL("hook"), {
            data: envelopedSessionStart("claude-multibyte", { musterSession: session.id }),
          });
          await sessionCard(page, "multibyte-title").click();

          const { dialog } = await openIssueDialogAndCapture(page, daemon);
          await expect(issuePreview(dialog)).not.toHaveText(/fetching snapshot…/);

          const titleInput = issueTitleInput(dialog);
          await titleInput.fill(title);
          await expect(titleInput).toHaveValue(title);
          expect(title.length).toBe(200); // sanity: the browser's own maxlength did not truncate it

          await expect(issueSubmitButton(dialog)).toBeEnabled();
          await issueSubmitButton(dialog).click();

          await expect(issueErrorSummary(dialog)).toHaveCount(0);
          await expect(issueSuccessStatus(dialog)).toBeVisible();
          await expect(issueSuccessLink(dialog)).toHaveText(`${ISSUE_REPO_FIXTURE}#40`);

          const posted = gh.lastRequest?.body?.title ?? "";
          expect(posted).toBe(title);
          expect(Buffer.byteLength(posted, "utf-8")).toBe(400);
        } finally {
          await cleanup();
        }
      },
    );
  } finally {
    await gh.stop();
  }
});
