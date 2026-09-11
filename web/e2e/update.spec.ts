import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildVersionedMusterd, type StagedBinary, stageBinary } from "./helpers/daemon";
import { expect, settleFor, test } from "./helpers/fixtures";
import { FakeReleaseServer, type TamperKind } from "./helpers/releases";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";
import { createShellViaApi, shellTmuxTarget } from "./helpers/shell";
import { terminalRegion } from "./helpers/terminal";
import { openSettingsDialog, settingsButton, settingsCloseButton } from "./helpers/theme";
import {
  openUpdateRestartConfirm,
  restartConfirmBody,
  restartConfirmButton,
  restartConfirmCancelButton,
  settingsBadgeDot,
  updateApplyButton,
  updateAvailableReadout,
  updateCheckToggle,
  updateRestartButton,
  updateRunningReadout,
  updateStatusLine,
} from "./helpers/update";

// Plan auto-update — E1 through E15. musterd is a GitHub Release binary with no update
// path today; this plan adds a pref-gated daemon-side check against
// `helpers/releases.ts`'s FakeReleaseServer (never the real `github.com/Zalaras/muster`
// host — REQ-5), a minisign-verified swap of the daemon's own binary (REQ-14..18), and
// an in-place re-exec that must leave every Claude tmux session running (INV-5).
//
// Every daemon here is `startDaemon` (never the plain `daemon` fixture), because every
// test needs its own FakeReleaseServer URL and minisign public-key-file path — exactly
// the "spawn options depend on a value computed inside the test" case
// `helpers/fixtures.ts` reserves `startDaemon` for. `binary`/`env`/`updateBaseURL`/
// `updateCheckInterval`/`updatePublicKeyFile` are new `ScratchDaemonOptions` fields, and
// `buildVersionedMusterd`/`stageBinary` are new `helpers/daemon.ts` exports — all listed
// under the plan's own "Web Affected Files" (web-impl's, not e2e-specs'). Until web-impl
// lands them, this file's imports of the two functions do not resolve and
// `npx playwright test --list` fails at that import line — see `test-specs.md`'s
// handoff note; e2e-specs was directed not to add them to `daemon.ts` itself.
//
// No hook or status-line payload is synthesized anywhere in this file: this plan adds no
// Claude Code ingest path (edge case 34), and every Claude session used as an INV-5
// fixture (E5/E6/E12) only needs to exist and stay alive in tmux, never to reach a
// particular ingest-driven state.

const OLD_VERSION = "0.1.0";
const NEW_VERSION = "0.2.0";
const NEW_TAG = `v${NEW_VERSION}`;

const execFileAsync = promisify(execFile);

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

interface ReleaseServerFixture {
  fakeServer: FakeReleaseServer;
  pubKeyPath: string;
  cleanup: () => Promise<void>;
}

/** One `FakeReleaseServer` plus its own minisign public-key file on disk, ready to pass
 * as `-update-public-key-file` — every test's daemon uses ITS OWN generated keypair,
 * never the real committed `internal/selfupdate/minisign.pub` (D5's production key). */
