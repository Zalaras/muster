// Session notes (a persistent, markdown-rendered note per session, edited from
// the Focus header's glyph and peeked from the card and tile markers) and the journeys the
// requirements put across the live daemon. What the display shows for a
// given state (the glyph's colours at every header width, the marker's place on the repo line,
// the hover panel's cut-off, the panel's rectangle after a drag past each edge, undo and redo,
// the unsaved status colour) are render tests (web/render/notes.spec.ts).
//
// Fixture plan: `daemon` (fresh per test), as the plan's header says. Every test launches the
// only session or a known pair and relies on auto-focus, one restarts or stops the daemon, and
// one asserts what a second window (its own browser context, so no shared local storage) sees of
// the same session.
//
// Claude Code is faked: a bind is the enveloped `SessionStart` a real `claude` posts first and a
// turn is a raw `UserPromptSubmit`, both builders from helpers/payloads.ts. The note itself has
// no Claude Code source, so the only input path is the endpoint the panel drives, and
// `PUT /api/sessions/{id}/note` through the page's cookie is used only to build a starting state,
// never as the evidence for a journey.
//
// Every edit here goes through the keyboard and pointer a developer has. Focus-bearing
// controls are focused, activated with a real key and re-read across a render tick, because the
// panel and the header are rebuilt on state and tick passes
// (kb:lesson/select-rebuilt-every-tick-passed-selectoption).
import { expect, settleFor, test } from "./helpers/fixtures";
import type { APIRequestContext, Page, ScratchDaemon } from "./helpers/fixtures";
import { focusedNode, tagNode } from "./helpers/focus-header";
import {
  activeElementInsideNotePanel,
  cardNoteMarker,
  closeNoteButton,
  dragPointer,
  emptyNoteLine,
  noteEditor,
  noteGlyph,
  noteOnWire,
  notePanel,
  noteStatus,
  popInButton,
  popOutButton,
  putNoteViaApi,
} from "./helpers/notes";
import { envelopedSessionStart, rawUserPromptSubmit } from "./helpers/payloads";
import { removeFromCardMenu } from "./helpers/rail-menu";
import {
  envelopeOpts,
  getState,
  launchSession,
  mainheadHeading,
  scratchDirectory,
  sessionCard,
  type SessionObject,
} from "./helpers/session";
import { activeElementInsideTerminal, terminalRegion } from "./helpers/terminal";
import { WsByteRecorder } from "./helpers/shellinput";
import { resolvedCssVar } from "./helpers/theme";

const cleanups: Array<() => Promise<void>> = [];

test.afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** Launches a session, binds it with the `SessionStart` a real `claude` posts, and optionally
 * seeds its note through the endpoint (a starting state, not a journey). */
async function launchNoted(
  page: Page,
  request: APIRequestContext,
  daemon: ScratchDaemon,
  title: string,
  note: string | null = null,
): Promise<{ session: SessionObject; claudeId: string }> {
  const { path, cleanup } = await scratchDirectory();
  cleanups.push(cleanup);
  const session = await launchSession(page, daemon, { directory: path, title });
  const claudeId = `claude-${title}`;
  await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(claudeId, await envelopeOpts(session, daemon)),
  });
  if (note !== null) await putNoteViaApi(page, daemon.baseURL, session.id, note);
  return { session, claudeId };
}

/** Opens the anchored panel of a note-less session by clicking the glyph and enters edit mode
 * with a real click on the empty-note line. */
async function openAndEdit(page: Page): Promise<void> {
  await noteGlyph(page).click();
  await expect(emptyNoteLine(page)).toBeVisible();
  await emptyNoteLine(page).click();
  await expect(noteEditor(page)).toBeFocused();
}

/** Selects the editor's whole text and replaces it by typing. */
async function replaceText(page: Page, text: string): Promise<void> {
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(text);
}

/** A click inside the terminal region but away from the popped-out panel's default corner. */
async function clickTerminalClear(page: Page, title: string): Promise<void> {
  const region = terminalRegion(page, title);
  const box = await region.boundingBox();
  if (!box) throw new Error("terminal region has no box");
  await region.click({ position: { x: 24, y: box.height - 24 } });
}

