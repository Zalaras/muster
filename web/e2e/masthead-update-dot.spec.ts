import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVersionedMusterd, type StagedBinary, stageBinary } from "./helpers/daemon";
import { expect, test } from "./helpers/fixtures";
import {
  connectionBanner,
  connectionStatus,
  healthViolations,
  recordHealth,
  TITLE_CONNECTED,
  TITLE_UPDATING,
} from "./helpers/masthead";
import { FakeReleaseServer } from "./helpers/releases";
import { launchSession, scratchDirectory } from "./helpers/session";
import { openSettingsDialog } from "./helpers/theme";
import { openUpdateRestartConfirm, restartConfirmButton, settingsBadgeDot } from "./helpers/update";

// Plan masthead-indicators E6 / INV-1: the dot is yellow (pending) while the dashboard's
// own Update-and-restart restarts musterd and the updating banner shows, then green after
// the new daemon's hello. The restart goes through the real apply pipeline against a
// FakeReleaseServer (helpers/releases.ts, never the real release host) with a staged
// installer binary, exactly as update.spec.ts E5/E12 do.
//
// Fixture plan: `startDaemon`, because the daemon's `-update-base-url`, public-key file
// and binary are computed in the test. No Claude Code is faked here beyond the one
// launched session that has to survive the restart: this plan adds no ingest path.

const OLD_VERSION = "0.1.0";
const NEW_VERSION = "0.2.0";
const NEW_TAG = `v${NEW_VERSION}`;

test("during Update and restart the dot is pending with the restarting title while the updating banner shows, then ok after the new hello, agreeing with the banner at every render (E6, REQ-6, REQ-8, INV-1)", async ({
  page,
  startDaemon,
}) => {
  const fakeServer = await FakeReleaseServer.start();
  const keyDir = await mkdtemp(join(tmpdir(), "muster-e2e-masthead-dot-pubkey-"));
  const pubKeyPath = join(keyDir, "minisign.pub");
  await fakeServer.writePublicKey(pubKeyPath);
  const { path: dir, cleanup: cleanupDir } = await scratchDirectory();
  let staged: StagedBinary | undefined;
  try {
    staged = await stageBinary(await buildVersionedMusterd(OLD_VERSION));
    const newBinary = await buildVersionedMusterd(NEW_VERSION);
    await fakeServer.publish({ tag: NEW_TAG, binaryPath: newBinary });
    fakeServer.setLatest(NEW_TAG);
    const daemon = await startDaemon({
      binary: staged.path,
      updateBaseURL: fakeServer.baseURL,
      updatePublicKeyFile: pubKeyPath,
    });

    // Recorded across the reload the restart triggers (kb:adr/update-restart-reloads-dashboard).
    const samples = await recordHealth(page);
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "mi-update-dot" });

    const status = connectionStatus(page);
    await expect(status).toHaveAttribute("data-health", "ok");
    await expect(status).toHaveAttribute("title", TITLE_CONNECTED);
    await expect(settingsBadgeDot(page)).toBeVisible();

    const dialog = await openSettingsDialog(page);
    const confirm = await openUpdateRestartConfirm(page, dialog);
    await restartConfirmButton(confirm).click();

    const banner = connectionBanner(page);
    await expect(banner).toBeVisible();
    await expect(banner).toBeHidden();

    // The restart is a few hundred ms, shorter than any assertion's poll, so the window
    // where the dot was pending is read back from the per-render record rather than raced.
    const during = samples.filter(
      (s) => !s.bannerHidden && !s.bannerNeutral && /^Updating musterd/.test(s.bannerText),
    );
    expect(during.length, "the updating banner was recorded at least once").toBeGreaterThan(0);
    for (const sample of during) {
      expect(sample.health).toBe("pending");
      expect(sample.title).toBe(TITLE_UPDATING);
      expect(sample.word).toBe("reconnecting…");
    }

    // After the new daemon's hello the reloaded dashboard is green, the neutral
    // "Updated to v…" confirmation (edge case 9) included.
    await expect(status).toHaveAttribute("data-health", "ok");
    await expect(status).toHaveText("connected");
    await expect(status).toHaveAttribute("title", TITLE_CONNECTED);
    expect(
      samples.some((s) => !s.bannerHidden && s.bannerNeutral && s.health === "ok"),
      "the neutral confirmation banner was recorded beside an ok dot",
    ).toBe(true);
    expect(healthViolations(samples)).toEqual([]);
  } finally {
    if (staged) await staged.cleanup();
    await cleanupDir();
    await fakeServer.stop();
    await rm(keyDir, { recursive: true, force: true });
  }
});