async function startReleaseServer(): Promise<ReleaseServerFixture> {
  const fakeServer = await FakeReleaseServer.start();
  const dir = await mkdtemp(join(tmpdir(), "muster-e2e-update-pubkey-"));
  const pubKeyPath = join(dir, "minisign.pub");
  await fakeServer.writePublicKey(pubKeyPath);
  return {
    fakeServer,
    pubKeyPath,
    cleanup: async () => {
      await fakeServer.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Builds an "installer"-classified binary at `version` — `stageBinary`'s own fresh
 * `mkdtemp` outside the repo, no `.git` ancestor below `$HOME`, writable (REQ-21). */
async function stageInstaller(version: string): Promise<StagedBinary> {
  const binary = await buildVersionedMusterd(version);
  return await stageBinary(binary);
}

test("a strictly newer release badges Settings and shows Running/Available in the dialog (E1, INV-2)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsButton(page)).toHaveAttribute("aria-label", "Settings, update available");
    await expect(settingsButton(page)).toHaveAttribute("data-update", "available");
    await expect(settingsBadgeDot(page)).toBeVisible();

    const dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${OLD_VERSION}`);
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
    await expect(updateCheckToggle(dialog)).toBeChecked();
    await expect(updateApplyButton(dialog)).toBeEnabled();
    await expect(updateRestartButton(dialog)).toBeEnabled();
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("pref persisted off across a daemon restart: two check intervals pass with zero further /latest requests (E2, INV-1, edge case 6)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
      updateCheckInterval: "1s",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await updateCheckToggle(dialog).uncheck();
    await expect(updateCheckToggle(dialog)).not.toBeChecked();

    // Whatever this FIRST lifetime's own immediate on-listen check already did to
    // requestCount("/latest") (it ran before the toggle above landed) is irrelevant —
    // INV-1's "startup with the pref persisted off" clause is about the SECOND
    // lifetime, below, which must never touch /latest at all.
    await daemon.restart();
    const countAtRestart = fakeServer.requestCount("/latest");
    // Two full "-update-check-interval"s (1s each) plus margin — the one legitimate
    // fixed hold, proving nothing happened over a bounded window (helpers/fixtures.ts).
    await settleFor(page, 2_500);
    expect(fakeServer.requestCount("/latest")).toBe(countAtRestart);

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeHidden();
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("unchecking the toggle clears the badge and shows checking disabled; rechecking triggers an immediate check (E3, REQ-3, INV-1)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    await expect(updateCheckToggle(dialog)).toBeChecked();

    await updateCheckToggle(dialog).uncheck();
    await expect(settingsBadgeDot(page)).toBeHidden();
    await expect(updateAvailableReadout(dialog)).toHaveText("checking disabled");

    const countBefore = fakeServer.requestCount("/latest");
    await updateCheckToggle(dialog).check();
    await expect.poll(() => fakeServer.requestCount("/latest")).toBeGreaterThan(countBefore);
    await expect(settingsBadgeDot(page)).toBeVisible();
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("clicking Update swaps the on-disk binary and reports Updated without restarting the running process (E4, User Flow 2)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    const oldBinary = await buildVersionedMusterd(OLD_VERSION);
    staged = await stageBinary(oldBinary);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    const { assetName } = await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);

    const shaBefore = await sha256File(staged.path);
    expect(shaBefore).toBe(await sha256File(oldBinary));

    // Holds the WHOLE fake server (not just the archive), so the apply pipeline sits
    // deterministically in "downloading" until release() — a fast local fixture would
    // otherwise race past that phase before the assertion below ever polls it.
    fakeServer.hold();
    await updateApplyButton(dialog).click();
    await expect(updateStatusLine(dialog)).toHaveText(`Downloading v${NEW_VERSION}…`);
    fakeServer.release();

    await expect(updateStatusLine(dialog)).toHaveText(`Updated to v${NEW_VERSION}. Restart musterd to finish.`);
    await expect(updateApplyButton(dialog)).toBeDisabled();
    await expect(updateRestartButton(dialog)).toHaveText("Restart now");
    await expect(settingsBadgeDot(page)).toBeHidden();
    // The process itself hasn't restarted — its own Running readout (which duplicates
    // `hello.daemon.version`, kb:anchor/ws.update — one object, one source) still reads OLD.
    await expect(updateRunningReadout(dialog)).toHaveText(`v${OLD_VERSION}`);

    const shaAfter = await sha256File(staged.path);
    expect(shaAfter).toBe(await sha256File(newBinary));
    expect(shaAfter).not.toBe(shaBefore);

    const { stdout } = await execFileAsync(staged.path, ["-version"]);
    expect(stdout).toContain(NEW_VERSION);

    expect(fakeServer.requestCount(`/download/${NEW_TAG}/${assetName}`)).toBe(1);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("Update and restart brings back the same Claude session, its terminal, and an unchanged tmux pane PID (E5, INV-5 one-session case)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  const { path: dir, cleanup: cleanupDir } = await scratchDirectory();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "restart-e5" });

    await expect(settingsBadgeDot(page)).toBeVisible();
    let dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${OLD_VERSION}`);
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION}`);

    const panePidBefore = await daemon.tmuxDisplay(session.tmuxTarget, "#{pane_pid}");
    const serverPidBefore = await daemon.tmuxDisplay(session.tmuxTarget, "#{pid}");

    const confirm = await openUpdateRestartConfirm(page, dialog);
    await expect(restartConfirmBody(confirm)).toHaveText(
      "No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the restart.",
    );
    await restartConfirmButton(confirm).click();

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toBeHidden();

    // INV-5: the re-exec must not touch tmux at all — same server PID, same pane PID.
    expect(await daemon.tmuxDisplay(session.tmuxTarget, "#{pane_pid}")).toBe(panePidBefore);
    expect(await daemon.tmuxDisplay(session.tmuxTarget, "#{pid}")).toBe(serverPidBefore);

    dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date");
    await settingsCloseButton(dialog).click();

    const card = sessionCard(page, "restart-e5");
    await expect(card).toBeVisible();
    await card.click();
    const region = terminalRegion(page, "restart-e5");
    await expect(region).toContainText("MUSTER-STUB-READY");
  } finally {
    if (staged) await staged.cleanup();
    await cleanupDir();
    await cleanup();
  }
});

test("Update and restart with two Claude sessions and a plain shell names the shell in the confirm, then removes only the shell (E6, INV-5 two-session case)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  const dirA = await scratchDirectory();
  const dirB = await scratchDirectory();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, { directory: dirA.path, title: "restart-e6-a" });
    const sessionB = await launchSession(page, daemon, { directory: dirB.path, title: "restart-e6-b" });

    await expect(settingsBadgeDot(page)).toBeVisible();
    let dialog = await openSettingsDialog(page);

    // No shell yet — open the confirm, read the "none" phrasing, then Cancel: nothing
    // may actually restart from this half of the test.
    let confirm = await openUpdateRestartConfirm(page, dialog);
    await expect(restartConfirmBody(confirm)).toHaveText(
      "No plain-terminal shells are open. Claude sessions keep running and are re-adopted after the restart.",
    );
    await restartConfirmCancelButton(confirm).click();
    await expect(confirm).toBeHidden();

    const shell = await createShellViaApi(page, daemon.baseURL, sessionA.id);
    expect(shell.created).toBe(true);
    const shellTarget = shellTmuxTarget(sessionA.id);
    expect(await daemon.tmuxSessions()).toContain(shellTarget);

    const panePidA = await daemon.tmuxDisplay(sessionA.tmuxTarget, "#{pane_pid}");
    const panePidB = await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{pane_pid}");
    const serverPidBefore = await daemon.tmuxDisplay(sessionA.tmuxTarget, "#{pid}");

    confirm = await openUpdateRestartConfirm(page, dialog);
    await expect(restartConfirmBody(confirm)).toHaveText(/^1 plain-terminal shell will close: restart-e6-a/);
    await restartConfirmButton(confirm).click();

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toBeHidden();

    expect(await daemon.tmuxSessions()).not.toContain(shellTarget);
    // Both Claude sessions' panes — and the tmux server itself — are untouched by the
    // re-exec; only the plain-terminal shell (killed by the reconcile sweep,
    // kb:anchor/sessions.shell / kb:anchor/state.liveness, already covered by reconcile.spec.ts) is gone.
    expect(await daemon.tmuxDisplay(sessionA.tmuxTarget, "#{pane_pid}")).toBe(panePidA);
    expect(await daemon.tmuxDisplay(sessionB.tmuxTarget, "#{pane_pid}")).toBe(panePidB);
    expect(await daemon.tmuxDisplay(sessionA.tmuxTarget, "#{pid}")).toBe(serverPidBefore);

    dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
  } finally {
    if (staged) await staged.cleanup();
    await dirA.cleanup();
    await dirB.cleanup();
    await cleanup();
  }
});

test("each verification refusal reports Update failed and leaves the on-disk binary byte-identical (E7, INV-3, REQ-24)", async ({
  page,
  startDaemon,
}) => {
  const kinds: TamperKind[] = ["checksums", "missing-minisig", "foreign-key", "sha-mismatch"];
  for (const kind of kinds) {
    const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
    let staged: StagedBinary | undefined;
    try {
      staged = await stageInstaller(OLD_VERSION);
      const newBinary = await buildVersionedMusterd(NEW_VERSION);
      await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
      fakeServer.tamper(NEW_TAG, kind);
      fakeServer.setLatest(NEW_TAG);
      const daemon = await startDaemon({
        binary: staged.path,
        updateBaseURL: fakeServer.baseURL,
        updatePublicKeyFile: pubKeyPath,
      });

      await page.goto(daemon.dashboardUrl);
      await expect(settingsBadgeDot(page)).toBeVisible();
      const dialog = await openSettingsDialog(page);
      const shaBefore = await sha256File(staged.path);

      await updateApplyButton(dialog).click();
      await expect(updateStatusLine(dialog)).toHaveText(/^Update failed: /);

      const shaAfter = await sha256File(staged.path);
      expect(shaAfter, `binary hash changed after a refused apply (tamper kind: ${kind})`).toBe(shaBefore);
      await expect(updateApplyButton(dialog)).toBeEnabled();
    } finally {
      if (staged) await staged.cleanup();
      await cleanup();
    }
  }
});

test("a dev build never checks or badges, and the dialog shows no Update buttons (E8, REQ-8)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  try {
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    // No `binary` override — the harness's own bin/musterd, stamped by `git describe`
    // (e.g. "v0.10.0-4-ge5102b8"), is a dev build by construction (REQ-8,
    // Implementation Notes > E2E harness).
    const daemon = await startDaemon({ updateBaseURL: fakeServer.baseURL, updatePublicKeyFile: pubKeyPath });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await expect(updateAvailableReadout(dialog)).toHaveText("not checked (development build)");
    await expect(updateApplyButton(dialog)).toHaveCount(0);
    // Both buttons stay in the DOM always (toggled via the `hidden` attribute plus its
    // `display:none` CSS companion in style.css, never removed) — `updateRestartButton`
    // is an id locator, not a role query, so it doesn't benefit from getByRole's default
    // accessibility-tree exclusion of hidden elements the way updateApplyButton above
    // does. toBeHidden() is the correct "absent" check for it (REQ-13).
    await expect(updateRestartButton(dialog)).toBeHidden();
    await expect(settingsBadgeDot(page)).toBeHidden();

    await settleFor(page, 500);
    expect(fakeServer.requestCount("/latest")).toBe(0);
  } finally {
    await cleanup();
  }
});

test("a binary staged under $HOMEBREW_PREFIX badges but disables both buttons with the brew remedy (E9, REQ-21, edge case 11)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let scratchRoot: string | undefined;
  let staged: StagedBinary | undefined;
  try {
    const oldBinary = await buildVersionedMusterd(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);

    // Homebrew simulation per the plan's own E2E harness note: `$HOMEBREW_PREFIX` in
    // the daemon's env (what `brew shellenv` exports) — no fake flag.
    scratchRoot = await mkdtemp(join(tmpdir(), "muster-e2e-brew-"));
    // `mkdtemp(tmpdir())` on macOS returns a `/var/folders/...` path that is itself a
    // symlink to `/private/var/folders/...`; `cmd/musterd`'s startup classification
    // resolves its own exePath through `filepath.EvalSymlinks` before comparing it
    // against `$HOMEBREW_PREFIX` (internal/selfupdate/install.go's `withinDir`, a plain
    // path-prefix comparison, not a filesystem stat), so an unresolved prefix here never
    // matches the resolved exePath and the daemon falls through to "installer" instead of
    // "homebrew". Resolve once so both sides compare the same real path — same class of
    // fix as the E13 unmanaged case, which self-resolves because its `.git`-ancestor walk
    // is an `os.Stat` (filesystem identity, not string comparison) rather than a prefix
    // match.
    const brewPrefix = join(await realpath(scratchRoot), "brew");
    const brewBinDir = join(brewPrefix, "bin");
    await mkdir(brewBinDir, { recursive: true });
    staged = await stageBinary(oldBinary, brewBinDir);

    const daemon = await startDaemon({
      binary: staged.path,
      env: { HOMEBREW_PREFIX: brewPrefix },
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
    await expect(updateApplyButton(dialog)).toBeDisabled();
    await expect(updateRestartButton(dialog)).toBeDisabled();
    await expect(updateStatusLine(dialog)).toContainText("brew upgrade musterd");
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
    if (scratchRoot) await rm(scratchRoot, { recursive: true, force: true });
  }
});

test("fake latest equal to running, then older: Available reads up to date and no badge either way (E10, D9, edge case 4)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    const oldBinary = await buildVersionedMusterd(OLD_VERSION);
    staged = await stageBinary(oldBinary);
    const equalTag = `v${OLD_VERSION}`;
    await fakeServer.publish({ tag: equalTag, binaryPath: oldBinary });
    fakeServer.setLatest(equalTag);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
      updateCheckInterval: "1s",
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date");
    await expect(settingsBadgeDot(page)).toBeHidden();

    // Reuses oldBinary's bytes as filler content — this release's archive is never
    // downloaded (older than running is never `available`), only its tag/comparison.
    const olderTag = "v0.0.9";
    await fakeServer.publish({ tag: olderTag, binaryPath: oldBinary });
    const countBefore = fakeServer.requestCount("/latest");
    fakeServer.setLatest(olderTag);
    await expect.poll(() => fakeServer.requestCount("/latest")).toBeGreaterThan(countBefore);
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date");
    await expect(settingsBadgeDot(page)).toBeHidden();
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("two pages clicking Update while the archive is held: exactly one download, both report Updated (E11, REQ-20)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let page2Closed = false;
  const page2 = await page.context().newPage();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    const { assetName } = await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await page2.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    await expect(settingsBadgeDot(page2)).toBeVisible();
    const dialog1 = await openSettingsDialog(page);
    const dialog2 = await openSettingsDialog(page2);

    fakeServer.hold();
    // Neither ordering of two literal `.click()`s (sequential, nor raced via
    // Promise.all) can ever land both: whichever click starts the apply first triggers
    // an `update` broadcast (phase -> downloading, which disables the Update button on
    // EVERY connected window per the Text rules' "phase not in flight" clause) that
    // reaches the OTHER page over its own websocket well inside the ~2-stable-frame
    // actionability wait Playwright's own `.click()` imposes per page/CDP session —
    // confirmed by running it both ways: whichever side goes through `.click()` loses to
    // whichever side has no such polling overhead, deterministically, never a close
    // race. That polling wait is the test tool's own artifact, not a constraint a real
    // second browser window has (its click handler dispatches the fetch synchronously,
    // no multi-frame stability wait first) — so it is not evidence of anything about the
    // product, and asserting through it would just be testing Playwright's click timing.
    // Both windows instead fire the exact same authenticated request their own click
    // handler would (src/api.ts's `applyUpdate` — same endpoint, body and same-origin
    // credentials), from each page's own request context, landing as two independent,
    // genuinely concurrent `POST /api/update/apply` calls — the actual object REQ-20
    // serialises. E4 already proves the button's click wiring reaches this same
    // endpoint; E11's job is the concurrency guarantee and both windows converging via
    // the broadcast, not re-proving the click-to-fetch wiring.
    const applyBody = { headers: { "Content-Type": "application/json" }, data: { restart: false } };
    const [res1, res2] = await Promise.all([
      page.request.post(`${daemon.baseURL}/api/update/apply`, applyBody),
      page2.request.post(`${daemon.baseURL}/api/update/apply`, applyBody),
    ]);
    expect(res1.status()).toBe(202);
    expect(res2.status()).toBe(202);
    await expect(updateStatusLine(dialog1)).toHaveText(`Downloading v${NEW_VERSION}…`);
    fakeServer.release();

    await expect(updateStatusLine(dialog1)).toHaveText(`Updated to v${NEW_VERSION}. Restart musterd to finish.`);
    await expect(updateStatusLine(dialog2)).toHaveText(`Updated to v${NEW_VERSION}. Restart musterd to finish.`);
    expect(fakeServer.requestCount(`/download/${NEW_TAG}/${assetName}`)).toBe(1);
    await page2.close();
    page2Closed = true;
  } finally {
    if (staged) await staged.cleanup();
    if (!page2Closed) await page2.close();
    await cleanup();
  }
});

test("Update and restart returns the dashboard on the same port and data dir (E12, INV-7)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    // Every scratch daemon already runs on its own freshly allocated `-addr` and a
    // scratch `-data-dir`/`-tmux-socket` (helpers/daemon.ts's spawnAndWait) — i.e. every
    // daemon this harness starts already IS "non-default" by construction. INV-7's
    // proof is that all three survive the re-exec verbatim, observed here as "the same
    // origin and tokens answer after the restart", not a fresh instance's.
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    const uiTokenBefore = daemon.uiToken;
    const ingestTokenBefore = daemon.ingestToken;
    const baseURLBefore = daemon.baseURL;

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    const confirm = await openUpdateRestartConfirm(page, dialog);
    await restartConfirmButton(confirm).click();

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toBeHidden();

    expect(daemon.baseURL).toBe(baseURLBefore);
    expect(daemon.uiToken).toBe(uiTokenBefore);
    expect(daemon.ingestToken).toBe(ingestTokenBefore);
    const res = await page.request.get(`${daemon.baseURL}/healthz`);
    expect(res.status()).toBe(200);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("a binary staged inside a scratch git tree badges but disables both buttons naming the installer (E13, REQ-21, edge case 9)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let scratchRoot: string | undefined;
  let staged: StagedBinary | undefined;
  try {
    const oldBinary = await buildVersionedMusterd(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);

    // Unmanaged simulation per the plan's own E2E harness note: `git init` in the
    // staging dir (never `git config user.*` here — CLAUDE.md hard rule — a bare
    // `git init` with no commit is enough for the classifier's ".git ancestor" check).
    scratchRoot = await mkdtemp(join(tmpdir(), "muster-e2e-unmanaged-"));
    staged = await stageBinary(oldBinary, scratchRoot);
    await execFileAsync("git", ["init"], { cwd: scratchRoot });

    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
    await expect(updateApplyButton(dialog)).toBeDisabled();
    await expect(updateRestartButton(dialog)).toBeDisabled();
    // Exact remedy wording isn't pinned by the plan (REQ-21 only says "names the
    // installer one-liner") — matched loosely against `scripts/install.sh`'s own name;
    // a validate-mode repair target if daemon-impl's actual string differs.
    await expect(updateStatusLine(dialog)).toHaveText(/install\.sh|curl/i);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
    if (scratchRoot) await rm(scratchRoot, { recursive: true, force: true });
  }
});

test("`musterd -update` while the daemon runs is detected within one tick, showing Restart now with no click (E14, REQ-26)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
      updateCheckInterval: "2s",
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);

    // A second, one-shot process swaps the SAME on-disk file the running daemon was
    // launched from, entirely out of band from the daemon's own apply pipeline (edge
    // case 23) — REQ-22's `-update` CLI path.
    const { stdout } = await execFileAsync(staged.path, [
      "-update",
      "-update-base-url",
      fakeServer.baseURL,
      "-update-public-key-file",
      pubKeyPath,
    ]);
    expect(stdout).toContain(NEW_VERSION);

    // No click anywhere above — REQ-26's periodic stat+probe alone must set `installed`.
    await expect(updateStatusLine(dialog)).toHaveText(`Updated to v${NEW_VERSION}. Restart musterd to finish.`);
    await expect(updateRestartButton(dialog)).toHaveText("Restart now");
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("Restart now after a plain Update shows the confirm and completes with no second download (E15, REQ-25)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    const { assetName } = await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    let dialog = await openSettingsDialog(page);
    await updateApplyButton(dialog).click();
    await expect(updateStatusLine(dialog)).toHaveText(`Updated to v${NEW_VERSION}. Restart musterd to finish.`);
    await expect(updateRestartButton(dialog)).toHaveText("Restart now");

    const archivePath = `/download/${NEW_TAG}/${assetName}`;
    const countBeforeRestart = fakeServer.requestCount(archivePath);

    const confirm = await openUpdateRestartConfirm(page, dialog);
    await expect(confirm).toBeVisible();
    await restartConfirmButton(confirm).click();

    const banner = page.getByRole("alert");
    await expect(banner).toBeVisible();
    await expect(banner).toBeHidden();

    dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date");
    // Semantics per kb:anchor/update.apply: `installed` already equalled `available`,
    // so the restart-only apply skips the download entirely — no second archive fetch.
    expect(fakeServer.requestCount(archivePath)).toBe(countBeforeRestart);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});