test("typing a note and leaving edit mode turns the glyph foreground and shows the rail marker, and a reload shows the same text rendered (E1, REQ-6, REQ-7, REQ-8, REQ-18)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e1");
  const card = sessionCard(page, "note-e1");
  await expect(mainheadHeading(page)).toContainText("note-e1");

  const fg = await resolvedCssVar(page, "--fg", "color");
  await expect(noteGlyph(page)).not.toHaveCSS("color", fg);
  await expect(cardNoteMarker(card)).toHaveCount(0);

  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await expect(notePanel(page)).toContainText(/Note\s*·\s*note-e1/);
  await expect(emptyNoteLine(page)).toBeVisible();

  await emptyNoteLine(page).click();
  await expect(noteEditor(page)).toBeFocused();
  await page.keyboard.type("## Where I am\n\nPlan written, ask about the migration next");
  await page.keyboard.press("Escape");

  await expect(noteEditor(page)).toHaveCount(0);
  await expect(notePanel(page)).toBeVisible();
  await expect(notePanel(page).getByRole("heading", { name: "Where I am" })).toBeVisible();
  await expect(notePanel(page)).toContainText("Plan written, ask about the migration next");
  await expect(notePanel(page)).not.toContainText("##");

  await expect(noteGlyph(page)).toHaveCSS("color", fg);
  await expect(cardNoteMarker(card)).toHaveCount(1);
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), { message: "the note reached musterd" })
    .toBe("## Where I am\n\nPlan written, ask about the migration next");

  await page.reload();
  await expect(mainheadHeading(page)).toContainText("note-e1");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("Plan written, ask about the migration next");
  await expect(notePanel(page).getByRole("heading", { name: "Where I am" })).toBeVisible();
  await expect(notePanel(page)).not.toContainText("##");
  await expect(noteEditor(page)).toHaveCount(0);
});

test("clearing a note's text to whitespace turns the glyph muted, removes the rail marker and stores null (E2, REQ-2, REQ-6, REQ-18)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e2", "to be cleared");
  const card = sessionCard(page, "note-e2");
  const fg = await resolvedCssVar(page, "--fg", "color");
  await expect(noteGlyph(page)).toHaveCSS("color", fg);
  await expect(cardNoteMarker(card)).toHaveCount(1);

  await noteGlyph(page).click();
  await notePanel(page).getByText("to be cleared").click();
  await expect(noteEditor(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("  ");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" ");
  await page.keyboard.press("Escape");

  await expect(noteEditor(page)).toHaveCount(0);
  await expect(noteGlyph(page)).not.toHaveCSS("color", fg);
  await expect(cardNoteMarker(card)).toHaveCount(0);
  await expect(emptyNoteLine(page)).toBeVisible();
  await expect.poll(() => noteOnWire(page, daemon, session.id)).toBeNull();
});

test("typing without leaving edit mode puts the text in the daemon's state within two seconds (E3, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e3");
  await openAndEdit(page);
  await page.keyboard.type("autosaved while still typing");

  // 2 s, not the 15 s default: the budget for "within about a second of the last
  // keystroke" — a save that only lands on leaving edit mode must fail here.
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      timeout: 2_000,
      message: "autosave reached musterd while the editor was still open",
    })
    .toBe("autosaved while still typing");
  await expect(noteEditor(page)).toBeFocused();
});

test("typing and reloading at once keeps every character after the reload (E4, REQ-9, REQ-10)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e4");
  const text = "reload right after the last keystroke, 0123456789 abcdefghijklmnopqrstuvwxyz";
  await openAndEdit(page);
  await page.keyboard.type(text);
  await page.reload();

  await expect(mainheadHeading(page)).toContainText("note-e4");
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the text reached musterd, flushed on unload or re-sent from the browser",
    })
    .toBe(text);
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText(text);
});

