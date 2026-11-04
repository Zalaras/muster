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
  expectWindowReady,
  moveAndResizePanel,
  noteEditor,
  noteGlyph,
  noteOnWire,
  notePanel,
  noteStatus,
  noteWindows,
  openInWindowButton,
  openNoteWindow,
  panelBoxDiff,
  popInButton,
  popOutButton,
  popOutFromGlyph,
  putNoteViaApi,
  windowEditor,
  windowEmptyLine,
  windowRemovedNotice,
  windowRendered,
  windowStatus,
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

test("with the panel popped out for A, typing and then focusing B saves the text to A and shows no panel for B, and focusing A again shows A's panel with the text (E8, REQ-1, REQ-9, REQ-15, INV-1, INV-3)", async ({
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

  await expect(notePanel(page)).toHaveCount(0);
  await expect(noteEditor(page)).toHaveCount(0);

  await sessionCard(page, "note-e5-a").click();
  await expect(mainheadHeading(page)).toContainText("note-e5-a");
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText(/Note\s*·\s*note-e5-a/);
  await expect(notePanel(page)).toContainText("typed for A");
  await expect(notePanel(page)).not.toContainText("the note of B");
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

test("removing a session whose note panel is popped out shows no panel for the next focused session, which is not popped out, and the removed note is gone from the state (E11, REQ-1, edge case 9)", async ({
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
  await expect(notePanel(page)).toHaveCount(0);

  await noteGlyph(page).click();
  await expect(popOutButton(page)).toBeVisible();
  await expect(popInButton(page)).toHaveCount(0);
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
  await expect(closeNoteButton(page)).toBeVisible();

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

// Plan popped-out-note-enhance: per-session pop-out and the note window.

/** Clicks a masthead view button and waits for it to read pressed. */
async function switchView(page: Page, view: "Focus" | "Tiles"): Promise<void> {
  await page.getByRole("button", { name: view }).click();
  await expect(page.getByRole("button", { name: view })).toHaveAttribute("aria-pressed", "true");
}

/** Focuses a session by its rail card and waits for the Focus header to name it. */
async function focusCard(page: Page, title: string): Promise<void> {
  await sessionCard(page, title).click();
  await expect(mainheadHeading(page)).toContainText(title);
}

/** Everything this tab's session storage holds, serialized, as the only oracle for "remembered". */
async function sessionStorageDump(page: Page): Promise<string> {
  return await page.evaluate(() =>
    JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))),
  );
}

test("a session popped out at a moved rectangle reloads popped out there when focused, and a session never popped out shows no panel (E1, REQ-1, REQ-2, REQ-3, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe1-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe1-b", "note of B");

  await focusCard(page, "note-pe1-a");
  await popOutFromGlyph(page);
  const rect = await moveAndResizePanel(page, -120, 40);

  await focusCard(page, "note-pe1-b");
  await expect(notePanel(page)).toHaveCount(0);
  await focusCard(page, "note-pe1-a");
  await expect.poll(() => panelBoxDiff(page, rect)).toBe("same");

  await page.reload();
  await focusCard(page, "note-pe1-b");
  await expect(notePanel(page)).toHaveCount(0);
  await focusCard(page, "note-pe1-a");
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("note of A");
  await expect.poll(() => panelBoxDiff(page, rect)).toBe("same");
});

test("a place stored by the single-panel version is ignored: after a reload every session is anchored (REQ-3, edge case 1)", async ({
  page,
  request,
  daemon,
}) => {
  // Setup, not evidence: the value today's version writes under its one key, planted before the
  // dashboard's scripts run on every load of this tab.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem(
        "muster.note-panel",
        JSON.stringify({ popped: true, rect: { x: 120, y: 120, width: 400, height: 320 } }),
      );
    } catch {
      // storage unavailable: nothing to plant
    }
  });
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe3old-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe3old-b", "note of B");

  await page.reload();
  await focusCard(page, "note-pe3old-a");
  await expect(notePanel(page)).toHaveCount(0);
  await focusCard(page, "note-pe3old-b");
  await expect(notePanel(page)).toHaveCount(0);
  await noteGlyph(page).click();
  await expect(popOutButton(page)).toBeVisible();
  await expect(popInButton(page)).toHaveCount(0);
});

