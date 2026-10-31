// notes — what the display shows for a session's note: the Focus
// header glyph, the card and tile markers, the hover tip, the anchored and popped-out panel's
// layout and keyboard, and the unsaved status. State comes from the `notes` fixture (plain, short,
// long-with-frontmatter-and-mermaid, ended-with-note) and `notes-tiles`; typing into the editor is
// the only way a test gives the panel text the fixtures do not hold. The journeys — a save
// reaching the daemon, a second window, a restart — stay in web/e2e/notes.spec.ts.
import { railCardByTitle } from "./helpers/card-location";
import { focusSession, mainheadRenameButton } from "./helpers/focus";
import { expect, loadFixture, type Page, settleFor, test } from "./helpers/harness";
import {
  boxOf,
  escapes,
  mainSlot,
  noteBody,
  noteEditor,
  noteGlyph,
  notePanel,
  noteStatus,
  noteTip,
  popInNote,
  popOutNote,
  shownMarker,
  tokenColor,
} from "./helpers/notes";
import {
  activeElementInsideTerminal,
  mainheadSurfaceButton,
  terminalRegion,
} from "./helpers/surfaces";
import { liveTile } from "./helpers/tiles";

const MARKER_TEXT = "Has a note";

async function glyphLook(page: Page): Promise<{ color: string; opacity: string }> {
  return await noteGlyph(page).evaluate((el) => {
    const css = getComputedStyle(el);
    return { color: css.color, opacity: css.opacity };
  });
}

test("the Focus glyph computes --fg and full opacity for a noted session and the muted treatment for a note-less one, live and ended (R1, REQ-6)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const fg = await tokenColor(page, "--fg");
  const dim = await tokenColor(page, "--fg-dim");
  expect(fg).not.toBe(dim);

  for (const session of fixture.snapshot.sessions) {
    const title = session.title ?? "";
    await focusSession(page, title);
    await expect(noteGlyph(page)).toBeVisible();
    if (session.note !== null) {
      await expect(noteGlyph(page)).toHaveCSS("color", fg);
      await expect(noteGlyph(page)).toHaveCSS("opacity", "1");
    } else {
      await expect(noteGlyph(page)).toHaveCSS("color", dim);
      await expect(noteGlyph(page)).toHaveCSS("opacity", "0.55");
    }
  }
  // The ended session is among the noted ones, and a re-focus of the note-less one is muted again.
  expect(fixture.snapshot.sessions.some((s) => !s.alive && s.note !== null)).toBe(true);
  await focusSession(page, "notes-short");
  await focusSession(page, "notes-plain");
  const look = await glyphLook(page);
  expect(look).toEqual({ color: dim, opacity: "0.55" });
});

// The rail beside the header is a fixed 300px, so a header of H px is a window of H + 300; the
// narrowest header the existing sweeps use is 300px (a 600px window).
const RAIL_PX = 300;
const HEADER_WIDTHS = [1280, 900, 640, 360, 316, 300];
for (let h = 1240; h >= 340; h -= 40) if (!HEADER_WIDTHS.includes(h)) HEADER_WIDTHS.push(h);
HEADER_WIDTHS.sort((x, y) => y - x);

async function headerProblems(page: Page, window: number): Promise<string> {
  const glyph = await boxOf(noteGlyph(page));
  const title = await boxOf(mainheadRenameButton(page));
  const acts = await boxOf(page.locator("#mainhead .acts"));
  const glyphEnd = glyph.x + glyph.width;
  const problems: string[] = [];
  if (glyph.width < 8 || glyph.height < 8) problems.push(`glyph collapsed to ${glyph.width}`);
  if (glyphEnd > title.x + 0.5)
    problems.push(`glyph ends ${glyphEnd} after the title starts ${title.x}`);
  if (title.x - glyphEnd > 16) problems.push(`${title.x - glyphEnd}px between glyph and title`);
  if (Math.abs(glyph.y + glyph.height / 2 - (title.y + title.height / 2)) > 8) {
    problems.push("glyph is not on the title's line");
  }
  if (acts.x + acts.width > window + 0.5)
    problems.push(`acts end ${acts.x + acts.width} > ${window}`);
  if (acts.x < 0) problems.push(`acts start at ${acts.x}`);
  return problems.join("; ");
}