test("with the panel popped out, typing and then focusing another session saves the text to the first session, and the panel shows the second session's note (E5, REQ-9, REQ-15, INV-4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-e5-a");
  const b = await launchNoted(page, request, daemon, "note-e5-b", "the note of B");

  await sessionCard(page, "note-e5-a").click();
  await expect(mainheadHeading(page)).toContainText("note-e5-a");
  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();
  await emptyNoteLine(page).click();
  await expect(noteEditor(page)).toBeFocused();
  await page.keyboard.type("typed for A");

  await sessionCard(page, "note-e5-b").click();
  await expect(mainheadHeading(page)).toContainText("note-e5-b");

  await expect
    .poll(() => noteOnWire(page, daemon, a.session.id), {
      message: "the pending text went to the session it was typed for",
    })
    .toBe("typed for A");
  expect(await noteOnWire(page, daemon, b.session.id)).toBe("the note of B");

  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("the note of B");
  await expect(notePanel(page)).toContainText(/Note\s*·\s*note-e5-b/);
  await expect(notePanel(page)).not.toContainText("typed for A");
});

test("focusing another session closes an anchored panel (REQ-15)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-r15-a", "note of the first");
  await launchNoted(page, request, daemon, "note-r15-b", "note of the second");

  await sessionCard(page, "note-r15-a").click();
  await expect(mainheadHeading(page)).toContainText("note-r15-a");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("note of the first");
  await expect(noteGlyph(page)).toHaveAttribute("aria-expanded", "true");

  await sessionCard(page, "note-r15-b").click();
  await expect(mainheadHeading(page)).toContainText("note-r15-b");
  await expect(notePanel(page)).toHaveCount(0);
  await expect(noteGlyph(page)).toHaveAttribute("aria-expanded", "false");
});

test("a note survives Stop and Resume, and is readable and editable on the ended session (E6, REQ-4, edge case 4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e6a", "kept across stop");
  const fg = await resolvedCssVar(page, "--fg", "color");
  await expect(noteGlyph(page)).toHaveCSS("color", fg);

  const end = await page.request.post(`${daemon.baseURL}/api/sessions/${session.id}/end`);
  expect(end.status()).toBe(200);
  const cap = page.locator("#dead-surface .endcap");
  await expect(cap).toBeVisible({ timeout: 15_000 });
  expect(await noteOnWire(page, daemon, session.id)).toBe("kept across stop");

  await expect(noteGlyph(page)).toHaveCSS("color", fg);
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("kept across stop");
  await notePanel(page).getByText("kept across stop").click();
  await expect(noteEditor(page)).toBeFocused();
  await replaceText(page, "edited on the ended session");
  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toContainText("edited on the ended session");
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "an ended session's note saved",
    })
    .toBe("edited on the ended session");

  await cap.getByRole("button", { name: "Resume" }).click();
  await expect(sessionCard(page, "note-e6a")).not.toHaveClass(/ended/, { timeout: 15_000 });
  await expect
    .poll(async () => (await getState(page, daemon)).sessions.find((s) => s.id === session.id))
    .toMatchObject({ alive: true, note: "edited on the ended session" });
  await expect(noteGlyph(page)).toHaveCSS("color", fg);
  await expect(cardNoteMarker(sessionCard(page, "note-e6a"))).toHaveCount(1);
});

test("a note survives a musterd restart for a live session and for one whose pane died while musterd was down, readable and editable after a reload (E6, REQ-4, edge cases 3 and 4)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e6b", "kept across restart");

  await daemon.restart();
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), { message: "the note reloaded from the row" })
    .toBe("kept across restart");
  await page.reload();
  await expect(mainheadHeading(page)).toContainText("note-e6b");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("kept across restart");

  // Pane death while musterd is down: reconcile marks the row ended at the next start and keeps
  // it (kb:adr/notes-ended-row-sweep-takes-its-note), so its note is kept with it.
  await daemon.kill();
  await daemon.killTmuxWindow(session.tmuxTarget);
  await daemon.restart();
  await page.reload();
  await expect(page.locator("#dead-surface .endcap")).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await getState(page, daemon)).sessions.find((s) => s.id === session.id))
    .toMatchObject({ alive: false, note: "kept across restart" });
  const fg = await resolvedCssVar(page, "--fg", "color");
  await expect(noteGlyph(page)).toHaveCSS("color", fg);
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("kept across restart");
  await notePanel(page).getByText("kept across restart").click();
  await expect(noteEditor(page)).toBeFocused();
  await replaceText(page, "edited after the pane died");
  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toContainText("edited after the pane died");
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the ended session's note saved after the restart",
    })
    .toBe("edited after the pane died");
});

