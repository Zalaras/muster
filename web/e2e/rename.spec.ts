// Plan ui-text-and-focus — REQ-9 through REQ-16 (the daemon-owned title override and
// its shared rename editor, #10). Plan acceptance: E4-E9, E11-E13.
//
// Every test takes the per-test `daemon` fixture (helpers/fixtures.ts): the mainhead
// rename tests rely on auto-focus of "the only session" (they never click their own
// card), the Tiles tests assert exact grid membership/order, one restarts the daemon,
// and E5 counts `PUT /api/prefs` requests — all daemon-global, none neighbour-safe.
import { expect, test } from "./helpers/fixtures";
import { queryEvents } from "./helpers/db";
import { envelopedSessionStart, envelopedStatusLineFull } from "./helpers/payloads";
import { railCard } from "./helpers/railorder";
import {
  findSession,
  getState,
  launchSession,
  mainheadRenameButton,
  mainheadRenameField,
  putTitleViaApi,
  scratchDirectory,
  sessionCard,
  tileRenameButton,
  tileRenameField,
  tileRenameFieldById,
} from "./helpers/session";
import {
  dragTileOnto,
  liveTile,
  stripCard,
  tileDragHandleById,
  tilesGridOrder,
} from "./helpers/terminal";

test("clicking the mainhead title opens a prefilled, selected field; Enter commits the new title everywhere (E4)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "rename-e4" });

    const button = mainheadRenameButton(page);
    await expect(button).toHaveText("rename-e4");
    await button.click();

    const field = mainheadRenameField(page);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("rename-e4");
    const selection = await field.evaluate((el) => {
      const input = el as HTMLInputElement;
      return { start: input.selectionStart, end: input.selectionEnd, length: input.value.length };
    });
    expect(selection.start).toBe(0);
    expect(selection.end).toBe(selection.length);
    expect(selection.length).toBeGreaterThan(0);

    await field.fill("hunting flake");
    await field.press("Enter");

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("hunting flake");
    await expect(railCard(page, "hunting flake")).toBeVisible();

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("hunting flake");
    expect(updated.titleOverride).toBe("hunting flake");
  } finally {
    await cleanup();
  }
});

test("a status-line post's session_name never overrides an active title override (E5)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "rename-e5" });
    const claudeId = "claude-rename-e5";

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("hunting flake e5");
    await mainheadRenameField(page).press("Enter");
    await expect(mainheadRenameButton(page)).toHaveText("hunting flake e5");

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        musterSession: session.id,
        sessionName: "Run echo hello",
      }),
    });

    // Proof the posts were actually processed, not merely "nothing changed because
    // nothing happened" — the sqlite oracle sessions.spec.ts already uses.
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length, {
        message: "waiting for the SessionStart and status-line posts to both persist",
      })
      .toBe(2);

    await expect(mainheadRenameButton(page)).toHaveText("hunting flake e5");
    await expect(railCard(page, "hunting flake e5")).toBeVisible();

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("hunting flake e5");
    expect(updated.titleOverride).toBe("hunting flake e5");
  } finally {
    await cleanup();
  }
});

test("clearing the field reverts the title to Claude's last-known name (E6)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "rename-e6" });
    const claudeId = "claude-rename-e6";

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("hunting flake e6");
    await mainheadRenameField(page).press("Enter");
    await expect(mainheadRenameButton(page)).toHaveText("hunting flake e6");

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });
    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        musterSession: session.id,
        sessionName: "claude's own name",
      }),
    });
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length, {
        message: "waiting for the SessionStart and status-line posts to both persist",
      })
      .toBe(2);
    // The override still wins on the wire while it's set (INV-1) — sanity before the clear.
    await expect(mainheadRenameButton(page)).toHaveText("hunting flake e6");

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("");
    await mainheadRenameField(page).press("Enter");

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("claude's own name");
    await expect(railCard(page, "claude's own name")).toBeVisible();

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("claude's own name");
    expect(updated.titleOverride).toBeNull();
  } finally {
    await cleanup();
  }
});

