import { expect, test } from "@playwright/test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";

// Plan embed-dashboard — REQ-1 through REQ-8, acceptance E1: the built dashboard is now
// embedded into the musterd binary via `//go:embed all:assets` (internal/webui), and
// `-web-dist` becomes a dev-only disk override (default flips to ""). Every other spec
// in this suite exercises the disk-override branch (helpers/daemon.ts's `webDist`
// constant, repointed at internal/webui/assets by this same plan's REQ-7) — this file is
// the ONLY one that exercises the embedded branch: a musterd binary physically copied
// away from the checkout, spawned with no -web-dist flag at all, from a cwd containing
// no web/ or internal/ tree.
//
// No protocol/UI changes ship with this plan (see plan.md's Protocol Contract and UI
// Specifications: "No dashboard views, flows, or DOM change"), so this file asserts only
// the existing Testable UI Elements table against the embedded-serving daemon, plus the
// R5 auth-gating parity the plan calls out as reviewer-verified-but-cheap-to-check here.

let daemon: ScratchDaemon;

test.beforeAll(async () => {
  daemon = await startScratchDaemon({ serveEmbedded: true });
});

test.afterAll(async () => {
  await daemon.teardown();
});

test("fixture sanity: the scratch dir has no web/ or internal/ tree next to the copied binary", async () => {
  // R7: the embedded-serving fixture must genuinely prove the binary is self-contained,
  // not merely that -web-dist was left off while a real checkout still sat next door.
  // daemon.dataDir is an OS tmpdir this harness mkdtemp'd fresh for this run (see
  // helpers/daemon.ts start()), so asserting the absence of both trees here is what
  // makes that claim checkable rather than assumed.
  await expect(access(join(daemon.dataDir, "web"))).rejects.toThrow();
  await expect(access(join(daemon.dataDir, "internal"))).rejects.toThrow();
});

test("serves the working dashboard from the embedded FS with no -web-dist flag: auth, masthead, WS connects", async ({
  page,
}) => {
  const res = await page.goto(daemon.dashboardUrl);

  // page.goto follows the /auth?token=... -> "/" redirect (auth.spec.ts's pattern); the
  // final response is the embedded shell itself, served over http.FileServer against
  // the go:embed FS rather than http.Dir against a disk path.
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle("Muster");

  // Testable UI Elements: native <h1>Muster</h1> inside .brand.
  await expect(page.getByRole("heading", { name: "Muster" })).toBeVisible();

  // Testable UI Elements: role="status" on #connection-status. Reaching "connected"
  // is also this plan's own stated functional proof for Content-Type parity (plan.md
  // Invariants): module scripts are MIME-type-strict in browsers, so if the embedded
  // FS served the wrong Content-Type for the JS module, the browser would refuse to
  // execute it and the WS would never open — this assertion would time out, not just
  // read the wrong text.
  await expect(page.getByRole("status")).toHaveText(/connected/i);

  // Auth flow completed for real: the daemon minted and the browser stored the same
  // httpOnly session cookie the disk path uses (auth.spec.ts's token-exchange test).
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === "muster_auth");
  expect(authCookie).toBeTruthy();
  expect(authCookie?.httpOnly).toBe(true);
  expect(authCookie?.sameSite).toBe("Strict");
});

test("still gates the embedded static handler on the auth cookie (401 relaunch page)", async ({ page }) => {
  // R5: requireCookie wraps the embedded http.FileServer branch identically to the disk
  // branch — a fresh, cookie-less context hitting "/" on the embedded-serving daemon
  // must see exactly the same 401 relaunch page auth.spec.ts asserts for the disk path.
  const res = await page.goto(`${daemon.baseURL}/`);
  expect(res?.status()).toBe(401);
  await expect(page.getByText(/relaunch/i)).toBeVisible();
});

test("serves /healthz without authentication from the embedded-serving daemon", async ({ request }) => {
  // Sanity that the embedded fixture is a normally-functioning daemon in every other
  // respect, not just for the one route this plan touches.
  const res = await request.get(`${daemon.baseURL}/healthz`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { status: string };
  expect(body.status).toBe("ok");
});