test("removing a popped-out session leaves another popped-out session's panel unchanged and forgets the removed session's place, and removing the focused popped-out session shows no panel for the next one (E2, REQ-1, REQ-4, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe2-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe2-b", "note of B");
  await launchNoted(page, request, daemon, "note-pe2-c", "note of C");

  await focusCard(page, "note-pe2-a");
  await popOutFromGlyph(page);
  const rectA = await moveAndResizePanel(page, -120, 40);
  await focusCard(page, "note-pe2-b");
  await popOutFromGlyph(page);
  const rectB = await moveAndResizePanel(page, -60, 90, [-95, -70]);

  // B's width and height together are the marker for B's rectangle in the tab's memory: A was
  // resized differently, so both numbers appearing means B's rectangle is stored.
  const bMarks = [String(Math.floor(rectB.width)), String(Math.floor(rectB.height))];
  const remembersB = async () => {
    const dump = await sessionStorageDump(page);
    return bMarks.every((mark) => dump.includes(mark));
  };
  await expect.poll(remembersB, { message: "B's rectangle is in the tab's memory" }).toBe(true);

  await focusCard(page, "note-pe2-a");
  await expect.poll(() => panelBoxDiff(page, rectA)).toBe("same");

  await removeFromCardMenu(page, sessionCard(page, "note-pe2-b"));
  await expect(sessionCard(page, "note-pe2-b")).toHaveCount(0, { timeout: 15_000 });
  await expect(mainheadHeading(page)).toContainText("note-pe2-a");
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("note of A");
  await expect.poll(() => panelBoxDiff(page, rectA)).toBe("same");
  await expect
    .poll(remembersB, { message: "B's rectangle left the tab's memory with B" })
    .toBe(false);

  await removeFromCardMenu(page, sessionCard(page, "note-pe2-a"));
  await expect(sessionCard(page, "note-pe2-a")).toHaveCount(0, { timeout: 15_000 });
  await expect(mainheadHeading(page)).toContainText("note-pe2-c");
  await expect(notePanel(page)).toHaveCount(0);
});

test("Open note in window opens a popup on the session's note and closes the panel, a second press opens no second page, and another session's window makes two (E3, REQ-4, REQ-8, INV-5)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-pe3-a", "note of A");
  const b = await launchNoted(page, request, daemon, "note-pe3-b", "note of B");
  const context = page.context();

  await focusCard(page, "note-pe3-a");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toContainText("note of A");
  const winA = await openNoteWindow(page);
  expect(winA.url()).toContain(`/note.html?session=${a.session.id}`);
  await expectWindowReady(winA, "note-pe3-a");
  await expect(windowRendered(winA)).toContainText("note of A");
  await expect(notePanel(page)).toHaveCount(0);

  // The same session again from a newly opened panel: no second page.
  let opened = 0;
  context.on("page", () => {
    opened += 1;
  });
  await noteGlyph(page).click();
  await expect(popOutButton(page)).toBeVisible();
  await openInWindowButton(page).click();
  await expect(notePanel(page)).toHaveCount(0);
  // A stays-unchanged hold: a second window would open within this time.
  await settleFor(page, 1_000);
  expect(opened).toBe(0);
  expect(noteWindows(context)).toHaveLength(1);

  await focusCard(page, "note-pe3-b");
  await noteGlyph(page).click();
  const winB = await openNoteWindow(page);
  expect(winB.url()).toContain(`/note.html?session=${b.session.id}`);
  await expectWindowReady(winB, "note-pe3-b");
  await expect(windowRendered(winB)).toContainText("note of B");
  expect(noteWindows(context)).toHaveLength(2);
  await expect(windowRendered(winA)).toContainText("note of A");
  await expect(winA.locator("body")).not.toContainText("note of B");
});

