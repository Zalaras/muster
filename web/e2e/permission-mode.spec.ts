import { expect, test } from "@playwright/test";
import { basename } from "node:path";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import { envelopedSessionStart, rawUserPromptSubmit } from "./helpers/payloads";
import { childEntry, launchDialog, launchTargetPath, openLaunchDialog, recentButton } from "./helpers/picker";
import {
  browseScratchDirectory,
  findSession,
  getState,
  launchSession,
  scratchDirectory,
  sessionCard,
  stateBadge,
} from "./helpers/session";

// Plan fix-auto-mode-select (closes #12): the "Start in" radiogroup's three existing
// labels are renamed to Claude Code's own vocabulary (manual/accept edits/plan) and
// gains a fourth radio, `auto`, which the dialog can now actually request end-to-end.
// REQ-1..6, INV-1..2. Plan acceptance: E1-E4 (E5 = the renamed locators in
// launch.spec.ts, E6 = `make e2e`).
//
// Recents (GET /api/repos order/pressed-state) are asserted precisely, so — per
// launch.spec.ts's own convention — every test gets its own scratch daemon rather than
// sharing one across parallel tests.

async function withDaemon<T>(fn: (daemon: ScratchDaemon) => Promise<T>): Promise<T> {
  const daemon = await startScratchDaemon();
  try {
    return await fn(daemon);
  } finally {
    await daemon.teardown();
  }
}

// Regression pin (runs live at authoring — REQ-1 only renames labels and adds a fourth
// radio; the radiogroup's own role and accessible name are the plan's one row explicitly
// marked "existing aria-label; unchanged" in the Testable UI Elements table).
test('the "Start in" radiogroup keeps its role and accessible name across the rename (REQ-1 regression)', async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    await page.goto(daemon.dashboardUrl);
    const dialog = await openLaunchDialog(page);
    await expect(dialog.getByRole("radiogroup", { name: "Start in" })).toBeVisible();
  });
});

test("picking auto and launching sends permissionMode: auto and seeds the session's latch; re-opening the dialog on that directory shows auto checked (E1, E2)", async ({
  page,
}) => {
  await withDaemon(async (daemon) => {
    const dir = await browseScratchDirectory(daemon, "muster-e2e-auto-");
    try {
      await page.goto(daemon.dashboardUrl);
      const dialog = await openLaunchDialog(page);
      await childEntry(dialog, basename(dir.path)).click();
      await expect(launchTargetPath(dialog)).toHaveText(dir.path);

      await dialog.getByRole("radio", { name: "auto" }).check();
      await dialog.getByLabel("Title").fill("auto-launch-e1");
      await dialog.getByRole("button", { name: "Launch" }).click();
      await expect(dialog).toBeHidden();

      // E1: daemon API oracle — the launched session's own permissionMode, not the
      // dialog's rendering of what it thinks it sent.
      const state = await getState(page, daemon);
      const launchedMatches = state.sessions.filter((s) => s.title === "auto-launch-e1");
      expect(launchedMatches, "exactly one session launched, no spurious extra").toHaveLength(1);
      const [launched] = launchedMatches;
      if (!launched) throw new Error("unreachable: toHaveLength(1) just passed");
      expect(launched.permissionMode).toEqual({ value: "auto", source: "seed" });

      // E2: re-opening the dialog on the same directory pre-selects auto — the
      // per-directory launch default (REQ-4).
      await page.keyboard.press("Alt+Meta+KeyN");
      const reopened = launchDialog(page);
      await expect(reopened).toBeVisible();
      await expect(recentButton(reopened, basename(dir.path))).toHaveAttribute("aria-pressed", "true");
      await expect(reopened.getByRole("radio", { name: "auto" })).toBeChecked();
    } finally {
      await dir.cleanup();
    }
  });
});

test("a synthesized UserPromptSubmit with permission_mode: default corrects an auto-seeded session to default/hook and working, not planning (E3, REQ-5)", async ({
  page,
  request,
}) => {
  await withDaemon(async (daemon) => {
    const dir = await scratchDirectory();
    try {
      await page.goto(daemon.dashboardUrl);
      const session = await launchSession(page, daemon, {
        directory: dir.path,
        title: "auto-haiku-fallback-e3",
        permissionMode: "auto",
      });
      expect(session.permissionMode).toEqual({ value: "auto", source: "seed" });
      const card = sessionCard(page, "auto-haiku-fallback-e3");

      const claudeId = "claude-e3-auto-fallback";
      await request.post(daemon.ingestURL("hook"), {
        data: envelopedSessionStart(claudeId, { musterSession: session.id }),
      });
      // Measured (spikes/canary-fields.md, "Permission-mode probe" 2.1.259): on a model
      // that can't run auto (haiku), Claude Code silently drops to manual and hooks
      // report "default" — this is the measured haiku-fallback shape, not an invented one.
      await request.post(daemon.ingestURL("hook"), {
        data: rawUserPromptSubmit(claudeId, { permissionMode: "default" }),
      });

      await expect(stateBadge(card)).toHaveText(/working/i);
      // Not "planning" — the correction lands the session in the ordinary working state,
      // per REQ-5's "in working, not planning".
      await expect(card.getByText(/planning/i)).toHaveCount(0);

      const state = await getState(page, daemon);
      const found = findSession(state, session.id);
      // INV-1: source flips seed -> hook forever after, and the value is always the last
      // one carried — the auto instance of the same invariant the three existing seeds
      // already exercise elsewhere.
      expect(found.permissionMode).toEqual({ value: "default", source: "hook" });
    } finally {
      await dir.cleanup();
    }
  });
});

// E4/INV-2: each of the four possible stored `lastPermissionMode` values pre-selects the
// matching radio on reopen. The `plan` case is the plan's one row unaffected by the
// REQ-1 rename (both the stored value and the radio's label are unchanged) and is
// therefore run live at authoring as a regression pin; the other three depend on the new
// labels/value and so are collection-only until web-impl lands.
const storedModeCases: Array<{ stored: "default" | "plan" | "acceptEdits" | "auto"; radioName: string }> = [
  { stored: "default", radioName: "manual" },
  { stored: "plan", radioName: "plan" },
  { stored: "acceptEdits", radioName: "accept edits" },
  { stored: "auto", radioName: "auto" },
];

for (const { stored, radioName } of storedModeCases) {
  test(`a stored lastPermissionMode of "${stored}" pre-selects the "${radioName}" radio on reopen (E4, INV-2)`, async ({
    page,
  }) => {
    await withDaemon(async (daemon) => {
      const dir = await browseScratchDirectory(daemon, "muster-e2e-mode-");
      try {
        await page.goto(daemon.dashboardUrl);
        await launchSession(page, daemon, {
          directory: dir.path,
          title: `mode-seed-${stored}`,
          permissionMode: stored,
        });

        const dialog = await openLaunchDialog(page);
        await expect(dialog.getByRole("radio", { name: radioName })).toBeChecked();
      } finally {
        await dir.cleanup();
      }
    });
  });
}
