import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildVersionedMusterd, type StagedBinary, stageBinary } from "./helpers/daemon";
import { expect, settleFor, test } from "./helpers/fixtures";
import { archiveAssetName, FakeReleaseServer, goArch, type TamperKind } from "./helpers/releases";
import { launchSession, scratchDirectory, sessionCard } from "./helpers/session";
import { createShellViaApi, shellTmuxTarget } from "./helpers/shell";
import { terminalRegion } from "./helpers/terminal";
import { openSettingsDialog, settingsButton, settingsCloseButton } from "./helpers/theme";
import {
  expectRemedyContained,
  openUpdateRestartConfirm,
  restartConfirmBody,
  restartConfirmButton,
  restartConfirmCancelButton,
  settingsBadgeDot,
  updateApplyButton,
  updateAvailableReadout,
  updateCheckButton,
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
// `helpers/fixtures.ts` reserves `startDaemon` for. Two exceptions below take the plain
// `daemon` fixture instead, per `helpers/fixtures.ts`'s own decision rule, because
// neither involves a release check or apply: the throwing `sessionStorage` accessor
// case (asserts only that the dashboard boots and connects at all) and the
// protocol-mismatch-on-reconnect case (arms its restart record and rewrites the
// reconnect's `hello` directly over a routed `/ws`, never through a real download).
// `binary`/`env`/`updateBaseURL`/
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
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
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
    // Plan rail-card-improvements-2 REQ-11: the Available readout now carries the age of
    // the last successful check (the daemon's own on-listen check, here) alongside the
    // version.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
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

test("unchecking the toggle clears the badge and available version; rechecking triggers an immediate check (E3, REQ-3, INV-1; plan rail-card-improvements-2 REQ-11)", async ({
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
    // Plan rail-card-improvements-2 REQ-11: the readout's disabled-check branch is
    // removed entirely — turning the toggle off still clears `checkedAt` (the pref's
    // documented side effect is unchanged), which now reads as the same "no data yet"
    // state a session that has never checked shows.
    await expect(updateAvailableReadout(dialog)).toHaveText("not checked yet");

    const countBefore = fakeServer.requestCount("/latest");
    await updateCheckToggle(dialog).check();
    await expect.poll(() => fakeServer.requestCount("/latest")).toBeGreaterThan(countBefore);
    await expect(settingsBadgeDot(page)).toBeVisible();
    // REQ-11: rechecking is itself a successful check, so the age suffix reappears.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
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

    await expect(updateStatusLine(dialog)).toHaveText(
      `Updated to v${NEW_VERSION}. Restart musterd to finish.`,
    );
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
    // Plan rail-card-improvements-2 REQ-11.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);

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
    // The restarted daemon's own on-listen check refreshes `checkedAt` (REQ-11).
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date · checked now");
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
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "restart-e6-a",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "restart-e6-b",
    });

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
    await expect(restartConfirmBody(confirm)).toHaveText(
      /^1 plain-terminal shell will close: restart-e6-a/,
    );
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
      expect(shaAfter, `binary hash changed after a refused apply (tamper kind: ${kind})`).toBe(
        shaBefore,
      );
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
    const daemon = await startDaemon({
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

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
    // Plan rail-card-improvements-2 REQ-11.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
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
    // Plan rail-card-improvements-2 REQ-11: every successful check carries the age suffix.
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date · checked now");
    await expect(settingsBadgeDot(page)).toBeHidden();

    // Reuses oldBinary's bytes as filler content — this release's archive is never
    // downloaded (older than running is never `available`), only its tag/comparison.
    const olderTag = "v0.0.9";
    await fakeServer.publish({ tag: olderTag, binaryPath: oldBinary });
    const countBefore = fakeServer.requestCount("/latest");
    fakeServer.setLatest(olderTag);
    await expect.poll(() => fakeServer.requestCount("/latest")).toBeGreaterThan(countBefore);
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date · checked now");
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

    await expect(updateStatusLine(dialog1)).toHaveText(
      `Updated to v${NEW_VERSION}. Restart musterd to finish.`,
    );
    await expect(updateStatusLine(dialog2)).toHaveText(
      `Updated to v${NEW_VERSION}. Restart musterd to finish.`,
    );
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
    // Plan rail-card-improvements-2 REQ-11.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
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
    await expect(updateStatusLine(dialog)).toHaveText(
      `Updated to v${NEW_VERSION}. Restart musterd to finish.`,
    );
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
    await expect(updateStatusLine(dialog)).toHaveText(
      `Updated to v${NEW_VERSION}. Restart musterd to finish.`,
    );
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
    // The restarted daemon's own on-listen check refreshes `checkedAt` (REQ-11).
    await expect(updateAvailableReadout(dialog)).toHaveText("up to date · checked now");
    // Semantics per kb:anchor/update.apply: `installed` already equalled `available`,
    // so the restart-only apply skips the download entirely — no second archive fetch.
    expect(fakeServer.requestCount(archivePath)).toBe(countBeforeRestart);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

// Plan rail-card-improvements-2 — REQ-7 through REQ-13 (#48: the `Check now` button and
// `POST /api/update/check`). Plan acceptance: E9 through E12.

test("pressing Check now with a newer release published shows that version in the Available readout and badges the Settings button (E9)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    // No release published yet — the daemon's own immediate on-listen check (REQ-4 of
    // the auto-update plan) finds nothing at `/latest` and leaves `checkedAt` null, so
    // the version shown after clicking Check now can only have come from THIS click.
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await expect(updateAvailableReadout(dialog)).toHaveText("not checked yet");
    await expect(settingsBadgeDot(page)).toBeHidden();

    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);

    await updateCheckButton(dialog).click();
    // REQ-11: a successful check, manual or automatic, always carries the age suffix.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
    await expect(settingsBadgeDot(page)).toBeVisible();
    await expect(settingsButton(page)).toHaveAttribute("aria-label", "Settings, update available");
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("with daily checking off from startup, the Available readout reads not checked yet, and pressing Check now replaces it with a checked age (E10)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    // Published tag equals the running version, so a successful check reads "up to
    // date" — this test cares about the checked-age suffix, not a version bump (E9
    // already covers that).
    await fakeServer.publish({
      tag: `v${OLD_VERSION}`,
      binaryPath: await buildVersionedMusterd(OLD_VERSION),
    });
    fakeServer.setLatest(`v${OLD_VERSION}`);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    // Turn the pref off, then restart so the SECOND lifetime boots with it already
    // persisted off (mirrors the pre-existing "pref persisted off across a restart"
    // test above) — only then does the daemon's own immediate on-listen check never
    // fire, leaving `checkedAt` null at load, i.e. genuinely "off from startup".
    await page.goto(daemon.dashboardUrl);
    let dialog = await openSettingsDialog(page);
    await updateCheckToggle(dialog).uncheck();
    // Confirms the PUT (and its broadcast) landed before restarting — this dashboard
    // never renders the checkbox optimistically (rail-layout.spec.ts's own
    // "no-optimistic-state" precedent).
    await expect(updateCheckToggle(dialog)).not.toBeChecked();
    await daemon.restart();

    await page.goto(daemon.dashboardUrl);
    dialog = await openSettingsDialog(page);
    await expect(updateCheckToggle(dialog)).not.toBeChecked();
    await expect(updateAvailableReadout(dialog)).toHaveText("not checked yet");

    // REQ-8: a user-initiated check runs regardless of the pref.
    await expect(updateCheckButton(dialog)).toBeEnabled();
    await updateCheckButton(dialog).click();
    await expect(updateAvailableReadout(dialog)).toHaveText(/^up to date · checked now$/);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("pressing Check now against a stopped release host shows a reason in the status line while the Available readout keeps its previous value (E11)", async ({
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
    // REQ-11: the daemon's own on-listen check already succeeded once.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);

    // Plan Affected Files: stopping the fake server is the sanctioned way to make
    // `/latest` fail for this case — no new FakeReleaseServer tamper kind needed.
    await fakeServer.stop();

    await updateCheckButton(dialog).click();
    // Exact wording isn't pinned by the plan (REQ-12 only says "renders its reason") —
    // matched loosely, a validate-mode repair target if daemon-impl's actual string
    // differs, mirroring E13's own precedent above.
    await expect(updateStatusLine(dialog)).toHaveText(/fail/i);
    // REQ-12: a transient check failure never erases a known version — the readout (and
    // its age suffix, still reflecting the earlier successful check) is untouched.
    await expect(updateAvailableReadout(dialog)).toHaveText(`v${NEW_VERSION} · checked now`);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("Check now is disabled on a daemon started with an empty update base URL (E12)", async ({
  page,
  startDaemon,
}) => {
  // No `updateBaseURL` override — every scratch daemon otherwise passes an explicit
  // empty `-update-base-url` (helpers/daemon.ts), exactly the `canCheck` false state
  // the plan's States section names as "the state every E2E daemon that sets an empty
  // base URL is in".
  const daemon = await startDaemon();
  await page.goto(daemon.dashboardUrl);
  const dialog = await openSettingsDialog(page);
  await expect(updateCheckButton(dialog)).toBeDisabled();
});

// Plan maintainability-cleanup WF1 (e-note-4): `check()` used to mutate its own
// `checkState` without ever calling `app.render()` itself, relying entirely on
// `main.ts`'s unconditional `setInterval(app.render, 1000)` to eventually show the
// result — up to a second late, and invisible to E9-E12 above because their default
// `expect` timeout comfortably outlasts that one tick. `page.clock` is installed and
// then paused right before the click so that periodic tick genuinely cannot fire during
// this test (Playwright's clock only fakes Date/setTimeout/setInterval, never the real
// fetch/WebSocket I/O the daemon round trip itself uses) — on the pre-fix code these
// `expect` calls time out instead of racing a real clock.
test("Check now disables the button the instant it starts and shows its result the instant it settles, not on the next periodic render tick (e-note-4)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    // No tag ever published — `/latest` 404s once let through, a deterministic failure
    // with no dependence on tearing down the server mid-test (E11's `fakeServer.stop()`).
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.clock.install();
    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await expect(updateCheckButton(dialog)).toBeEnabled();

    // Freezes the page's own clock from here on — main.ts's periodic `app.render()`
    // tick cannot fire again until this test explicitly advances it (it never does).
    await page.clock.pauseAt(new Date());
    fakeServer.hold();
    await updateCheckButton(dialog).click();

    // No `expect.poll`/timeout here on purpose: `click()` only resolves once the
    // browser's synchronous handling of the click event (including `check()`'s own
    // body up to the `await`-free `.then()` registration) has completed, so a render
    // `check()` triggers itself is already in the DOM by this point on the fixed code,
    // and the frozen periodic tick could not have supplied it another way.
    expect(await updateCheckButton(dialog).isDisabled()).toBe(true);
    expect(await updateCheckButton(dialog).getAttribute("aria-busy")).toBe("true");

    fakeServer.release();
    // With the clock frozen, only a render `check()`'s own `.then()` callback issues
    // can ever satisfy these — the periodic tick that used to paper over the pre-fix
    // gap cannot run. On the pre-fix code these two hang until the suite's expect
    // timeout.
    await expect(updateStatusLine(dialog)).toHaveText(/fail/i);
    await expect(updateCheckButton(dialog)).toBeEnabled();
    await expect(updateCheckButton(dialog)).not.toHaveAttribute("aria-busy", "true");
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

// Plan settings-update-failures — E1 through E6 (#53 and the two sibling items).
// REQ-4's recheck-on-every-check means E1/E2 below assert BOTH the initial remedy text
// (REQ-1/REQ-2's exact composed sentence, not the old plan's loose install.sh-or-curl
// match those tests keep — see Implementation Notes: E7/E11/E13 above are untouched) AND
// that clearing the blocker and pressing Check now enables Update without a restart —
// the actual behaviour this plan adds on top of the existing one-time startup
// classification. E5/E6 assert only the settled post-reload state: the transient
// "Updating musterd… — restarting" banner (REQ-14) is a sub-second display during a real
// restart and is review-browser's job per the plan's own W11, not this suite's.

test("a binary staged inside a scratch git tree shows the checkout root in the remedy; removing .git and pressing Check now enables Update and clears the status line (E1, REQ-2)", async ({
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

    // Same symlink-resolution precedent as the pre-existing Homebrew test (E9) above:
    // `mkdtemp(tmpdir())` on macOS returns a `/var/folders/...` path that is itself a
    // symlink to `/private/var/folders/...`, and REQ-2's `<root>` is built from the
    // daemon's own resolved executable path, so the expected string here must be built
    // from the same resolved form or the two can never agree.
    scratchRoot = await mkdtemp(join(tmpdir(), "muster-e2e-settings-git-"));
    const resolvedRoot = await realpath(scratchRoot);
    staged = await stageBinary(oldBinary, resolvedRoot);
    await execFileAsync("git", ["init"], { cwd: resolvedRoot });

    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    await expect(updateStatusLine(dialog)).toHaveText(
      `can't update ${staged.path}: it is inside the git checkout ${resolvedRoot} — install with: curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh`,
    );
    await expect(updateApplyButton(dialog)).toBeDisabled();
    await expect(updateRestartButton(dialog)).toBeDisabled();
    // kb:adr/update-remedy-names-path-and-cause: the remedy's long unbreakable tokens
    // (the checkout root here) must not widen the dialog past its own edge, clipping the
    // Theme/Rail-card controls beside the status line — `toHaveText` above never touches
    // either box.
    await expectRemedyContained(dialog);

    await rm(join(resolvedRoot, ".git"), { recursive: true, force: true });
    await updateCheckButton(dialog).click();
    await expect(updateApplyButton(dialog)).toBeEnabled();
    await expect(updateRestartButton(dialog)).toBeEnabled();
    await expect(updateStatusLine(dialog)).toHaveText("");
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
    if (scratchRoot) await rm(scratchRoot, { recursive: true, force: true });
  }
});

test("a binary staged in a chmod 0555 directory shows the not-writable remedy; chmod 0755 and pressing Check now enables Update (E2, REQ-1)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let scratchRoot: string | undefined;
  let staged: StagedBinary | undefined;
  let restoredPerms = false;
  try {
    const oldBinary = await buildVersionedMusterd(OLD_VERSION);
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);

    scratchRoot = await mkdtemp(join(tmpdir(), "muster-e2e-settings-perm-"));
    const resolvedRoot = await realpath(scratchRoot);
    staged = await stageBinary(oldBinary, resolvedRoot);
    await chmod(resolvedRoot, 0o555);

    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    await expect(updateStatusLine(dialog)).toHaveText(
      `can't update ${staged.path}: ${resolvedRoot} is not writable (permission denied) — install with: curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh`,
    );
    await expect(updateApplyButton(dialog)).toBeDisabled();
    await expect(updateRestartButton(dialog)).toBeDisabled();
    // kb:adr/update-remedy-names-path-and-cause: the remedy's long unbreakable tokens
    // (the staged path here) must not widen the dialog past its own edge, clipping the
    // Theme/Rail-card controls beside the status line — `toHaveText` above never touches
    // either box.
    await expectRemedyContained(dialog);

    // Restored on the happy path here, and in `finally` below for a thrown assertion
    // (the plan's own Implementation Notes calls out exactly this: the chmod must be
    // undone so cleanup can delete the directory either way).
    await chmod(resolvedRoot, 0o755);
    restoredPerms = true;
    await updateCheckButton(dialog).click();
    await expect(updateApplyButton(dialog)).toBeEnabled();
    await expect(updateRestartButton(dialog)).toBeEnabled();
    await expect(updateStatusLine(dialog)).toHaveText("");
  } finally {
    if (!restoredPerms && scratchRoot) {
      await chmod(scratchRoot, 0o755).catch(() => {});
    }
    if (staged) await staged.cleanup();
    await cleanup();
    if (scratchRoot) await rm(scratchRoot, { recursive: true, force: true });
  }
});

test("Check now against a stopped release host shows the exact couldn't-reach-the-release-host sentence (E3, REQ-8)", async ({
  page,
  startDaemon,
}) => {
  const { fakeServer, pubKeyPath, cleanup } = await startReleaseServer();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageInstaller(OLD_VERSION);
    // Stopped before the daemon even starts: its own on-listen check also fails this
    // way, but that failure is silent (automatic checks never surface an error, REQ-11's
    // "stays at debug"), so the only reason this sentence can appear on screen is the
    // Check now click below.
    await fakeServer.stop();
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    await page.goto(daemon.dashboardUrl);
    const dialog = await openSettingsDialog(page);
    await updateCheckButton(dialog).click();
    await expect(updateStatusLine(dialog)).toHaveText(
      "update check failed: couldn't reach the release host (connection refused)",
    );
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("Update fails with the exact download-failure sentence when the release host stops before the click, leaving the on-disk binary byte-identical (E4, REQ-9)", async ({
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
    // The on-listen check already succeeded (badge visible) before the host stops, so
    // Update is enabled and the download itself — not the version check — is what fails.
    await expect(settingsBadgeDot(page)).toBeVisible();
    const dialog = await openSettingsDialog(page);
    const shaBefore = await sha256File(staged.path);

    await fakeServer.stop();
    await updateApplyButton(dialog).click();

    const assetName = archiveAssetName(NEW_VERSION, goArch());
    await expect(updateStatusLine(dialog)).toHaveText(
      `Update failed: couldn't download ${assetName} (connection refused); nothing was installed`,
    );
    const shaAfter = await sha256File(staged.path);
    expect(shaAfter).toBe(shaBefore);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("Update and restart reloads the page: a pre-restart window marker is gone afterwards, the banner confirms the new version then hides, and Running shows it (E5, E6, REQ-16, REQ-17)", async ({
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

    // REQ-17's 3 s is a duration, not just an eventual outcome — a bare `toBeHidden()`
    // below inherits the 15 s expect timeout, so a confirmation that lingers for
    // anywhere up to ~15 s would still pass. `addInitScript` re-runs on every fresh
    // document this `page` loads, including the reload REQ-16 triggers, so the observer
    // is already attached from the confirmation's very first paint on the post-reload
    // page — reading its own text/hidden mutations, not Playwright's poll timing, is what
    // makes the recorded shown/hidden timestamps trustworthy to within a few ms.
    await page.addInitScript(() => {
      const attach = (): void => {
        const banner = document.getElementById("banner");
        if (!banner) return;
        const events: Array<{ t: number; hidden: boolean; text: string }> = [];
        const observer = new MutationObserver(() => {
          events.push({
            t: performance.now(),
            hidden: Boolean(banner.hidden),
            text: banner.textContent ?? "",
          });
        });
        observer.observe(banner, {
          attributes: true,
          attributeFilter: ["hidden"],
          childList: true,
          subtree: true,
          characterData: true,
        });
        (window as unknown as { __bannerEvents?: typeof events }).__bannerEvents = events;
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attach);
      } else {
        attach();
      }
    });

    await page.goto(daemon.dashboardUrl);
    await expect(settingsBadgeDot(page)).toBeVisible();
    let dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${OLD_VERSION}`);

    // A marker on `window` survives only a WS reconnect (resilience.spec.ts already
    // proves an ordinary kill/restart never reloads); its disappearance is this test's
    // independent proof that REQ-16's `location.reload()` actually ran, alongside the
    // confirmation banner below.
    await page.evaluate(() => {
      (window as unknown as { __e2eMarker?: string }).__e2eMarker = "before-restart";
    });

    const confirm = await openUpdateRestartConfirm(page, dialog);
    await restartConfirmButton(confirm).click();

    // REQ-16/17: only the settled, post-reload confirmation is asserted here — the
    // transient "Updating musterd… — restarting" banner (REQ-14) is a sub-second display
    // during a real restart (plan Reviewer-Verified W11), which review-browser watches.
    const banner = page.getByRole("alert");
    await expect(banner).toHaveText(`Updated to v${NEW_VERSION}.`);

    // Shortened from the config's 15 s default (with this comment, per the harness's
    // "shorten only" rule): the fix schedules the hide within ~100 ms of the 3 s mark, so
    // 4.5 s leaves ample margin for CI jitter while still failing fast on the pre-fix
    // ~4 s behaviour instead of waiting out the full default.
    await expect(banner).toBeHidden({ timeout: 4_500 });

    const elapsedMs = await page.evaluate((wantText) => {
      const events = (
        window as unknown as {
          __bannerEvents?: Array<{ t: number; hidden: boolean; text: string }>;
        }
      ).__bannerEvents;
      if (!events) return null;
      const shownEvent = events.find((e) => !e.hidden && e.text === wantText);
      if (!shownEvent) return null;
      const hiddenEvent = events.find((e) => e.t > shownEvent.t && e.hidden);
      if (!hiddenEvent) return null;
      return hiddenEvent.t - shownEvent.t;
    }, `Updated to v${NEW_VERSION}.`);
    // kb:adr/update-restart-reloads-dashboard: the confirmation hides within about
    // 100 ms of the 3 s mark, widened here to allow for CI scheduling jitter without
    // admitting a ~1 s-late regression (a confirmation left to the next 1 s render tick
    // instead of its own scheduled hide misses this window by hundreds of ms).
    expect(elapsedMs).not.toBeNull();
    expect(elapsedMs as number).toBeGreaterThan(2_700);
    expect(elapsedMs as number).toBeLessThan(3_400);

    expect(
      await page.evaluate(() => (window as unknown as { __e2eMarker?: string }).__e2eMarker),
    ).toBeUndefined();

    dialog = await openSettingsDialog(page);
    await expect(updateRunningReadout(dialog)).toHaveText(`v${NEW_VERSION}`);
  } finally {
    if (staged) await staged.cleanup();
    await cleanup();
  }
});

test("dashboard still boots and connects when the window.sessionStorage accessor itself throws", async ({
  page,
  daemon,
}) => {
  // Chrome with site data blocked throws on the `sessionStorage` global GETTER itself,
  // not just its getItem/setItem/removeItem methods — a stricter case than a stubbed
  // StorageLike whose methods throw. `updaterestart.test.ts`'s own "edge 18" case proves
  // `initUpdateRestart` doesn't throw when constructed this way, against a mocked `app`
  // and `reload`; it can't prove the real dashboard still boots and opens its `/ws`
  // connection when `main.ts` constructs every controller against a real
  // `window.sessionStorage` this hostile — only a live page can. `addInitScript` installs
  // the throwing accessor before any page script runs, on the real built bundle.
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get(): never {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });

  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  // The ordinary daemon-down banner must still surface in this configuration too, not
  // just the initial connect — a guard that only fixes the boot path and leaves the rest
  // of the dashboard wired to the same throwing global would pass the two lines above and
  // still fail here.
  const banner = page.getByRole("alert");
  await daemon.kill();
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toHaveText(/musterd unreachable/i);
});

test("a window holding a restart record reloads on a mismatched-protocol reconnect without ever showing the mismatch screen (REQ-16, edge case 17)", async ({
  page,
  daemon,
}) => {
  // REQ-16/edge case 17: whatever protocolVersion a held record's first post-drop hello
  // carries, the window reloads rather than showing #protocol-mismatch. `location.reload()`
  // only schedules the navigation — ws.ts's dispatch keeps running synchronously past
  // `onHelloArrived`, so a naive gate could paint the mismatch screen for one frame before
  // the reload actually navigates away (this is exactly the race
  // `features/updaterestart.ts`'s `reloading()` plus `features/connection.ts`'s
  // `showProtocolMismatch()` gate close). Never through a real download or a real daemon
  // restart — no release check or apply is involved, so the plain `daemon` fixture is used
  // (per this file's own header note) and the restart record is armed directly by sending
  // a synthetic `update` broadcast over a routed `/ws`, the same technique actions.spec.ts's E14 test and
  // general-cleanup.spec.ts's pop-out test use to force a connection outage without
  // touching the daemon process.
  const MISMATCHED_PROTOCOL_VERSION = 99;

  // Every #protocol-mismatch/#app `hidden` mutation, timestamped on the Node side (not
  // the page's own clock, which resets across the reload this test triggers) via an
  // exposed function — `page.exposeFunction`-installed bindings "survive navigations"
  // (Playwright docs), unlike anything stored on `window`, so the log isn't lost when the
  // fix's own reload fires mid-test.
  const events: Array<{ t: number; mismatchHidden: boolean; appHidden: boolean }> = [];
  await page.exposeFunction(
    "__reportMismatchState",
    (mismatchHidden: boolean, appHidden: boolean) => {
      events.push({ t: Date.now(), mismatchHidden, appHidden });
    },
  );
  // Re-attaches on every fresh document (including the reload), same idiom as the E5/E6
  // test above's `#banner` observer.
  await page.addInitScript(() => {
    const attach = (): void => {
      const mismatchEl = document.getElementById("protocol-mismatch");
      const appEl = document.getElementById("app");
      if (!mismatchEl || !appEl) return;
      const report = (): void => {
        (
          window as unknown as {
            __reportMismatchState: (mismatchHidden: boolean, appHidden: boolean) => void;
          }
        ).__reportMismatchState(Boolean(mismatchEl.hidden), Boolean(appEl.hidden));
      };
      report();
      const observer = new MutationObserver(report);
      observer.observe(mismatchEl, { attributes: true, attributeFilter: ["hidden"] });
      observer.observe(appEl, { attributes: true, attributeFilter: ["hidden"] });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }
  });

  // Proxies the dashboard's one `/ws` transparently, except: (a) it exposes a way to push
  // a message to the page directly (arming the restart record with no real apply), (b) it
  // exposes a way to close the server-side connection (forcing a real disconnect/
  // reconnect, mirroring a daemon bounce, same technique actions.spec.ts's E14 test
  // uses), and (c) once armed, it rewrites the very next `hello` the real daemon sends to
  // carry an unsupported `protocolVersion` before relaying it — every other frame passes
  // through unchanged.
  const wsRoute: {
    sendToPage: ((raw: string) => void) | null;
    closeServer: (() => Promise<void>) | null;
  } = { sendToPage: null, closeServer: null };
  let rewriteNextHello = false;
  await page.routeWebSocket("**/ws", (ws) => {
    wsRoute.sendToPage = (raw) => ws.send(raw);
    const server = ws.connectToServer();
    wsRoute.closeServer = () => server.close();
    server.onMessage((message) => {
      if (rewriteNextHello && typeof message === "string") {
        const parsed: unknown = JSON.parse(message);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          (parsed as { type?: unknown }).type === "hello"
        ) {
          rewriteNextHello = false; // only the reconnect's own first hello is mismatched
          ws.send(JSON.stringify({ ...parsed, protocolVersion: MISMATCHED_PROTOCOL_VERSION }));
          return;
        }
      }
      ws.send(message);
    });
  });

  await page.goto(daemon.dashboardUrl);
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  // Only the reload this test triggers below should land here — the initial `goto`'s own
  // load has already resolved by the time this listener is registered.
  const loadTimes: number[] = [];
  page.on("load", () => loadTimes.push(Date.now()));

  // Arms a held restart record with no real apply — a hand-built, fully valid `update`
  // broadcast (every field `protocol/update.ts`'s `parseUpdateInfo` requires) with
  // `apply.phase: "restarting"`, the one shape `features/updaterestart.ts`'s `app.on(
  // "update", ...)` handler reads to set `record`.
  if (!wsRoute.sendToPage) throw new Error("expected the WS route to be active");
  wsRoute.sendToPage(
    JSON.stringify({
      type: "update",
      update: {
        running: "0.1.0",
        install: "installer",
        remedy: null,
        canCheck: true,
        available: "0.2.0",
        checkedAt: null,
        installed: null,
        apply: { phase: "restarting", version: "0.2.0", error: null },
      },
    }),
  );

  rewriteNextHello = true;
  if (!wsRoute.closeServer) throw new Error("expected the WS route to be active");
  await wsRoute.closeServer();

  // The reconnect's mismatched hello triggers the reload this test is checking for.
  await page.waitForEvent("load", { timeout: 10_000 });
  const reloadAt = loadTimes[0];
  if (reloadAt === undefined) throw new Error("expected the reload's load event to fire");

  // The reloaded page reconnects normally (its own hello is unmodified — the rewrite
  // only ever applied to the one hello that triggered the reload above), proving the
  // window ends up fully functional, not stuck.
  await expect(page.getByRole("status")).toHaveText(/connected/i, { timeout: 15_000 });

  // Guards against a vacuous pass: if the observer never attached, `events` would stay
  // empty and the filter below would trivially find nothing to complain about.
  expect(events.length).toBeGreaterThan(0);
  const beforeUnload = events.filter((e) => e.t < reloadAt);
  expect(beforeUnload.length).toBeGreaterThan(0);
  const flashed = beforeUnload.filter((e) => !e.mismatchHidden || e.appHidden);
  expect(flashed).toEqual([]);
});
