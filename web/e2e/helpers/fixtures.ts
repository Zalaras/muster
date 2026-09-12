// The one place a spec gets its scratch daemon from (docs/conventions.md §Testing).
//
// Three shapes, one decision rule — pick the first that fits:
//
//   `daemon`       fresh scratch daemon per test (test-scoped fixture). The DEFAULT, and
//                  mandatory when any test in the file asserts daemon-global state — rail
//                  or grid order/counts, prefs, usage, theme, auto-focus on "the only
//                  session" — or calls daemon.restart()/kill(). Options come from the
//                  `daemonOptions` option fixture: `test.use({ daemonOptions: {...} })` at
//                  file or describe level.
//   `startDaemon`  a factory (test-scoped) for the rare test whose spawn options depend on a
//                  value computed inside the test — a FakeUsageAPI's URL, a fake GitHub
//                  endpoint. Every daemon it starts is torn down after the test.
//   `fileDaemon()` one daemon shared by every test in the file (beforeAll/afterAll, so one
//                  per worker per file under fullyParallel). Only for files whose tests are
//                  title-scoped — each creates and asserts on its own sessions and tolerates
//                  neighbours. Deliberately NOT a worker-scoped fixture: that would share a
//                  daemon across files, and terminal.spec.ts's header records what a
//                  neighbour test's session does to "top of sort" auto-focus.
//
// Spec files import `test`, `expect` and any Playwright types from here, never from
// "@playwright/test", and never call startScratchDaemon themselves — web/scripts/e2e-lint.sh
// (run by `npm run e2e` and the pipeline gates) fails on either. Fixtures are lazy: a test
// that destructures only `startDaemon` never pays for a `daemon` it doesn't use.
//
// Ownership: like playwright.config.ts, this file is web-impl's, not e2e-specs' — it holds
// knobs that decide what "passing" means (.claude/agents/e2e-specs.md, gate integrity).
import { test as base, type Page } from "@playwright/test";
import { type ScratchDaemon, type ScratchDaemonOptions, startScratchDaemon } from "./daemon";

export { expect } from "@playwright/test";
export type {
  APIRequestContext,
  BrowserContext,
  Locator,
  Page,
  Request,
  Response,
  TestInfo,
  WebSocket,
} from "@playwright/test";
export type { ScratchDaemon, ScratchDaemonOptions } from "./daemon";

type DaemonFixtures = {
  daemonOptions: ScratchDaemonOptions;
  daemon: ScratchDaemon;
  startDaemon: (opts?: ScratchDaemonOptions) => Promise<ScratchDaemon>;
};

export const test = base.extend<DaemonFixtures>({
  daemonOptions: [{}, { option: true }],

  daemon: async ({ daemonOptions }, use) => {
    const daemon = await startScratchDaemon(daemonOptions);
    await use(daemon);
    await daemon.teardown();
  },

  startDaemon: async ({}, use) => {
    const started: ScratchDaemon[] = [];
    await use(async (opts: ScratchDaemonOptions = {}) => {
      const daemon = await startScratchDaemon(opts);
      started.push(daemon);
      return daemon;
    });
    await Promise.all(started.map((daemon) => daemon.teardown()));
  },
});

/**
 * One scratch daemon for every test in the calling file. Call at module top level (or
 * inside a describe); read it through the returned accessor from within tests and hooks.
 * Spawned once per worker per file — Playwright's beforeAll semantics under fullyParallel.
 */
export function fileDaemon(opts: ScratchDaemonOptions = {}): () => ScratchDaemon {
  let daemon: ScratchDaemon | undefined;

  test.beforeAll(async () => {
    daemon = await startScratchDaemon(opts);
  });

  test.afterAll(async () => {
    await daemon?.teardown();
    daemon = undefined;
  });

  return () => {
    if (!daemon) {
      throw new Error(
        "fileDaemon(): no daemon running — read the accessor inside a test or hook of this file, not at module load",
      );
    }
    return daemon;
  };
}

let titleSeq = 0;

/**
 * A session title no other test in this run can produce, for files on a shared daemon:
 * helpers/session.ts's sessionCard() matches with `hasText` (a substring), so "t-1" also
 * matches "t-10". The worker's pid separates workers; the zero-padded sequence separates
 * tests within one; the surrounding "-" separators stop pid 12 from prefixing pid 123.
 */
export function uniqueTitle(prefix: string): string {
  titleSeq += 1;
  return `${prefix}-${process.pid}-${String(titleSeq).padStart(3, "0")}`;
}

/**
 * Hold for `ms` so an assertion can then check that something STAYED as it was — the one
 * legitimate fixed wait: a negative assertion over a bounded window ("no second WebSocket
 * opened", "the tile did not move"). Never for waiting on something to happen; that is a
 * web-first `expect` or `expect.poll`, which retry up to the global expect timeout.
 * Spec files may not call page.waitForTimeout or setTimeout directly (e2e-lint.sh).
 */
export async function settleFor(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}