test("at every header width from 1280 to 300px the glyph sits fully visible right before the title and the action cluster stays in view (R2, REQ-6)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");

  for (const header of HEADER_WIDTHS) {
    const window = header + RAIL_PX;
    await page.setViewportSize({ width: window, height: 800 });
    await expect
      .poll(async () => (await page.locator("#mainhead").boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(header - 1);
    await expect(noteGlyph(page)).toBeVisible();
    await expect(noteGlyph(page)).toHaveCSS("opacity", "1");
    await expect
      .poll(() => headerProblems(page, window), { message: `header ${header}px` })
      .toBe("");
  }
});

test("exactly the noted rail cards show the marker at the end of the repo line, the repo text ellipsizing before it (R3, REQ-18)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const noted = fixture.snapshot.sessions.filter((s) => s.note !== null);
  expect(noted).toHaveLength(3);
  await expect(
    page.locator('#sessions [data-testid="session-card"] .mk:not([hidden])'),
  ).toHaveCount(noted.length);

  for (const session of fixture.snapshot.sessions) {
    const card = railCardByTitle(page, session.title ?? "");
    const marker = shownMarker(card);
    if (session.note === null) {
      await expect(marker).toHaveCount(0);
      await expect(card.getByText(MARKER_TEXT)).toHaveCount(0);
      continue;
    }
    await expect(marker).toHaveCount(1);
    await expect(card.getByText(MARKER_TEXT)).toHaveCount(1);
    await expect(marker).toBeVisible();
    const row = card.locator(".r2");
    const repo = row.locator(".rf");
    await expect(repo).toHaveCSS("text-overflow", "ellipsis");
    await expect(repo).toHaveCSS("overflow-x", "hidden");
    const [m, r, line] = [await boxOf(marker), await boxOf(repo), await boxOf(row)];
    expect(r.x + r.width, "repo text ends before the marker").toBeLessThanOrEqual(m.x + 0.5);
    expect(m.x + m.width, "marker ends the line").toBeLessThanOrEqual(line.x + line.width + 0.5);
    expect(m.x + m.width, "marker sits at the line's end").toBeGreaterThan(
      line.x + line.width - 24,
    );
    expect(m.y, "marker on the repo line").toBeGreaterThanOrEqual(r.y - 1);
    expect(m.y + m.height).toBeLessThanOrEqual(r.y + r.height + 1);
  }
});

test("exactly the noted tiles show the marker before the context readout, ended tile included (R4, REQ-18)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes-tiles");
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  expect(fixture.snapshot.sessions.some((s) => !s.alive && s.note !== null)).toBe(true);

  for (const session of fixture.snapshot.sessions) {
    const tile = liveTile(page, session.title ?? "");
    await expect(tile).toHaveCount(1);
    const marker = shownMarker(tile.locator(".thead"));
    if (session.note === null) {
      await expect(marker).toHaveCount(0);
      await expect(tile.getByText(MARKER_TEXT)).toHaveCount(0);
      continue;
    }
    await expect(marker).toHaveCount(1);
    await expect(marker).toBeVisible();
    await expect(tile.getByText(MARKER_TEXT)).toHaveCount(1);
    const m = await boxOf(marker);
    const ctx = await boxOf(tile.locator(".thead .ctxinfo"));
    expect(m.x + m.width, "marker before the context readout").toBeLessThanOrEqual(ctx.x + 0.5);
  }
  await expect(page.locator("article.tile .mk:not([hidden])")).toHaveCount(
    fixture.snapshot.sessions.filter((s) => s.note !== null).length,
  );
});