test("pressing Escape cancels an edit with the title unchanged and no PUT …/title request sent (E7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dir, title: "rename-e7" });

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("this should never be sent");
    await page.keyboard.press("Escape");

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("rename-e7");
    await expect(railCard(page, "rename-e7")).toBeVisible();
    expect(titlePuts).toBe(0);
  } finally {
    await cleanup();
  }
});

test("an override survives a daemon restart, on the mainhead/rail card, and in Tiles on both the strip card and the promoted tile's header (E8, E9)", async ({
  page,
  daemon,
}) => {
  test.setTimeout(90_000);
  const dirs = await Promise.all(Array.from({ length: 5 }, () => scratchDirectory()));
  try {
    await page.goto(daemon.dashboardUrl);
    const titles = dirs.map((_, i) => `restart-title-${i}`);
    const sessions = [];
    for (const [i, dir] of dirs.entries()) {
      sessions.push(
        await launchSession(page, daemon, { directory: dir.path, title: titles[i] ?? "" }),
      );
    }
    const overriddenSession = sessions[4];
    if (!overriddenSession) throw new Error("expected 5 launched sessions");
    await putTitleViaApi(page, daemon.baseURL, overriddenSession.id, "restarted override");

    await daemon.restart();
    await page.reload();

    // E8: Focus view — the overridden session's rail card shows the override; focusing
    // it puts the same text on the mainhead.
    const cardOverridden = railCard(page, "restarted override");
    await expect(cardOverridden).toBeVisible({ timeout: 15_000 });
    await cardOverridden.click();
    await expect(page.locator("#mainhead .name")).toHaveText("restarted override");

    // E9: Tiles — with 5 sessions and the default 2x2 grid (capacity 4), exactly one
    // is stripped by manual (creation) order; that must be the 5th/overridden one, so
    // its strip card is the first place the override title has to render correctly.
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const live: string[] = [];
    const stripped: string[] = [];
    for (const t of ["restart-title-0", "restart-title-1", "restart-title-2", "restart-title-3"]) {
      if ((await liveTile(page, t).count()) > 0) live.push(t);
    }
    if ((await liveTile(page, "restarted override").count()) > 0) live.push("restarted override");
    else stripped.push("restarted override");
    expect(live).toHaveLength(4);
    expect(stripped).toEqual(["restarted override"]);

    const strip = stripCard(page, "restarted override");
    await expect(strip).toBeVisible();

    // Promote it — the resulting live tile's header must show the SAME override title.
    await strip.click();
    await expect(stripCard(page, "restarted override")).toHaveCount(0);
    await expect(liveTile(page, "restarted override")).toBeVisible({ timeout: 15_000 });
  } finally {
    await Promise.all(dirs.map((d) => d.cleanup()));
  }
});