test("Open note in window from a popped-out panel closes it and takes only that session out of the popped-out set, and its next pop-out returns to its rectangle (REQ-4, REQ-8, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe4w-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe4w-b", "note of B");

  await focusCard(page, "note-pe4w-a");
  await popOutFromGlyph(page);
  const rectA = await moveAndResizePanel(page, -120, 40);
  await focusCard(page, "note-pe4w-b");
  await popOutFromGlyph(page);
  const rectB = await moveAndResizePanel(page, -60, 90);

  await focusCard(page, "note-pe4w-a");
  await expect.poll(() => panelBoxDiff(page, rectA)).toBe("same");
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe4w-a");
  await expect(notePanel(page)).toHaveCount(0);

  await focusCard(page, "note-pe4w-b");
  await expect(popInButton(page)).toBeVisible();
  await expect.poll(() => panelBoxDiff(page, rectB)).toBe("same");
  await focusCard(page, "note-pe4w-a");
  await expect(notePanel(page)).toHaveCount(0);

  await popOutFromGlyph(page);
  await expect.poll(() => panelBoxDiff(page, rectA)).toBe("same");
});

test("stopping a popped-out session leaves it popped out at its rectangle when focused, and another session still shows none (E4, REQ-4, INV-1)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-pe4-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe4-b", "note of B");

  await focusCard(page, "note-pe4-a");
  await popOutFromGlyph(page);
  const rect = await moveAndResizePanel(page, -120, 40);

  const end = await page.request.post(`${daemon.baseURL}/api/sessions/${a.session.id}/end`);
  expect(end.status()).toBe(200);
  await expect(page.locator("#dead-surface .endcap")).toBeVisible({ timeout: 15_000 });
  await expect(popInButton(page)).toBeVisible();
  await expect(notePanel(page)).toContainText("note of A");
  await expect.poll(() => panelBoxDiff(page, rect)).toBe("same");

  await focusCard(page, "note-pe4-b");
  await expect(notePanel(page)).toHaveCount(0);
  await focusCard(page, "note-pe4-a");
  await expect(popInButton(page)).toBeVisible();
  await expect.poll(() => panelBoxDiff(page, rect)).toBe("same");
});

test("text typed in A's note window reaches A while the dashboard focuses B and then Tiles, and an edit saved from the dashboard panel shows in A's window while it is not editing (E5, REQ-9, REQ-10, REQ-14, INV-3)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-pe5-a");
  const b = await launchNoted(page, request, daemon, "note-pe5-b", "note of B");

  await focusCard(page, "note-pe5-a");
  await noteGlyph(page).click();
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe5-a");
  await windowEmptyLine(win).click();
  await expect(windowEditor(win)).toBeFocused();
  await win.keyboard.type("typed in A's window");

  await focusCard(page, "note-pe5-b");
  await expect
    .poll(() => noteOnWire(page, daemon, a.session.id), {
      message: "the window's text went to the session it was typed for",
    })
    .toBe("typed in A's window");
  expect(await noteOnWire(page, daemon, b.session.id)).toBe("note of B");

  await switchView(page, "Tiles");
  await settleFor(page, 1_400);
  expect(win.isClosed()).toBe(false);
  await expect(windowEditor(win)).toHaveValue("typed in A's window");
  await expectWindowReady(win, "note-pe5-a");

  await win.keyboard.press("Escape");
  await expect(windowEditor(win)).toHaveCount(0);
  await expect(windowRendered(win)).toContainText("typed in A's window");
  expect(win.isClosed()).toBe(false);

  await switchView(page, "Focus");
  await focusCard(page, "note-pe5-a");
  await noteGlyph(page).click();
  await notePanel(page).getByText("typed in A's window").click();
  await expect(noteEditor(page)).toBeFocused();
  await replaceText(page, "edited from the dashboard");
  await page.keyboard.press("Escape");
  await expect.poll(() => noteOnWire(page, daemon, a.session.id)).toBe("edited from the dashboard");
  await expect(windowRendered(win)).toContainText("edited from the dashboard");
  await expect(windowEditor(win)).toHaveCount(0);
});