test("exactly the noted strip cards show the marker at the end of the repo line (R4, REQ-18)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes-strip");
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  const strip = page.locator("#tiles-strip").getByTestId("session-card");
  // The scenario must really put the two strip sessions on the strip.
  await expect(strip).toHaveCount(2);
  await expect(strip.filter({ hasText: "strip-noted" })).toHaveCount(1);
  await expect(strip.filter({ hasText: "strip-plain" })).toHaveCount(1);
  expect(fixture.snapshot.sessions.find((s) => s.title === "strip-noted")?.note).not.toBeNull();
  expect(fixture.snapshot.sessions.find((s) => s.title === "strip-plain")?.note).toBeNull();

  const noted = strip.filter({ hasText: "strip-noted" });
  const plain = strip.filter({ hasText: "strip-plain" });
  await expect(shownMarker(plain)).toHaveCount(0);
  await expect(plain.getByText(MARKER_TEXT)).toHaveCount(0);
  const marker = shownMarker(noted);
  await expect(marker).toHaveCount(1);
  await expect(marker).toBeVisible();
  await expect(noted.getByText(MARKER_TEXT)).toHaveCount(1);
  await expect(page.locator("#tiles-strip .mk:not([hidden])")).toHaveCount(1);

  const m = await boxOf(marker);
  const line = await boxOf(noted.locator(".r2"));
  expect(m.x + m.width, "marker ends the repo line").toBeLessThanOrEqual(line.x + line.width + 0.5);
  expect(m.y, "marker on the repo line").toBeGreaterThanOrEqual(line.y - 1);
  expect(m.y + m.height).toBeLessThanOrEqual(line.y + line.height + 1);
});

test("hovering the long note's marker for 350 ms opens a tooltip with its frontmatter block and diagram, cut at 12 lines with a fade (R5, REQ-19, REQ-20)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const marker = shownMarker(railCardByTitle(page, "notes-long"));
  await marker.hover();
  await expect(noteTip(page)).toHaveCount(0);
  await settleFor(page, 350);

  const tip = noteTip(page);
  await expect(tip).toHaveCount(1);
  await expect(tip).toBeVisible();
  await expect(tip.locator("table.frontmatter")).toBeVisible();
  await expect(tip.locator("table.frontmatter")).toContainText("Rostering retry plan");
  await expect(tip.locator("figure.diagram")).toHaveCount(1);
  await expect(tip.getByRole("button", { name: "Enlarge diagram" })).toHaveCount(1);

  const body = tip.locator(".nb");
  await expect(body).toHaveCSS("overflow-y", "hidden");
  const cut = await body.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      mask: css.maskImage !== "none" || css.webkitMaskImage !== "none",
      lines: el.clientHeight / parseFloat(css.lineHeight),
      overflowing: el.scrollHeight > el.clientHeight,
    };
  });
  expect(cut.mask, "a fade mask on the cut body").toBe(true);
  expect(cut.overflowing, "the note is longer than the cut").toBe(true);
  expect(cut.lines).toBeLessThanOrEqual(12.05);
  expect(cut.lines).toBeGreaterThan(11);
});

test("hovering a rail card's note marker shows only the note tip — the marker inherits no repo-line title (#106) (R5, REQ-6)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  const card = railCardByTitle(page, "notes-short");
  const marker = shownMarker(card);
  await marker.hover();
  await settleFor(page, 350);
  await expect(noteTip(page)).toBeVisible();

  // The nearest ancestor-or-self carrying a `title` is what Chrome shows ~1 s after the hover.
  const nearest = await marker.evaluate((el) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (node.hasAttribute("title")) {
        return { tag: node.className, title: node.getAttribute("title") };
      }
    }
    return null;
  });
  expect(nearest?.title, "the marker's own empty title shadows the repo line's").toBe("");
  await expect(card.locator(".r2")).toHaveAttribute("title", "notes-short / main");
});

test("the anchored panel on the long note keeps its whole box inside the viewport at 900 and 640px heights, its body scrolling (R6, REQ-20)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-long");
  for (const height of [900, 640]) {
    await page.setViewportSize({ width: 1280, height });
    if ((await noteGlyph(page).getAttribute("aria-expanded")) !== "true") {
      await noteGlyph(page).click();
    }
    await expect(notePanel(page)).toBeVisible();
    await expect(notePanel(page)).toHaveCSS("opacity", "1");
    await expect
      .poll(async () => {
        const box = await boxOf(notePanel(page));
        return escapes(box, { x: 0, y: 0, width: 1280, height });
      })
      .toBeNull();
    const scroll = await noteBody(page).evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      scrolls: el.scrollHeight > el.clientHeight,
    }));
    expect(scroll).toEqual({ overflowY: "auto", scrolls: true });
  }
});

