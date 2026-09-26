// gatelock.ts — Playwright globalSetup: hold the machine-wide gate lock exclusively for the
// whole run. Two sweeps on this machine, or a sweep beside `make test-race`, go red on the
// same four timing specs (kb:lesson/concurrent-e2e-across-worktrees-goes-red), so every
// Playwright invocation — `make e2e`, `e2e-soak`, an agent's `npx playwright test <file>` —
// queues behind whoever holds it. `--list` never runs globalSetup, so listing stays instant.
//
// The lock lives in a Go child (`tools/gatelock hold`) that flocks, prints `acquired`, and
// releases when its stdin closes: Playwright ending normally ends the pipe in teardown, and a
// SIGKILLed runner closes it too, so a dead run can never keep the lock. Under a caller that
// already holds it (gates.sh, `make e2e`) the child no-ops via MUSTER_GATELOCK.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// web/e2e/helpers -> repo root
const repoRoot = resolve(here, "../../..");

// EX_TEMPFAIL from tools/gatelock: the wait expired. The message leads with the same
// prefix the tool prints so a reader reruns instead of debugging a "globalSetup failure".
const EXIT_BUSY = 75;

export default async function globalSetup(): Promise<() => Promise<void>> {
  // MUSTER_GATELOCK_WAIT overrides the tool's 240 s default (a Go duration, e.g. `0` to
  // fail fast); unset, a run queues for one full sweep before giving up.
  const wait = process.env["MUSTER_GATELOCK_WAIT"];
  const args = [
    "run",
    "./tools/gatelock",
    "hold",
    "--exclusive",
    ...(wait ? ["--wait", wait] : []),
  ];
  const child = spawn("go", args, {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "inherit"],
  });
  const exited = new Promise<number | null>((done) => child.once("exit", (code) => done(code)));
  const lines = createInterface({ input: child.stdout });
  const acquired = new Promise<void>((done) => {
    lines.on("line", (line) => {
      if (line === "acquired") done();
    });
  });
  const outcome = await Promise.race([acquired.then(() => "acquired" as const), exited]);
  if (outcome !== "acquired") {
    const reason =
      outcome === EXIT_BUSY
        ? "gatelock: busy — another Playwright run (or gates.sh) holds the gate lock; rerun when it is free, nothing failed"
        : `gatelock: hold exited with ${outcome} before acquiring the gate lock`;
    throw new Error(reason);
  }
  return async () => {
    child.stdin.end(); // stdin EOF is the release
    await exited;
  };
}