test("with musterd stopped, text typed in a note window shows the unsaved status and is on the daemon after musterd restarts with no further input (E6, REQ-11)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-pe6a");
  await noteGlyph(page).click();
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe6a");
  await windowEmptyLine(win).click();
  await expect(windowEditor(win)).toBeFocused();

  await daemon.kill();
  await expect(page.getByRole("alert")).toHaveText(/musterd unreachable/i, { timeout: 15_000 });
  // Before anything is typed the window itself already says the daemon is gone.
  await expect(windowStatus(win)).toHaveText("musterd unreachable");
  await win.keyboard.type("typed in the window while musterd is down");
  await expect(windowStatus(win)).toHaveText("unsaved, musterd unreachable");
  await expect(windowEditor(win)).toHaveValue("typed in the window while musterd is down");

  await daemon.restart();
  await expect(page.getByRole("alert")).toBeHidden({ timeout: 15_000 });
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the kept text was sent again on reconnect with no action",
    })
    .toBe("typed in the window while musterd is down");
  await expect(windowStatus(win)).toHaveText("");
});

test("text a note window could not save survives a reload of that window and reaches the daemon on reconnect (E6, REQ-11, network failure)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-pe6b");
  await noteGlyph(page).click();
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe6b");

  // The page itself is served by musterd, so a reload cannot happen while it is stopped; an
  // aborted save is the same connection-level failure the window sees, with the page still loadable.
  const abortSaves: Parameters<Page["route"]>[1] = async (route) => {
    if (route.request().method() === "PUT") await route.abort();
    else await route.continue();
  };
  await page.context().route(/\/api\/sessions\/\d+\/note$/, abortSaves);
  // A note flushes a pending save with a keepalive PUT when the page hides, and context.route does
  // not intercept a request issued during unload. A network that is down fails that one too, so
  // the window's fetch rejects keepalive PUTs (a connection-level failure, not an error status)
  // on this load (evaluate) and on every later one (init script) until the test lifts it.
  const failKeepalivePuts = () => {
    const realFetch = window.fetch.bind(window);
    const flag = window as unknown as { __failKeepalivePuts: boolean };
    flag.__failKeepalivePuts = true;
    window.fetch = (input, init) => {
      if (flag.__failKeepalivePuts && init?.keepalive === true && init.method === "PUT") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return realFetch(input, init);
    };
  };
  await win.evaluate(failKeepalivePuts);
  await win.addInitScript(failKeepalivePuts);

  await windowEmptyLine(win).click();
  await expect(windowEditor(win)).toBeFocused();
  await win.keyboard.type("kept across the window's reload");
  await expect(windowStatus(win)).toHaveText("unsaved, musterd unreachable");
  expect(await noteOnWire(page, daemon, session.id)).toBeNull();

  await win.reload();
  await win.waitForLoadState();
  await expect(win.locator("body")).toContainText(/Note\s*·\s*note-pe6b/);
  await expect(windowStatus(win)).toHaveText("unsaved, musterd unreachable");
  expect(await noteOnWire(page, daemon, session.id)).toBeNull();

  await page.context().unroute(/\/api\/sessions\/\d+\/note$/, abortSaves);
  await win.evaluate(() => {
    (window as unknown as { __failKeepalivePuts: boolean }).__failKeepalivePuts = false;
  });
  await daemon.restart();
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the text kept across the reload was sent on reconnect with no further input",
    })
    .toBe("kept across the window's reload");
  // The dashboard tab also re-sends pending drafts from shared localStorage, so the daemon having
  // the text does not show the window's half: its own status clears only when its re-send lands.
  await expect(windowStatus(win)).toHaveText("");
});

