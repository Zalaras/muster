import { type APIRequestContext, expect, type ScratchDaemon, test } from "./helpers/fixtures";
import { envelopedSessionStart, rawNotification, rawUserPromptSubmit } from "./helpers/payloads";
import {
  envelopeOpts,
  launchSession,
  scratchDirectory,
  type SessionObject,
  stateBadge,
} from "./helpers/session";
import { liveTile, stripCard } from "./helpers/terminal";

// Plan shortcut-fixes — REQ-1 through REQ-9 (Must Have), the rebind of the whole session-
// shortcut family onto ⌥⌘ chords Safari and Chrome both leave alone (spikes/S5-key-probe.md
// is the measurement authority for INV-1 — reviewer-verified, NOT re-verified here: per
// Implementation Notes > Measurement, "no agent may 'verify' INV-1 with a Playwright run").
// Plan acceptance E1-E10, INV-3 and ⌥⌘0's edge cases 2, 3, 4 and 6 are render tests in
// web/render/shortcuts.spec.ts since 2026-10-20 (plans/_audit/relevel/shortcuts-views-tiles.md):
// what a chord does to the page for a given snapshot needs no daemon to falsify. What stays
// here is the one journey — ⌥⌘0 in Tiles promoting a session that became the neediest only
// after the grid was filled, which only a hook can produce (Tiles membership is sticky, so the
// state is unreachable from a snapshot).
//
// The test presses the NEW chord only. Per the plan's Automated Checks dry-run note,
// "no test has a legitimate reason to press a chord Muster no longer binds" — so this file
// never presses "Meta+n" or a bare "Meta+<digit>" (W13/W14's negative greps are aimed
// exactly at that). Chords are pressed via Playwright's code-based key names
// (`Digit0`-`Digit9`), matching the plan's "matching moves to event.code" rule.
//
// The test takes the per-test `daemon` fixture (helpers/fixtures.ts; mirrors
// rail-order.spec.ts/views.spec.ts's rationale): live-tile-membership assertions read full
// DOM state that a concurrently-running test's sessions would corrupt.

/** Drives a session to `needs_input` via the real ingest endpoints (SessionStart ->
 * UserPromptSubmit -> a permission Notification), exactly per kb:anchor/state.transitions — copied
 * from rail-order.spec.ts's local helper of the same name/shape (each spec file keeps
 * its own copy of this helper rather than sharing one, matching that file's pattern). */
async function makeNeedsInput(
  request: APIRequestContext,
  daemon: ScratchDaemon,
  session: SessionObject,
  claudeId: string,
): Promise<void> {
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
  });
  await request.post(daemon.ingestURL("hook"), { data: rawUserPromptSubmit(claudeId) });
  await request.post(daemon.ingestURL("hook"), {
    data: rawNotification(claudeId, "p1", "permission_prompt"),
  });
}

test("pressing Opt+Cmd+0 in Tiles promotes the neediest session into the grid (INV-5)", async ({
  page,
  request,
  daemon,
}) => {
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `e6b-${i}`);
    const sessions: SessionObject[] = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(
        await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }),
      );
    }

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "2×2" })).toHaveAttribute("aria-pressed", "true");

    let strippedIdx = -1;
    for (const [i, t] of titles.entries()) {
      if ((await liveTile(page, t).count()) === 0) strippedIdx = i;
    }
    if (strippedIdx === -1) throw new Error("expected exactly one stripped title");
    const strippedTitle = titles[strippedIdx];
    const strippedSession = sessions[strippedIdx];
    if (!strippedTitle || !strippedSession) throw new Error("unreachable");

    await makeNeedsInput(request, daemon, strippedSession, "claude-e6b");
    await expect(stateBadge(stripCard(page, strippedTitle))).toHaveText(/needs input/i);

    await page.keyboard.press("Alt+Meta+Digit0");

    await expect(liveTile(page, strippedTitle)).toBeVisible();
    await expect(stripCard(page, strippedTitle)).toHaveCount(0);
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});