test("an edit saved in one window shows without a reload in a second window whose panel is open and not editing (E7, REQ-21, edge case 22)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-e7");
  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);
    await expect(mainheadHeading(pageB)).toContainText("note-e7");

    await noteGlyph(page).click();
    await expect(emptyNoteLine(page)).toBeVisible();

    await noteGlyph(pageB).click();
    await emptyNoteLine(pageB).click();
    await expect(noteEditor(pageB)).toBeFocused();
    await pageB.keyboard.type("written in the other window");
    await pageB.keyboard.press("Escape");

    await expect(notePanel(page)).toContainText("written in the other window");
    await expect(noteEditor(page)).toHaveCount(0);
    await expect(emptyNoteLine(page)).toHaveCount(0);
    const fg = await resolvedCssVar(page, "--fg", "color");
    await expect(noteGlyph(page)).toHaveCSS("color", fg);
  } finally {
    await contextB.close();
  }
});

test("a window that is editing keeps its own text when another window saves, and its next save wins (REQ-21, last write wins)", async ({
  page,
  browser,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e7b");
  const contextB = await browser.newContext();
  try {
    const pageB = await contextB.newPage();
    await pageB.goto(daemon.dashboardUrl);
    await expect(mainheadHeading(pageB)).toContainText("note-e7b");

    await openAndEdit(page);
    await page.keyboard.type("mine");
    await expect.poll(() => noteOnWire(page, daemon, session.id)).toBe("mine");

    await noteGlyph(pageB).click();
    await notePanel(pageB).getByText("mine").click();
    await expect(noteEditor(pageB)).toBeFocused();
    await replaceText(pageB, "theirs");
    await pageB.keyboard.press("Escape");
    await expect.poll(() => noteOnWire(page, daemon, session.id)).toBe("theirs");

    // A stays-unchanged hold: the other window's upsert has had time to arrive and must not
    // have replaced what this window is typing.
    await settleFor(page, 1_400);
    await expect(noteEditor(page)).toHaveValue("mine");
    await expect(noteEditor(page)).toBeFocused();

    await page.keyboard.type(" more");
    await expect
      .poll(() => noteOnWire(page, daemon, session.id), {
        message: "this window's next save overwrote the other window's text",
      })
      .toBe("mine more");
    await expect(notePanel(pageB)).toContainText("mine more");
  } finally {
    await contextB.close();
  }
});

test("with musterd stopped, typing shows the unsaved status and keeps the text, and after musterd restarts the note saves without any action and a reload shows it (E8, REQ-10, REQ-11)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-e8");
  await openAndEdit(page);
  await expect(noteStatus(page)).toHaveText("");

  await daemon.kill();
  await expect(page.getByRole("alert")).toHaveText(/musterd unreachable/i, { timeout: 15_000 });
  await page.keyboard.type("typed while musterd is down");

  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");
  await expect(noteEditor(page)).toHaveValue("typed while musterd is down");

  await daemon.restart();
  await expect(page.getByRole("alert")).toBeHidden({ timeout: 15_000 });
  await expect(noteStatus(page)).toHaveText("");
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the kept text was sent again on reconnect with no action",
    })
    .toBe("typed while musterd is down");

  await page.reload();
  await expect(mainheadHeading(page)).toContainText("note-e8");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("typed while musterd is down");
});