test("the dashboard panel's unsaved status clears when the note window re-sends and acknowledges the shared draft first (E6, REQ-11, network failure)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-pe6c");
  await noteGlyph(page).click();
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe6c");
  // Opening the window closed the panel; the dashboard shows the same session's panel again.
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await expect(noteStatus(page)).toHaveText("");

  // Both tabs have a connection-level failure on the note save (each page's own route), while
  // the daemon itself stays up. Only the window types: the dashboard tab holds the text only
  // as the draft both tabs share in localStorage.
  const abortSaves: Parameters<Page["route"]>[1] = async (route) => {
    if (route.request().method() === "PUT") await route.abort();
    else await route.continue();
  };
  const noteRoute = /\/api\/sessions\/\d+\/note$/;
  await page.route(noteRoute, abortSaves);
  await win.route(noteRoute, abortSaves);
  await windowEmptyLine(win).click();
  await expect(windowEditor(win)).toBeFocused();
  await win.keyboard.type("typed in the window, re-sent by the window first");
  await expect(windowStatus(win)).toHaveText("unsaved, musterd unreachable");

  // The daemon restarting makes both tabs reconnect: each re-sends the shared draft on its
  // snapshot, and the dashboard's re-send fails, so its panel now reports the draft as unsaved.
  await daemon.restart();
  await expect(page.getByRole("alert")).toBeHidden({ timeout: 15_000 });
  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");
  expect(await noteOnWire(page, daemon, session.id)).toBeNull();

  // Only the window's network comes back; the window reloads, re-sends the draft and the daemon
  // acknowledges it. The dashboard tab never re-sends again (it is still failing), yet the draft
  // it reported as unsaved is on the daemon, so its status must clear.
  await win.unroute(noteRoute, abortSaves);
  await win.reload();
  await win.waitForLoadState();
  await expect(win.locator("body")).toContainText(/Note\s*·\s*note-pe6c/);
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      message: "the note window re-sent the shared draft and musterd has it",
    })
    .toBe("typed in the window, re-sent by the window first");
  await expect(windowStatus(win)).toHaveText("");
  await expect(noteStatus(page)).toHaveText("");
});

test("a note window stays editable after its session is stopped, and after Remove reads that the session has been removed with no editable note, while another session's window is unaffected (E7, REQ-12)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const a = await launchNoted(page, request, daemon, "note-pe7-a", "note of A");
  await launchNoted(page, request, daemon, "note-pe7-b", "note of B");

  await focusCard(page, "note-pe7-a");
  await noteGlyph(page).click();
  const winA = await openNoteWindow(page);
  await expectWindowReady(winA, "note-pe7-a");
  await focusCard(page, "note-pe7-b");
  await noteGlyph(page).click();
  const winB = await openNoteWindow(page);
  await expectWindowReady(winB, "note-pe7-b");

  await focusCard(page, "note-pe7-a");
  const end = await page.request.post(`${daemon.baseURL}/api/sessions/${a.session.id}/end`);
  expect(end.status()).toBe(200);
  await expect(page.locator("#dead-surface .endcap")).toBeVisible({ timeout: 15_000 });

  await windowRendered(winA).getByText("note of A").click();
  await expect(windowEditor(winA)).toBeFocused();
  await replaceText(winA, "edited after the stop");
  await winA.keyboard.press("Escape");
  await expect(windowRendered(winA)).toContainText("edited after the stop");
  await expect
    .poll(() => noteOnWire(page, daemon, a.session.id), {
      message: "an ended session's note saved from its window",
    })
    .toBe("edited after the stop");

  await removeFromCardMenu(page, sessionCard(page, "note-pe7-a"));
  await expect(sessionCard(page, "note-pe7-a")).toHaveCount(0, { timeout: 15_000 });
  await expect(windowRemovedNotice(winA)).toBeVisible();
  await expect(windowEditor(winA)).toHaveCount(0);
  await expect(windowRendered(winA)).toHaveCount(0);
  expect(winA.isClosed()).toBe(false);

  await expect(windowRemovedNotice(winB)).toHaveCount(0);
  await windowRendered(winB).getByText("note of B").click();
  await expect(windowEditor(winB)).toBeFocused();
  await winB.keyboard.press("Escape");
  await expect(windowRendered(winB)).toContainText("note of B");
});