test("renaming a live tile's header updates that tile, leaves a neighbour tile untouched, and reaches Focus's rail/mainhead; the header is undraggable only while editing (E11, E12)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "rename-tile-a",
    });
    await launchSession(page, daemon, { directory: dirB.path, title: "rename-tile-b" });
    // A is launched (and therefore focused) first — switching views doesn't change
    // focusedId, so Focus's mainhead already tracks A once we switch back.
    await expect(page.locator("#mainhead .name")).toHaveText("rename-tile-a");

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Id-scoped (not title-scoped): this locator is asserted before, during, and
    // after the rename below, and the tile's title text changes across all three
    // (validate-mode repair — see tileDragHandleById's doc comment).
    const handleA = tileDragHandleById(page, sessionA.id);
    await expect(handleA).toHaveAttribute("draggable", "true");

    await tileRenameButton(page, "rename-tile-a").click();
    // Scoped by session id, not title text: the click above just swapped the tile's
    // rename button for `input.name-edit`, whose value now carries "rename-tile-a"
    // as a form-control value rather than textContent — `tileRenameField`'s
    // title-text filter would no longer match this tile at all (validate-mode repair).
    const field = tileRenameFieldById(page, sessionA.id);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("rename-tile-a");

    // E12: undraggable exactly while this tile's edit is open.
    await expect(handleA).toHaveAttribute("draggable", "false");

    await field.fill("renamed via tile");
    await field.press("Enter");

    await expect(tileRenameField(page, "renamed via tile")).toHaveCount(0);
    await expect(liveTile(page, "renamed via tile")).toBeVisible();
    await expect(handleA).toHaveAttribute("draggable", "true");

    // Neighbour tile B is untouched (multi-session safety).
    await expect(tileRenameButton(page, "rename-tile-b")).toHaveText("rename-tile-b");

    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#mainhead .name")).toHaveText("renamed via tile");
    await expect(railCard(page, "renamed via tile")).toBeVisible();
    await expect(railCard(page, "rename-tile-b")).toBeVisible();

    const state = await getState(page, daemon);
    const updated = findSession(state, sessionA.id);
    expect(updated.title).toBe("renamed via tile");
    expect(updated.titleOverride).toBe("renamed via tile");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a header drag still reorders the Tiles grid and opens no rename textbox (E13)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    await launchSession(page, daemon, { directory: dirA.path, title: "drag-tile-a" });
    await launchSession(page, daemon, { directory: dirB.path, title: "drag-tile-b" });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => tilesGridOrder(page)).toEqual(["drag-tile-a", "drag-tile-b"]);

    await dragTileOnto(page, "drag-tile-a", "drag-tile-b");

    await expect
      .poll(() => tilesGridOrder(page), { timeout: 15_000 })
      .toEqual(["drag-tile-b", "drag-tile-a"]);
    await expect(page.getByRole("textbox", { name: "Session title" })).toHaveCount(0);
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a status-line post arriving mid-edit leaves the open mainhead field's value and focus untouched (REQ-15, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "rename-inv4" });
    const claudeId = "claude-rename-inv4";

    await request.post(daemon.ingestURL("hook"), {
      data: envelopedSessionStart(claudeId, { musterSession: session.id }),
    });

    await mainheadRenameButton(page).click();
    const field = mainheadRenameField(page);
    // Real per-key events (not `.fill()`) — the whole point is that a render tick
    // landing mid-typing must not disturb the field, so the field's own live state
    // (focus, selection-driven insert) has to be genuine keyboard input.
    await field.pressSequentially("wip", { delay: 5 });
    await expect(field).toHaveValue("wip");

    await request.post(daemon.ingestURL("status"), {
      data: envelopedStatusLineFull(claudeId, {
        musterSession: session.id,
        sessionName: "posted while editing",
        contextUsedPct: 77,
      }),
    });
    await expect
      .poll(async () => (await queryEvents(daemon.dbPath, claudeId)).length, {
        message: "waiting for the SessionStart and status-line posts to both persist",
      })
      .toBe(2);

    // The post was processed (proven above); the open field must be untouched by it.
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("wip");
    await expect(mainheadRenameButton(page)).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

// review cycle 1, Critical 1 / Major 2 ("[e2e-specs] No spec covers REQ-15's
// view-switch cancel"): a view switch must cancel an open rename with NO PUT, on
// both surfaces and by both mechanisms web-impl's fix log distinguishes — a cmd-backslash
// keydown (never moves DOM focus, caught by the `applyPrefsFromSnapshot` cancel) and a
// direct mouse click on the masthead Focus/Tiles buttons (blurs synchronously on
// `mousedown`, before `click`'s own `requestView()` — caught only by the buttons' own
// `mousedown` listener calling `cancelOpenRenames()`). Each case below is the reviewer's
// own repro: type into an editor, switch the view, and assert nothing was sent.

test("switching to Focus via cmd-backslash while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "viewswitch-cmdbs",
    });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await tileRenameButton(page, "viewswitch-cmdbs").click();
    const field = tileRenameFieldById(page, session.id);
    await expect(field).toBeFocused();
    await field.fill("TYPED BUT NEVER COMMITTED");

    await page.keyboard.press("Meta+\\");

    // The view actually switched (proves the cmd-backslash handler ran, not just that nothing
    // happened) while the title was still left alone.
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(0);

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.titleOverride).toBeNull();
    expect(updated.title).toBe("viewswitch-cmdbs");
  } finally {
    await cleanup();
  }
});