test("with the panel popped out, clicking the terminal and typing leaves the panel open and the typed text reaches the pane (E9, REQ-12)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-e9", "stays beside the terminal");
  const region = terminalRegion(page, "note-e9");
  await expect(region).toContainText("MUSTER-STUB-READY", { timeout: 15_000 });

  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();

  await clickTerminalClear(page, "note-e9");
  await expect.poll(() => activeElementInsideTerminal(page, "note-e9")).toBe(true);
  await page.keyboard.type("hello-from-the-keyboard");
  await page.keyboard.press("Enter");

  await expect(region).toContainText("stub-echo:hello-from-the-keyboard");
  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();
  expect(await activeElementInsideTerminal(page, "note-e9")).toBe(true);
});

test("with the panel popped out and the terminal focused, Escape reaches the terminal and leaves the panel open (E10, REQ-23, INV-2)", async ({
  page,
  request,
  daemon,
}) => {
  const recorder = new WsByteRecorder(page, "/ws/terminal/");
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-e10", "panel stays on Escape");
  await expect(terminalRegion(page, "note-e10")).toContainText("MUSTER-STUB-READY", {
    timeout: 15_000,
  });

  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();
  await clickTerminalClear(page, "note-e10");
  await expect.poll(() => activeElementInsideTerminal(page, "note-e10")).toBe(true);

  const escFrames = () =>
    recorder.sent.filter((frame) => frame.length === 1 && frame[0] === 0x1b).length;
  expect(escFrames()).toBe(0);
  await page.keyboard.press("Escape");
  await expect
    .poll(escFrames, { message: "the Escape keystroke was sent to the pane as a raw ESC byte" })
    .toBe(1);

  // A stays-unchanged hold: a late close would show here.
  await settleFor(page, 500);
  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();
  await expect(popOutButton(page)).toHaveCount(0);
});

test("removing a session whose note panel is popped out shows the next focused session's note, and the removed note is gone from the state (E11, edge case 9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-e11-a", "note of the removed");
  await launchNoted(page, request, daemon, "note-e11-b", "note of the survivor");

  await sessionCard(page, "note-e11-a").click();
  await expect(mainheadHeading(page)).toContainText("note-e11-a");
  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(notePanel(page)).toContainText("note of the removed");

  await removeFromCardMenu(page, sessionCard(page, "note-e11-a"));
  await expect(sessionCard(page, "note-e11-a")).toHaveCount(0, { timeout: 15_000 });

  await expect(mainheadHeading(page)).toContainText("note-e11-b");
  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("note of the survivor");
  await expect(notePanel(page)).not.toContainText("note of the removed");

  const state = await getState(page, daemon);
  expect(state.sessions.find((s) => s.id === a.session.id)).toBeUndefined();
  expect(JSON.stringify(state)).not.toContain("note of the removed");
});

test("removing the only session closes a popped-out panel (REQ-15, edge case 9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-r15-only", "the last note");
  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();

  await removeFromCardMenu(page, sessionCard(page, "note-r15-only"));
  await expect(sessionCard(page, "note-r15-only")).toHaveCount(0, { timeout: 15_000 });

  await expect(notePanel(page)).toHaveCount(0);
});

test("a popped-out panel reloads popped out at the same position and size (E12, REQ-13, REQ-16)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-e12", "geometry survives reload");
  await expect(terminalRegion(page, "note-e12")).toBeVisible();
  const region = await terminalRegion(page, "note-e12").boundingBox();
  if (!region) throw new Error("terminal region has no box");

  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();
  const initial = await notePanel(page).boundingBox();
  if (!initial) throw new Error("panel has no box");

  const dx = initial.x - region.x > 120 ? -80 : 80;
  const dy = initial.y + initial.height + 60 < region.y + region.height ? 30 : -30;
  await dragPointer(page, initial.x + 24, initial.y + 12, dx, dy);
  await expect
    .poll(
      async () => {
        const box = await notePanel(page).boundingBox();
        return box
          ? Math.round(box.x - initial.x) !== 0 || Math.round(box.y - initial.y) !== 0
          : false;
      },
      { message: "the header drag moved the panel" },
    )
    .toBe(true);

  const moved = await notePanel(page).boundingBox();
  if (!moved) throw new Error("panel has no box");
  await dragPointer(page, moved.x + moved.width - 2, moved.y + moved.height - 2, -40, -30);
  await expect
    .poll(async () => ((await notePanel(page).boundingBox())?.width ?? moved.width) < moved.width, {
      message: "the corner drag resized the panel",
    })
    .toBe(true);

  const before = await notePanel(page).boundingBox();
  if (!before) throw new Error("panel has no box");

  await page.reload();
  await expect(popInButton(page)).toBeVisible();
  await expect
    .poll(async () => {
      const box = await notePanel(page).boundingBox();
      if (!box) return "no box";
      const off = [
        box.x - before.x,
        box.y - before.y,
        box.width - before.width,
        box.height - before.height,
      ];
      return off.every((d) => Math.abs(d) <= 1)
        ? "same"
        : `moved by ${off.map(Math.round).join(",")}`;
    })
    .toBe("same");
});