test("Close on the anchored panel saves the typed text at once, closes it and returns focus to the terminal (REQ-6)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  const { session } = await launchNoted(page, request, daemon, "note-pe6c");
  await expect(terminalRegion(page, "note-pe6c")).toContainText("MUSTER-STUB-READY", {
    timeout: 15_000,
  });
  await openAndEdit(page);
  await page.keyboard.type("saved by closing");

  await closeNoteButton(page).click();
  await expect(notePanel(page)).toHaveCount(0);
  // 700 ms, not the 15 s default: autosave lands about a second after the last keystroke, so a
  // save that only the debounce makes would not be there yet. Close must flush it.
  await expect
    .poll(() => noteOnWire(page, daemon, session.id), {
      timeout: 700,
      message: "Close saved the text at once",
    })
    .toBe("saved by closing");
  await expect.poll(() => activeElementInsideTerminal(page, "note-pe6c")).toBe(true);
});

test("Close and Open in window work from the keyboard on the anchored panel and keep focus across a tick before they act (REQ-6, REQ-7, REQ-8)", async ({
  page,
  request,
  daemon,
}) => {
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe7k", "keyboard controls");
  await expect(terminalRegion(page, "note-pe7k")).toContainText("MUSTER-STUB-READY", {
    timeout: 15_000,
  });

  await noteGlyph(page).click();
  await tagNode(closeNoteButton(page), "note-close");
  await closeNoteButton(page).focus();
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-close" });
  // A stays-unchanged hold: the render tick itself is under test.
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-close" });
  await page.keyboard.press("Enter");
  await expect(notePanel(page)).toHaveCount(0);
  await expect.poll(() => activeElementInsideTerminal(page, "note-pe7k")).toBe(true);

  await noteGlyph(page).click();
  await tagNode(openInWindowButton(page), "note-window");
  await openInWindowButton(page).focus();
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-window" });
  await settleFor(page, 1_400);
  expect(await focusedNode(page)).toEqual({ tag: "BUTTON", node: "note-window" });
  const [win] = await Promise.all([page.waitForEvent("popup"), page.keyboard.press("Enter")]);
  await win.waitForLoadState();
  await expectWindowReady(win, "note-pe7k");
  await expect(notePanel(page)).toHaveCount(0);
});

test("with browser storage blocked, popping out, placing, Close and Open in window all work and raise no page error (REQ-13, edge case 15)", async ({
  page,
  request,
  daemon,
}) => {
  const context = page.context();
  const errors: string[] = [];
  context.on("weberror", (err) => errors.push(err.error().message));
  await context.addInitScript(() => {
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException("storage is blocked", "SecurityError");
        },
      });
    }
  });
  await page.goto(daemon.dashboardUrl);
  await launchNoted(page, request, daemon, "note-pe13", "note kept in memory");
  await expect(mainheadHeading(page)).toContainText("note-pe13");

  await popOutFromGlyph(page);
  const placed = await moveAndResizePanel(page, -120, 40);
  await expect.poll(() => panelBoxDiff(page, placed)).toBe("same");
  await closeNoteButton(page).click();
  await expect(notePanel(page)).toHaveCount(0);

  await noteGlyph(page).click();
  await expect(popOutButton(page)).toBeVisible();
  const win = await openNoteWindow(page);
  await expectWindowReady(win, "note-pe13");
  await expect(windowRendered(win)).toContainText("note kept in memory");
  await expect(notePanel(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
