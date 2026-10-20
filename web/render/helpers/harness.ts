// The render tier's one harness (docs/conventions.md §Testing; web/render/CLAUDE.md): the
// built bundle under internal/webui/assets served from disk by Playwright routes, `/ws`,
// `/api/repos` and the reader's two GETs answered from a generated fixture, no daemon anywhere. Spec files import `test`, `expect`
// and types from here, never from "@playwright/test", and get state only through
// `loadFixture` / `dashboard.open` — web/scripts/render-lint.sh fails on either.
import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test as base, type WebSocketRoute } from "@playwright/test";
import type { Hello } from "../../src/protocol/hello";
import { type Message, type Snapshot, parseMessage } from "../../src/protocol/messages";
import { isRecord } from "../../src/protocol/decode";

export { expect };
export type { Locator, Page, TestInfo } from "@playwright/test";
export type { Hello, Message, Snapshot };
export type { Session } from "../../src/protocol/session";
export type { Prefs } from "../../src/protocol/prefs";

/** Every timestamp in a generated fixture is this instant plus whole minutes, and the
 * page's clock starts here too, so relative times ("3 min") render the same on every run. */
export const FIXTURE_EPOCH = "2026-01-01T00:00:00Z";

/** The origin the page loads from. Nothing listens there: every request is fulfilled by a
 * route, and the name exists only so `location.host` gives the bundle a `ws://` URL. */
export const RENDER_ORIGIN = "http://muster.render";

/** One session's recorded reader: the `GET /api/sessions/{id}/reader` body and every
 * document it names, as `GET …/reader/file` served them. */
export interface ReaderRecording {
  sessionId: number;
  listing: unknown;
  files: { path: string; body: string }[];
}

export interface RenderFixture {
  scenario: string;
  hello: Hello;
  snapshot: Snapshot;
  repos: unknown[];
  /** Absent in a fixture recorded before the reader was captured; then the docs surface meets
   * the harness's 404 like any other unmocked `/api/**`. */
  reader: ReaderRecording[];
}

const here = fileURLToPath(new URL(".", import.meta.url));
// web/render/helpers -> repo root
const repoRoot = resolve(here, "../../..");
const fixturesDir = resolve(here, "../fixtures");
const assetsDir = join(repoRoot, "internal", "webui", "assets");

/** A fixture file as read: the parsed, typed frames for assertions plus the raw frames
 * exactly as the daemon wrote them, which is what the page receives. */
interface FixtureFile extends RenderFixture {
  rawHello: unknown;
  rawSnapshot: unknown;
}

async function readFixtureFile(name: string): Promise<FixtureFile> {
  const path = join(fixturesDir, `${name}.json`);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      `render fixture "${name}" not found at ${path} — run \`make gen-render-fixtures\`, or ask daemon-impl for the scenario in the Handoff`,
    );
  }
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || typeof data["scenario"] !== "string" || !Array.isArray(data["repos"])) {
    throw new Error(
      `render fixture "${name}": expected {scenario, hello, snapshot, repos, reader}, got keys ${
        isRecord(data) ? Object.keys(data).join(", ") : typeof data
      }`,
    );
  }
  const reader = parseReaderRecordings(name, data["reader"]);
  const hello = parseMessage(data["hello"]);
  if (hello?.type !== "hello") {
    throw new Error(
      `render fixture "${name}": the hello frame does not parse as the protocol's hello`,
    );
  }
  const snapshot = parseMessage(data["snapshot"]);
  if (snapshot?.type !== "snapshot") {
    throw new Error(
      `render fixture "${name}": the snapshot frame does not parse as the protocol's snapshot (a malformed session rejects the whole frame)`,
    );
  }
  return {
    scenario: data["scenario"],
    hello,
    snapshot,
    repos: data["repos"],
    reader,
    rawHello: data["hello"],
    rawSnapshot: data["snapshot"],
  };
}

function parseReaderRecordings(name: string, raw: unknown): ReaderRecording[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`render fixture "${name}": reader is not an array`);
  return raw.map((entry, i) => {
    if (
      !isRecord(entry) ||
      typeof entry["sessionId"] !== "number" ||
      !("listing" in entry) ||
      !Array.isArray(entry["files"])
    ) {
      throw new Error(`render fixture "${name}": reader[${i}] is not {sessionId, listing, files}`);
    }
    const files = entry["files"].map((f, j) => {
      if (!isRecord(f) || typeof f["path"] !== "string" || typeof f["body"] !== "string") {
        throw new Error(`render fixture "${name}": reader[${i}].files[${j}] is not {path, body}`);
      }
      return { path: f["path"], body: f["body"] };
    });
    return { sessionId: entry["sessionId"], listing: entry["listing"], files };
  });
}