test("a new tab starts with the panel anchored at its default form even when another tab popped it out (REQ-16)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-r16", "per tab form");
  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();

  const tab = await page.context().newPage();
  await tab.goto(daemon.dashboardUrl);
  await expect(mainheadHeading(tab)).toContainText("note-r16");
  await expect(notePanel(tab)).toHaveCount(0);
  await noteGlyph(tab).click();
  await expect(popOutButton(tab)).toBeVisible();
  await expect(popInButton(tab)).toHaveCount(0);
});

test("click-away and the glyph leave a popped-out panel open, Pop in returns it to the anchored form, and Escape inside the panel closes it (REQ-7, REQ-12)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-r12", "popped controls");
  await expect(terminalRegion(page, "note-r12")).toBeVisible();

  await noteGlyph(page).click();
  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();

  await clickTerminalClear(page, "note-r12");
  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();

  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await expect(popInButton(page)).toBeVisible();

  await popInButton(page).click();
  await expect(popOutButton(page)).toBeVisible();
  await expect(popInButton(page)).toHaveCount(0);
  await expect(closeNoteButton(page)).toHaveCount(0);

  await popOutButton(page).click();
  await expect(popInButton(page)).toBeVisible();
  await popInButton(page).focus();
  await expect.poll(() => activeElementInsideNotePanel(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toHaveCount(0);
});

test("the glyph keeps focus and node identity across a tick, and a real Enter opens the panel without dropping focus to the page (REQ-6, REQ-7)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-key-glyph");
  await expect(mainheadHeading(page)).toContainText("note-key-glyph");

  await tagNode(noteGlyph(page), "note-glyph");
  await noteGlyph(page).focus();
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-glyph" });

  // A stays-unchanged hold: the render tick itself is under test.
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-glyph" });

  await page.keyboard.press("Enter");
  await expect(notePanel(page)).toBeVisible();
  const tagged = page.locator('[data-e2e-node="note-glyph"]');
  await expect(tagged).toHaveCount(1);
  await expect(tagged).toHaveAttribute("aria-expanded", "true");

  await settleFor(page, 1_400);
  await expect(page.locator('[data-e2e-node="note-glyph"]')).toHaveCount(1);
  await expect(page.locator('[data-e2e-node="note-glyph"]')).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(notePanel(page)).toBeVisible();
  const active = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      onGlyph: el?.dataset.e2eNode === "note-glyph",
      inPanel: el?.closest('[role="dialog"][aria-label="Note"]') != null,
    };
  });
  expect(active.onGlyph || active.inPanel).toBe(true);
});

