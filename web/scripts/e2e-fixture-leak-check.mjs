#!/usr/bin/env node
// e2e-fixture-leak-check.mjs — REQ-4/W1/W3's self-test (plan post-worktree-spike-issues).
// Proves, rather than merely claims, that a failed ScratchDaemon.start() leaves nothing
// behind: the census this plan responds to found ~730 leaked musterd processes and 893
// leaked tmpdirs, precisely because the only prior evidence was a one-off manual repro.
// Node stdlib only (no new runtime dependency), mirroring contrast.mjs.
//
// Not a Playwright spec — it lives outside web/e2e/*.spec.ts on purpose (this plan's E3),
// so none of e2e-lint.sh's three rules need an exemption for it, and REQ-12's
// musterdBinOverride — which this script alone uses (W7) — never needs to touch the real
// bin/musterd every concurrent build and the 4-worker E2E suite also read.
//
// Method: point ScratchDaemon.start() (via the daemon fixture module directly, not
// through helpers/fixtures.ts's Playwright-test-bound wrappers) at a fake "musterd" that
// accepts every flag and then just sleeps — never binds the port, never writes
// tokens.json, never answers /healthz — so start()'s own waitForHealthy timeout is what
// fails it. That is the same shape validation.md's manual repro used (the real
// `bin/musterd` swapped for `exec sleep 600`), scoped here to a private override so it
// can never affect a concurrent build or run. The fake first writes its own pid (`$$`)
// to a known file, then `exec`s into `sleep` — replacing its own process image rather
// than forking a child — both so SIGTERM has only one process to kill (no descendant
// left holding this script's own stdout/stderr pipe open, which would hang this script
// exactly the way REQ-1/REQ-2 fix the daemon side) and so the pid recorded before the
// exec is still valid afterwards for this script's own survival check (same pid, new
// image).
//
// Exit 0 iff: start() actually rejected (a silent resolve means the fixture, or this
// script's fake binary, is broken, not that the guard passed); the rejection still names
// why the daemon was unhealthy and still carries the captured output (REQ-5/W2); the
// recorded pid is no longer alive; and no `muster e2e-<random>` tmpdir (the per-run
// data-dir mkdtemp prefix, web/e2e/helpers/daemon.ts's start()) is left in the OS tmpdir
// — excluding `muster e2e-stub-<hash>`, the intentionally-persistent shared stub-claude
// cache the same file's ensureSharedStubClaude() also keys off that prefix.
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startScratchDaemon } from "../e2e/helpers/daemon.ts";

/** `muster e2e-<random>` (the per-run data-dir mkdtemp prefix in helpers/daemon.ts), but
 * not `muster e2e-stub-<hash>` — the shared stub-claude cache, which is meant to outlive
 * any single run and is not part of this leak. */
function isScratchDataDir(name) {
  return name.startsWith("muster e2e-") && !name.startsWith("muster e2e-stub-");
}

/** Reads the pid the fake musterd recorded before it `exec`'d, or `null` if start()
 * failed early enough that the fake never even ran (no leak possible either way). */
async function readRecordedPid(pidFile) {
  try {
    const raw = await readFile(pidFile, "utf-8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** `kill -0` — signals nothing, just probes whether `pid` still names a live process. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const scratchDir = await mkdtemp(join(tmpdir(), "muster-leak-check-"));
  const fakeBinPath = join(scratchDir, "fake-musterd");
  const pidFile = join(scratchDir, "fake-musterd.pid");
  try {
    // Deliberately never binds the port or writes tokens.json — every flag start()
    // passes is accepted and ignored, so the only way this fake ever stops is by being
    // killed.
    const script = ["#!/bin/sh", `echo "$$" > '${pidFile}'`, "exec sleep 3600", ""].join("\n");
    await writeFile(fakeBinPath, script, { mode: 0o755 });
    await chmod(fakeBinPath, 0o755);

    const before = new Set((await readdir(tmpdir())).filter(isScratchDataDir));

    let threw = false;
    let message = "";
    try {
      await startScratchDaemon({ musterdBinOverride: fakeBinPath });
    } catch (err) {
      threw = true;
      message = String(err);
    }

    let failed = false;

    if (!threw) {
      console.error(
        "e2e-fixture-leak-check: start() resolved against a musterd that never answers " +
          "/healthz — the fixture guard, or this script's fake binary, is broken",
      );
      failed = true;
    } else {
      // REQ-5/W2: the rejection must still name why the daemon was unhealthy and still
      // carry the captured musterd output, not just "it failed" — see waitForHealthy()
      // and spawnAndWait()'s catch in helpers/daemon.ts.
      if (!message.includes("never became healthy")) {
        console.error(`e2e-fixture-leak-check: rejection lost its "never became healthy" diagnostic: ${message}`);
        failed = true;
      }
      if (!message.includes("scratch musterd output:")) {
        console.error(`e2e-fixture-leak-check: rejection lost its captured musterd output: ${message}`);
        failed = true;
      }
    }

    const pid = await readRecordedPid(pidFile);
    if (pid !== null && isAlive(pid)) {
      console.error(`e2e-fixture-leak-check: fake-musterd (pid ${String(pid)}) survived start()'s rejection`);
      failed = true;
      // Self-test hygiene, not part of the guard being tested: without REQ-4's guard the
      // leaked fake-musterd is a direct child of THIS Node process, so its still-open
      // stdout/stderr pipes are themselves active libuv handles that would otherwise
      // hang this script forever instead of letting it report the failure and exit.
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone between the check above and here — fine.
      }
    }

    const after = (await readdir(tmpdir())).filter(isScratchDataDir);
    const leaked = after.filter((name) => !before.has(name));
    if (leaked.length > 0) {
      console.error(`e2e-fixture-leak-check: leaked tmpdir(s): ${leaked.join(", ")}`);
      failed = true;
    }

    if (!failed) {
      console.log("e2e-fixture-leak-check: clean — start() rejected with its diagnostic intact, no surviving process, no leaked tmpdir");
    }
    return failed ? 1 : 0;
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

main()
  .catch((err) => {
    console.error("e2e-fixture-leak-check: unexpected failure", err);
    return 1;
  })
  .then((code) => {
    // Explicit exit, not exitCode-and-drain: the whole point of a *failing* run here is
    // that REQ-4's guard didn't close something (a listener, a process whose pipes this
    // script itself inherited) — Node's event loop would otherwise hang on that leak
    // forever rather than reporting it, which is a worse failure mode than a red exit
    // code. A passing run has nothing left open, so this changes nothing about it.
    process.exit(code);
  });