test("a popped-out panel stays inside the main slot after a drag past each edge, a resize past each edge and corner and a window resize to 800x600 (R7, REQ-13, REQ-14)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await focusSession(page, "notes-long");
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();

  const inside = async (what: string) => {
    await expect
      .poll(async () => escapes(await boxOf(notePanel(page)), await mainSlot(page)), {
        message: `${what} leaves the panel inside the slot`,
      })
      .toBeNull();
  };
  await inside("opening");

  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  };

  for (const [name, dx, dy] of [
    ["left", -3000, 0],
    ["right", 3000, 0],
    ["top", 0, -3000],
    ["bottom", 0, 3000],
    ["top-left", -3000, -3000],
    ["bottom-right", 3000, 3000],
  ] as const) {
    const label = await boxOf(notePanel(page).locator(".ph .lab"));
    const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
    await drag(from, { x: from.x + dx, y: from.y + dy });
    await inside(`a drag past the ${name} edge`);
    // The drag really moved the panel: it ends flush against the edge it was dragged past.
    const [box, slot] = [await boxOf(notePanel(page)), await mainSlot(page)];
    if (dx < 0) expect(box.x).toBeCloseTo(slot.x, 0);
    if (dx > 0) expect(box.x + box.width).toBeCloseTo(slot.x + slot.width, 0);
    if (dy < 0) expect(box.y).toBeCloseTo(slot.y, 0);
    if (dy > 0) expect(box.y + box.height).toBeCloseTo(slot.y + slot.height, 0);
  }

  const outward: Record<string, [number, number]> = {
    n: [0, -1],
    s: [0, 1],
    e: [1, 0],
    w: [-1, 0],
    ne: [1, -1],
    nw: [-1, -1],
    se: [1, 1],
    sw: [-1, 1],
  };
  for (const [edge, [ux, uy]] of Object.entries(outward)) {
    const handle = await boxOf(notePanel(page).locator(`.rz.${edge}`));
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await drag(from, { x: from.x + ux * 3000, y: from.y + uy * 3000 });
    await inside(`a resize past the ${edge} handle`);
  }

  await page.setViewportSize({ width: 800, height: 600 });
  await inside("a window resize to 800x600");
  await expect(notePanel(page)).toBeVisible();
});

test("a note save that fails to reach musterd shows `unsaved, musterd unreachable` in --warn and a later successful save clears it (R8, REQ-11)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-plain");
  await page.route("**/api/sessions/*/note", (route) => route.abort("connectionrefused"));

  await noteGlyph(page).click();
  await expect(noteStatus(page)).toHaveText("");
  await noteBody(page).click();
  await noteEditor(page).fill("first draft");
  await page.keyboard.press("Escape");

  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");
  await expect(noteStatus(page)).toHaveCSS("color", await tokenColor(page, "--warn"));

  await page.unroute("**/api/sessions/*/note");
  await page.route("**/api/sessions/*/note", (route) => route.fulfill({ status: 204 }));
  await noteBody(page).click();
  await noteEditor(page).fill("second draft");
  await page.keyboard.press("Escape");
  await expect(noteStatus(page)).toHaveText("");
  await expect(noteBody(page)).toContainText("second draft");
});

async function popFailedSaveAtMinimum(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await focusSession(page, "notes-long");
  await page.route("**/api/sessions/*/note", (route) => route.abort("connectionrefused"));
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  await noteBody(page).click();
  await noteEditor(page).fill("a draft that cannot be saved");
  await page.keyboard.press("Escape");
  await expect(noteStatus(page)).toHaveText("unsaved, musterd unreachable");

  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  };
  const centre = async (sel: string) => {
    const b = await boxOf(notePanel(page).locator(sel));
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const lab = await centre(".ph .lab");
  await drag(lab, { x: lab.x + 3000, y: lab.y });
  const w = await centre(".rz.w");
  await drag(w, { x: w.x + 3000, y: w.y });
  const n = await centre(".rz.n");
  await drag(n, { x: n.x, y: n.y + 3000 });
  await expect
    .poll(async () => {
      const b = await boxOf(notePanel(page));
      return [Math.round(b.width), Math.round(b.height)];
    })
    .toEqual([260, 150]);
}

