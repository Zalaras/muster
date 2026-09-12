import { expect, fileDaemon, test } from "./helpers/fixtures";

// REQ-1, REQ-4, REQ-5, REQ-7 (origin check) — auth surface for M0.
// One scratch daemon per file via fileDaemon() (one per worker for the tests it runs from
// here — docs/conventions.md's "never attach to an existing server"): every test is a
// stateless request against auth surfaces, so none can observe a neighbour.

const daemon = fileDaemon();

test("serves /healthz without authentication", async ({ request }) => {
  const res = await request.get(`${daemon().baseURL}/healthz`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string; version: string };
  expect(body.status).toBe("ok");
  expect(typeof body.version).toBe("string");
  expect(body.version.length).toBeGreaterThan(0);
});

test("shows the relaunch page for an unauthenticated visit to /", async ({ page }) => {
  const res = await page.goto(`${daemon().baseURL}/`);
  expect(res?.status()).toBe(401);
  await expect(page.getByText(/relaunch/i)).toBeVisible();
});

test("shows the relaunch page for a stale cookie", async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: "muster_auth", value: "not-a-real-token", url: daemon().baseURL }]);
  const res = await page.goto(`${daemon().baseURL}/`);
  expect(res?.status()).toBe(401);
  await expect(page.getByText(/relaunch/i)).toBeVisible();
});

test("rejects GET /api/state without the auth cookie with a JSON 401", async ({ request }) => {
  const res = await request.get(`${daemon().baseURL}/api/state`);
  expect(res.status()).toBe(401);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("unauthorized");
  expect(typeof body.error.message).toBe("string");
});

test("exchanges the UI token for a session cookie and lands on the rendered shell", async ({
  page,
}) => {
  const res = await page.goto(daemon().dashboardUrl);

  // page.goto follows the 303 -> "/" redirect; the final response is the shell itself.
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle("Muster");
  await expect(page.getByRole("heading", { name: "Muster" })).toBeVisible();

  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === "muster_auth");
  expect(authCookie).toBeTruthy();
  expect(authCookie?.httpOnly).toBe(true);
  expect(authCookie?.sameSite).toBe("Strict");
  expect(authCookie?.path).toBe("/");
});

test("gets a 401 relaunch page for a bad token at /auth", async ({ page }) => {
  const res = await page.goto(`${daemon().baseURL}/auth?token=not-the-real-token`);
  expect(res?.status()).toBe(401);
  await expect(page.getByText(/relaunch/i)).toBeVisible();
});

test("rejects a WS upgrade whose Origin host does not match the daemon's own", async ({ page }) => {
  // Authenticate first so the 403 is the origin check, not the cookie check.
  await page.goto(daemon().dashboardUrl);

  const res = await page.context().request.get(`${daemon().baseURL}/ws`, {
    headers: {
      Origin: "http://evil.example:9999",
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  expect(res.status()).toBe(403);
});