/** Reads and validates `web/render/fixtures/<name>.json`. Fixtures are generated by
 * `make gen-render-fixtures` and never edited by hand. */
export async function loadFixture(name: string): Promise<RenderFixture> {
  const { scenario, hello, snapshot, repos, reader } = await readFixtureFile(name);
  return { scenario, hello, snapshot, repos, reader };
}

function jsonResponse(status: number, body: unknown) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

const NO_DAEMON = jsonResponse(404, {
  error: { code: "render-harness", message: "no daemon in a render test" },
});

async function installRoutes(
  page: Page,
  fixture: FixtureFile,
): Promise<() => WebSocketRoute | null> {
  // Later registrations win, so the catch-all goes first and `/api/repos` last.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== RENDER_ORIGIN) return route.fulfill(NO_DAEMON);
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(assetsDir, rel);
    if (!file.startsWith(assetsDir + sep)) return route.fulfill({ status: 403 });
    const exists = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    if (!exists) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file });
  });
  await page.route("**/api/**", (route) => route.fulfill(NO_DAEMON));
  await page.route("**/api/repos", (route) => route.fulfill(jsonResponse(200, fixture.repos)));
  // The reader's two GETs, from the recording (kb:anchor/sessions.reader{,-file}); a session
  // or a path the recording lacks gets the live daemon's own 404 shape.
  const recordingFor = (url: URL) => {
    const m = /^\/api\/sessions\/(\d+)\/reader(?:\/file)?$/.exec(url.pathname);
    return m ? fixture.reader.find((r) => r.sessionId === Number(m[1])) : undefined;
  };
  await page.route(/\/api\/sessions\/\d+\/reader$/, (route) => {
    const rec = recordingFor(new URL(route.request().url()));
    return route.fulfill(rec ? jsonResponse(200, rec.listing) : NO_DAEMON);
  });
  await page.route(/\/api\/sessions\/\d+\/reader\/file\?/, (route) => {
    const url = new URL(route.request().url());
    const file = recordingFor(url)?.files.find((f) => f.path === url.searchParams.get("path"));
    if (!file) {
      return route.fulfill(
        jsonResponse(404, { error: { code: "not_found", message: "no such document" } }),
      );
    }
    return route.fulfill({
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      headers: { "Cache-Control": "no-store" },
      body: file.body,
    });
  });

  let socket: WebSocketRoute | null = null;
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    ws.send(JSON.stringify(fixture.rawHello));
    ws.send(JSON.stringify(fixture.rawSnapshot));
  });
  // A live card in Focus or Tiles opens a terminal or shell socket; with no PTY behind it
  // the surface just stays blank.
  await page.routeWebSocket(/\/ws\/(terminal|shell)\/\d+$/, () => {});
  return () => socket;
}

async function assertBundleBuilt(): Promise<void> {
  const index = join(assetsDir, "index.html");
  const built = await stat(index).then(
    (s) => s.isFile(),
    () => false,
  );
  if (!built) {
    throw new Error(`render harness: no built bundle at ${index} — run \`make web-build\` first`);
  }
}

export interface Dashboard {
  /** Loads the page with `<fixtureName>.json` behind `/ws` and `/api/repos`; resolves
   * once `#sessions` is attached. Returns the fixture so a test can assert against it. */
  open(fixtureName: string): Promise<RenderFixture>;
  /** Pushes one more frame down the faked `/ws`, after `open`. */
  send(frame: Message | object): void;
  url: string;
}

type RenderFixtures = {
  dashboard: Dashboard;
};

export const test = base.extend<RenderFixtures>({
  dashboard: async ({ page }, use) => {
    let socket: () => WebSocketRoute | null = () => null;
    const url = `${RENDER_ORIGIN}/`;
    await use({
      url,
      async open(fixtureName) {
        await assertBundleBuilt();
        const fixture = await readFixtureFile(fixtureName);
        await page.clock.install({ time: FIXTURE_EPOCH });
        socket = await installRoutes(page, fixture);
        await page.goto(url);
        await page.locator("#sessions").waitFor({ state: "attached" });
        const { scenario, hello, snapshot, repos, reader } = fixture;
        return { scenario, hello, snapshot, repos, reader };
      },
      send(frame) {
        const ws = socket();
        if (!ws)
          throw new Error("dashboard.send(): the page has not opened /ws yet — call open() first");
        ws.send(JSON.stringify(frame));
      },
    });
  },
});

/**
 * Advance the page's installed clock by `ms` so an assertion can then check that something
 * STAYED as it was — the one legitimate fixed wait, as in web/e2e/helpers/fixtures.ts.
 * Never for waiting on something to happen; that is a web-first `expect`.
 */
export async function settleFor(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}