test("at the 260x150 minimum pinned to the slot's right edge with the unsaved status showing, Pop in and Close lie inside the panel and the status shortens with an ellipsis before the header overflows (R7, R8, REQ-11, REQ-13)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await popFailedSaveAtMinimum(page);

  const [panel, slot] = [await boxOf(notePanel(page)), await mainSlot(page)];
  expect(panel.x + panel.width).toBeCloseTo(slot.x + slot.width, 0);
  expect(escapes(panel, slot)).toBeNull();
  for (const control of [
    popInNote(page),
    notePanel(page).getByRole("button", { name: "Close note" }),
  ]) {
    await expect(control).toBeVisible();
    expect(escapes(await boxOf(control), panel)).toBeNull();
  }
  await expect(notePanel(page).getByRole("button", { name: "Close note" })).toBeVisible();

  const look = await noteStatus(page).evaluate((el) => {
    const css = getComputedStyle(el);
    const ph = el.closest(".ph") as HTMLElement;
    const who = ph.querySelector(".who") as HTMLElement | null;
    return {
      textOverflow: css.textOverflow,
      clipped: el.scrollWidth > el.clientWidth,
      title: el.getAttribute("title"),
      phFits: ph.scrollWidth <= ph.clientWidth,
      whoWidth: who ? who.getBoundingClientRect().width : 0,
      statusWidth: el.getBoundingClientRect().width,
    };
  });
  expect(look.textOverflow).toBe("ellipsis");
  expect(look.clipped).toBe(true);
  expect(look.title).toBe("unsaved, musterd unreachable");
  expect(look.phFits).toBe(true);
  expect(look.whoWidth).toBeLessThan(look.statusWidth);
  await expect(noteStatus(page)).toHaveCSS("color", await tokenColor(page, "--warn"));
});

test("after a window resize the popped panel is back inside the slot within two animation frames, not a render tick later (R7, REQ-14)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await page.setViewportSize({ width: 1440, height: 900 });
  await focusSession(page, "notes-long");
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();

  for (const [width, height] of [
    [800, 600],
    [1440, 900],
    [800, 600],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    expect(
      escapes(await boxOf(notePanel(page)), await mainSlot(page)),
      `at ${width}x${height}`,
    ).toBeNull();
  }
});

test("a note with malformed frontmatter and a broken mermaid fence renders the reader's fallbacks and a click on it still opens the editor (R9, REQ-22)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-plain");
  await noteGlyph(page).click();
  await noteBody(page).click();
  const text = [
    "---",
    "title: ok",
    "  - nested: [",
    "---",
    "",
    "# Heading",
    "",
    "```mermaid",
    "flowchart LR",
    "  A -->",
    "```",
    "",
  ].join("\n");
  await noteEditor(page).fill(text);
  await page.keyboard.press("Escape");

  await expect(noteEditor(page)).toHaveCount(0);
  await expect(noteBody(page).locator("pre.frontmatter")).toContainText("- nested: [");
  await expect(noteBody(page).locator("table.frontmatter")).toHaveCount(0);
  await expect(noteBody(page).locator("h1")).toHaveText("Heading");
  await expect(noteBody(page).locator("p.diagram-error")).toHaveCount(1);
  await expect(noteBody(page).locator("pre code").last()).toContainText("flowchart LR");
  await expect(noteBody(page).locator("figure.diagram")).toHaveCount(0);

  await noteBody(page).locator("h1").click();
  await expect(noteEditor(page)).toBeVisible();
  await expect(noteEditor(page)).toHaveValue(text);
});

test("switching to Tiles with the panel popped out hides it and switching back shows it at the same rectangle (R10, REQ-17)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  const before = await boxOf(notePanel(page));

  // The view is a pref the page adopts only from the broadcast: the frames are the prefs the
  // `notes-tiles` and `notes` fixtures recorded.
  const tiles = (await loadFixture("notes-tiles")).snapshot.prefs;
  const focus = (await loadFixture("notes")).snapshot.prefs;
  expect([tiles.view, focus.view]).toEqual(["tiles", "focus"]);
  dashboard.send({ type: "prefs", prefs: tiles });
  await expect(page.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  await expect(notePanel(page)).toBeHidden();

  dashboard.send({ type: "prefs", prefs: focus });
  await expect(page.getByRole("button", { name: "Focus" })).toHaveAttribute("aria-pressed", "true");
  await expect(notePanel(page)).toBeVisible();
  await expect.poll(async () => await boxOf(notePanel(page))).toEqual(before);
});