test("clicking the masthead Focus button while a tile rename is open sends no PUT and leaves the title unchanged (REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "viewswitch-click",
    });

    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await tileRenameButton(page, "viewswitch-click").click();
    const field = tileRenameFieldById(page, session.id);
    await expect(field).toBeFocused();
    await field.fill("CLICK PATH SHOULD NOT COMMIT");

    // A direct click, not cmd-backslash — this is the mouse path web-impl's fix log found
    // failing first (a `mousedown` default-action blur races ahead of `requestView`).
    await page.getByRole("button", { name: "Focus" }).click();

    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(0);

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.titleOverride).toBeNull();
    expect(updated.title).toBe("viewswitch-click");
  } finally {
    await cleanup();
  }
});

test("switching to Tiles while the mainhead rename is open sends no PUT and leaves the title unchanged (REQ-15)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "viewswitch-mainhead",
    });

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("MAINHEAD TYPED BUT NEVER COMMITTED");

    // Either path reaches the same `cancelOpenRenames()` call; the click path is the
    // one the review named explicitly ("the masthead in the mirror direction").
    await page.getByRole("button", { name: "Tiles" }).click();

    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(0);

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.titleOverride).toBeNull();
    expect(updated.title).toBe("viewswitch-mainhead");

    // Back on Focus, the heading must still read the pre-edit title (no stray commit
    // reached it either).
    await page.getByRole("button", { name: "Focus" }).click();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(mainheadRenameButton(page)).toHaveText("viewswitch-mainhead");
  } finally {
    await cleanup();
  }
});

// Plan claude-status-fixes REQ-6/REQ-7 (follow-up from ui-text-and-focus review cycle 2
// Minor 1): the view-switcher `mousedown` listeners at web/src/main.ts:884-885
// unconditionally cancel any open rename today. This plan guards them — cancel only on
// a primary-button mousedown whose target view differs from the current view — so the
// two cases below are new behaviour, not yet built; EXPECTED TO FAIL until web-impl
// lands the guard. The three existing "switching to..." tests above (cmd-backslash, the
// masthead Focus click, and the masthead Tiles click) all cancel via the *inactive*
// segment and are unaffected by this change — deliberately left unedited as REQ-7's
// regression pins.
//
// Update (validate mode): the authoring pass flagged that the plan's Affected Files
// section named only the two `mousedown` listeners, leaving the paired `click` →
// `requestView()` listeners unguarded — which would have left a same-view
// `PUT /api/prefs` firing even after this plan landed, contradicting REQ-6's own prose
// ("no prefs request... for the view"). web-impl's implementation log records guarding
// the `click` listeners too, as a superset of the plan's stated scope, per the
// orchestrator's explicit instruction. E5 below now asserts that absence directly.

test("clicking the pressed view segment while its own rename editor is open commits instead of cancelling, on both the mainhead and a tile header (E5)", async ({
  page,
  daemon,
}) => {
  const [dirA, dirB] = await Promise.all([scratchDirectory(), scratchDirectory()]);
  try {
    await page.goto(daemon.dashboardUrl);
    const sessionA = await launchSession(page, daemon, {
      directory: dirA.path,
      title: "active-seg-mainhead",
    });
    const sessionB = await launchSession(page, daemon, {
      directory: dirB.path,
      title: "active-seg-tile",
    });

    let titlePuts = 0;
    let prefsPuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      const pathname = new URL(req.url()).pathname;
      if (/^\/api\/sessions\/\d+\/title$/.test(pathname)) titlePuts++;
      if (pathname === "/api/prefs") prefsPuts++;
    });

    // Mainhead: default view is Focus, already pressed.
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("active segment commit mainhead");
    await page.getByRole("button", { name: "Focus" }).click(); // the already-active segment

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("active segment commit mainhead");
    await expect(railCard(page, "active segment commit mainhead")).toBeVisible();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(1);
    // REQ-6 ("no prefs request... for the view"): the already-active segment's click
    // guard now also skips `requestView`, so this commit-only click sends no
    // `PUT /api/prefs` — web-impl's fix log confirms the click listener, not just the
    // mousedown listener, was guarded. No view switch has happened yet at all, so 0.
    expect(prefsPuts).toBe(0);

    // Tile mirror: switch to Tiles first (no editor open yet, so the guard is inert
    // for this click). This IS a real view change, so it legitimately sends one
    // `PUT /api/prefs` — the assertion below isolates the active-segment click that
    // follows, not this genuine switch.
    await page.getByRole("button", { name: "Tiles" }).click();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const prefsPutsAfterRealSwitch = prefsPuts;
    expect(prefsPutsAfterRealSwitch).toBe(1);

    await tileRenameButton(page, "active-seg-tile").click();
    const tileField = tileRenameFieldById(page, sessionB.id);
    await expect(tileField).toBeFocused();
    await tileField.fill("active segment commit tile");
    await page.getByRole("button", { name: "Tiles" }).click(); // the already-active segment

    await expect(tileRenameFieldById(page, sessionB.id)).toHaveCount(0);
    await expect(tileRenameButton(page, "active segment commit tile")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(2);
    // The already-active Tiles click sends no further prefs PUT beyond the one real
    // switch above.
    expect(prefsPuts).toBe(prefsPutsAfterRealSwitch);

    const state = await getState(page, daemon);
    expect(findSession(state, sessionA.id).title).toBe("active segment commit mainhead");
    expect(findSession(state, sessionB.id).title).toBe("active segment commit tile");
  } finally {
    await Promise.all([dirA.cleanup(), dirB.cleanup()]);
  }
});