test("Pop out, Pop in and Close work from the keyboard and leave focus in the panel across a tick (REQ-12)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-key-controls", "keyboard controls");
  await expect(mainheadHeading(page)).toContainText("note-key-controls");

  await noteGlyph(page).click();
  await popOutButton(page).focus();
  await expect.poll(() => activeElementInsideNotePanel(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(popInButton(page)).toBeVisible();
  await expect.poll(() => activeElementInsideNotePanel(page)).toBe(true);
  await settleFor(page, 1_400);
  expect(await activeElementInsideNotePanel(page)).toBe(true);
  await expect(popInButton(page)).toBeVisible();

  await popInButton(page).focus();
  await page.keyboard.press("Space");
  await expect(popOutButton(page)).toBeVisible();
  await expect(popInButton(page)).toHaveCount(0);
  await expect.poll(() => activeElementInsideNotePanel(page)).toBe(true);
  await settleFor(page, 1_400);
  expect(await activeElementInsideNotePanel(page)).toBe(true);

  await popOutButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(closeNoteButton(page)).toBeVisible();
  await closeNoteButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(notePanel(page)).toHaveCount(0);
});

test("the editor keeps focus, node identity and its text across render ticks and a session upsert while typing (REQ-8, REQ-9)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session, claudeId } = await launchNoted(page, request, daemon, "note-key-editor");
  await openAndEdit(page);
  await tagNode(noteEditor(page), "note-editor");
  await page.keyboard.type("first");
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "TEXTAREA", node: "note-editor" });

  await request.post(daemon.ingestURL("hook"), {
    data: rawUserPromptSubmit(claudeId, { prompt: "a turn that upserts the session" }),
  });
  await expect(sessionCard(page, "note-key-editor")).toContainText(
    "a turn that upserts the session",
  );
  await page.keyboard.type(" second");
  await settleFor(page, 1_400);

  expect(await focusedNode(page)).toEqual({ tag: "TEXTAREA", node: "note-editor" });
  await expect(noteEditor(page)).toHaveValue("first second");
  await expect.poll(() => noteOnWire(page, daemon, session.id)).toBe("first second");
});

/** Makes `window.localStorage` and `window.sessionStorage` throw on read, as a browser with site
 * data blocked does, before any page script runs. Returns the page's uncaught errors. */
async function blockStorageAndCollectErrors(page: Page): Promise<string[]> {
  await page.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("storage is blocked", "SecurityError");
        },
      });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("with browser storage blocked, text typed while musterd is down is sent again after it restarts with no further input, and the unsaved status clears (REQ-10, REQ-11, review cycle 3)", async ({
  page,
  request,
  daemon,
}) => {
  const pageErrors = await blockStorageAndCollectErrors(page);
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-blocked-e8");
  await openAndEdit(page);
  await expect(noteStatus(page)).toHaveText("");

  await daemon.kill();
  await expect(page.getByRole("alert")).toHaveText(/musterd unreachable/i, { timeout: 15_000 });
  await page.keyboard.type("typed while storage is blocked");
  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");
  await expect(noteEditor(page)).toHaveValue("typed while storage is blocked");

  await daemon.restart();
  await expect(page.getByRole("alert")).toBeHidden({ timeout: 15_000 });
  await expect(noteStatus(page)).toHaveText("");
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the kept text was sent again on reconnect with no keystroke",
    })
    .toBe("typed while storage is blocked");
  expect(pageErrors).toEqual([]);
});

test("with browser storage blocked, removing a session with another present takes it out of the rail and raises no page error (REQ-15, edge case 9, review cycle 3)", async ({
  page,
  request,
  daemon,
}) => {
  const pageErrors = await blockStorageAndCollectErrors(page);
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-blocked-a", "note of the removed");
  const b = await launchNoted(page, request, daemon, "note-blocked-b", "note of the survivor");

  await sessionCard(page, "note-blocked-a").click();
  await expect(mainheadHeading(page)).toContainText("note-blocked-a");
  await removeFromCardMenu(page, sessionCard(page, "note-blocked-a"));

  await expect(sessionCard(page, "note-blocked-a")).toHaveCount(0, { timeout: 15_000 });
  await expect(sessionCard(page, "note-blocked-b")).toHaveCount(1);
  await expect(mainheadHeading(page)).toContainText("note-blocked-b");
  const state = await getState(page, daemon);
  expect(state.sessions.find((s) => s.id === a.session.id)).toBeUndefined();
  expect(state.sessions.find((s) => s.id === b.session.id)?.note).toBe("note of the survivor");
  expect(pageErrors).toEqual([]);
});
