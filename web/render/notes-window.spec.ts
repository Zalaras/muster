// notes-window — `note.html?session=<id>`, the note on its own page. A real popup never reaches
// the harness's routes, so each test opens the dashboard scenario for its fixture and then
// navigates the same page to the note window.
import { expect, RENDER_ORIGIN, test } from "./helpers/harness";
import { tokenColor } from "./helpers/notes";

const TITLE = "notes-long";

test("the note window shows its session's header, rendered note and document title, and an unknown id the removed notice (R9, REQ-9, REQ-12)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const long = fixture.snapshot.sessions.find((s) => s.title === TITLE);
  expect(long).toBeDefined();
  const known = new Set(fixture.snapshot.sessions.map((s) => s.id));
  let unknown = 9000;
  while (known.has(unknown)) unknown++;

  await page.goto(`${RENDER_ORIGIN}/note.html?session=${long?.id}`);
  const dialog = page.getByRole("dialog", { name: "Note", exact: true });
  await expect(dialog.locator(".ph")).toHaveText(/Note\s*·\s*notes-long/);
  await expect(page).toHaveTitle("Note · notes-long");
  const body = dialog.getByRole("group", { name: "Rendered note" });
  await expect(body).toBeVisible();
  await expect(body.locator("table.frontmatter, pre.frontmatter")).toHaveCount(1);
  await expect(body.locator("figure.diagram, p.diagram-error")).toHaveCount(1);
  await expect(dialog.locator(".ph .ctl:visible")).toHaveCount(0);

  await page.goto(`${RENDER_ORIGIN}/note.html?session=${unknown}`);
  await expect(
    page.getByRole("status").filter({ hasText: "This session has been removed." }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(0);
});

test("in the note window one click on the rendered note edits it and Escape leaves edit mode with the note still shown (R12, REQ-9)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const short = fixture.snapshot.sessions.find((s) => s.title === "notes-short");
  await page.goto(`${RENDER_ORIGIN}/note.html?session=${short?.id}`);
  const body = page.getByRole("group", { name: "Rendered note" });
  await expect(body).toContainText("Waiting on review.");
  await body.click();
  const editor = page.getByRole("textbox", { name: "Note text" });
  await expect(editor).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(body).toBeVisible();
  await expect(body).toContainText("Waiting on review.");
});

test("the note window reads connecting… until its socket's first hello (R13, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const short = fixture.snapshot.sessions.find((s) => s.title === "notes-short");
  // A later route wins: this socket accepts the connection and stays silent, so no hello arrives.
  await page.routeWebSocket("**/ws", () => {});
  await page.goto(`${RENDER_ORIGIN}/note.html?session=${short?.id}`);
  const status = page.getByRole("dialog", { name: "Note", exact: true }).getByRole("status");
  await expect(status).toHaveText("connecting…");
  await expect(page).toHaveTitle("Note");
});

test("the note window reads `musterd unreachable` in --warn once its socket drops after a hello, the note still shown and editable; a failed save reads `unsaved, musterd unreachable` (R13, REQ-11)", async ({
  page,
  dashboard,
}) => {
  const fixture = await dashboard.open("notes");
  const short = fixture.snapshot.sessions.find((s) => s.title === "notes-short");
  // A later route wins: hello and snapshot, then the socket drops.
  await page.routeWebSocket("**/ws", (ws) => {
    ws.send(JSON.stringify(fixture.hello));
    ws.send(JSON.stringify(fixture.snapshot));
    ws.close();
  });
  await page.goto(`${RENDER_ORIGIN}/note.html?session=${short?.id}`);
  const dialog = page.getByRole("dialog", { name: "Note", exact: true });
  const status = dialog.getByRole("status");
  const body = page.getByRole("group", { name: "Rendered note" });
  await expect(status).toHaveText("musterd unreachable");
  await expect(status).toHaveCSS("color", await tokenColor(page, "--warn"));
  await expect(body).toContainText("Waiting on review.");

  // Still editable while reconnecting; a failed save wins over the socket word.
  await page.route("**/api/sessions/*/note", (route) => route.abort("connectionrefused"));
  await body.click();
  const editor = page.getByRole("textbox", { name: "Note text" });
  await expect(editor).toBeFocused();
  await editor.fill("an unsaved draft");
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("unsaved, musterd unreachable");
  await expect(status).toHaveCSS("color", await tokenColor(page, "--warn"));
});