test("a right-click on the inactive Tiles segment while a mainhead rename is open does not cancel it — no click fires, the blur commits, and the view stays Focus (E6, REQ-7)", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, {
      directory: dir,
      title: "right-click-guard",
    });

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("right click should commit");

    // A right-click's mousedown still fires (any button), but REQ-7 only cancels on
    // e.button === 0 — and no `click` event follows a non-primary button, so
    // `requestView` never runs either. The native mousedown-default blur still
    // reaches the field's own `onBlur`, which commits per ordinary REQ-14 semantics.
    await page.getByRole("button", { name: "Tiles" }).click({ button: "right" });

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("right click should commit");
    await expect(railCard(page, "right click should commit")).toBeVisible();
    await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(titlePuts).toBe(1);

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("right click should commit");
    expect(updated.titleOverride).toBe("right click should commit");
  } finally {
    await cleanup();
  }
});

test("clicking an unrelated control (New session) still commits an open mainhead rename, per ordinary REQ-14 blur semantics", async ({
  page,
  daemon,
}) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "blur-commit-ok" });

    let titlePuts = 0;
    page.on("request", (req) => {
      if (req.method() !== "PUT") return;
      if (/^\/api\/sessions\/\d+\/title$/.test(new URL(req.url()).pathname)) titlePuts++;
    });

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("committed via blur");

    // "New session" is not one of the two view-switch buttons carrying the
    // mousedown-cancel guard, so this is REQ-14's ordinary path: the field's own
    // `onBlur` commits, same as it always did.
    await page.locator("#view-focus").getByRole("button", { name: "New session" }).click();

    await expect(mainheadRenameField(page)).toHaveCount(0);
    await expect(mainheadRenameButton(page)).toHaveText("committed via blur");
    await expect(railCard(page, "committed via blur")).toBeVisible();
    expect(titlePuts).toBe(1);

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("committed via blur");
    expect(updated.titleOverride).toBe("committed via blur");
  } finally {
    await cleanup();
  }
});

test("a rename works on a dead session (REQ-16)", async ({ page, daemon }) => {
  const { path: dir, cleanup } = await scratchDirectory();
  try {
    await page.goto(daemon.dashboardUrl);
    const session = await launchSession(page, daemon, { directory: dir, title: "rename-dead" });
    const endRes = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
    expect(endRes.status()).toBe(200);
    await expect(sessionCard(page, "rename-dead")).toBeVisible();

    await mainheadRenameButton(page).click();
    await mainheadRenameField(page).fill("renamed after death");
    await mainheadRenameField(page).press("Enter");

    await expect(mainheadRenameButton(page)).toHaveText("renamed after death");
    await expect(railCard(page, "renamed after death")).toBeVisible();

    const state = await getState(page, daemon);
    const updated = findSession(state, session.id);
    expect(updated.title).toBe("renamed after death");
    expect(updated.titleOverride).toBe("renamed after death");
    expect(updated.alive).toBe(false);
  } finally {
    await cleanup();
  }
});