test("Escape in the editor leaves edit mode with the panel open and Escape in view mode closes the anchored panel (R11, REQ-8, REQ-12)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();

  await noteBody(page).click();
  await expect(noteEditor(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(noteEditor(page)).toHaveCount(0);
  await expect(notePanel(page)).toBeVisible();
  await expect(noteBody(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await expect(noteGlyph(page)).toHaveAttribute("aria-expanded", "false");
});

test("undo and redo in the editor reverse and reapply typed text and survive a render tick (R12, REQ-8)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-plain");
  await noteGlyph(page).click();
  await noteBody(page).click();
  const editor = noteEditor(page);
  await editor.pressSequentially("alpha beta");
  await expect(editor).toHaveValue("alpha beta");
  await settleFor(page, 1500);
  await expect(editor).toBeFocused();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).not.toHaveValue("alpha beta");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor).toHaveValue("alpha beta");
});

test("the glyph opens the panel on Enter and on Space from keyboard focus (R13, REQ-7)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");

  for (const key of ["Enter", "Space"]) {
    await noteGlyph(page).focus();
    await expect(noteGlyph(page)).toBeFocused();
    await page.keyboard.press(key);
    await expect(notePanel(page)).toBeVisible();
    await expect(noteGlyph(page)).toHaveAttribute("aria-expanded", "true");
    await expect(notePanel(page)).toContainText("Waiting on review.");
    await page.keyboard.press("Escape");
    await expect(notePanel(page)).toBeHidden();
  }
});

// ── closing the note returns focus (#111) ─────────────────────

test("Escape in the anchored panel returns keyboard focus to the Claude terminal (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await expect(terminalRegion(page, "notes-short")).toBeVisible();
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await notePanel(page).getByRole("button", { name: "Pop out note" }).focus();

  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await expect.poll(() => activeElementInsideTerminal(page, "notes-short")).toBe(true);
});

test("a second click on the note glyph closes the anchored panel and returns keyboard focus to the Claude terminal (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await expect(terminalRegion(page, "notes-short")).toBeVisible();
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();

  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeHidden();
  await expect.poll(() => activeElementInsideTerminal(page, "notes-short")).toBe(true);
});

test("Escape in the popped panel returns keyboard focus to the Claude terminal (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await expect(terminalRegion(page, "notes-short")).toBeVisible();
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();
  await popInNote(page).focus();

  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await expect.poll(() => activeElementInsideTerminal(page, "notes-short")).toBe(true);
});

test("the popped panel's close button returns keyboard focus to the Claude terminal (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await expect(terminalRegion(page, "notes-short")).toBeVisible();
  await noteGlyph(page).click();
  await popOutNote(page).click();
  await expect(popInNote(page)).toBeVisible();

  await notePanel(page).getByRole("button", { name: "Close note" }).click();
  await expect(notePanel(page)).toBeHidden();
  await expect.poll(() => activeElementInsideTerminal(page, "notes-short")).toBe(true);
});

test("closing the note on an ended session, where no terminal takes focus, lands on the note glyph and not body (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-ended");
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await notePanel(page).getByRole("button", { name: "Pop out note" }).focus();

  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await expect(noteGlyph(page)).toBeFocused();
});

test("closing the note with Docs the selected surface lands on the note glyph, not body (R1, REQ-5)", async ({
  page,
  dashboard,
}) => {
  await dashboard.open("notes");
  await focusSession(page, "notes-short");
  await mainheadSurfaceButton(page, "docs").click();
  await expect(noteGlyph(page)).toBeVisible();
  await noteGlyph(page).click();
  await expect(notePanel(page)).toBeVisible();
  await notePanel(page).getByRole("button", { name: "Pop out note" }).focus();

  await page.keyboard.press("Escape");
  await expect(notePanel(page)).toBeHidden();
  await expect(noteGlyph(page)).toBeFocused();
});
