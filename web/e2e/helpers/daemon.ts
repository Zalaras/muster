// Scratch-daemon harness for the E2E suite (plan m0-skeleton, extended by m1-sessions —
// Affected Files > E2E: "-claude-bin (a stub script the harness writes) and a per-run
// -tmux-socket; kill that tmux server in teardown").
//
// Every test file that needs a real daemon calls startScratchDaemon() once (typically
// from test.beforeAll) and gets a fresh port + fresh temp data dir + a freshly spawned
// `bin/musterd` process, per docs/conventions.md's "never attach to an existing server"
// rule. Nothing here talks to Vite — that harness retired with the pre-M0 scaffold.
//
// M1 addition: every scratch daemon also gets its own dedicated tmux socket (never
// `-L muster`, never the user's default server — CLAUDE.md hard rule) and a stub
// `claude` binary (a `#!/bin/sh` sleep loop) passed via `-claude-bin`, so `POST
// /api/sessions` really spawns a tmux window without ever launching a real `claude`
// process. The stub never exits on its own — pane-liveness tests (E9) control death
// explicitly via `tmux kill-window`.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const here = fileURLToPath(new URL(".", import.meta.url));
// web/e2e/helpers -> repo root
const repoRoot = resolve(here, "../../..");
const musterdBin = join(repoRoot, "bin", "musterd");
const webDist = join(repoRoot, "web", "dist");

interface TokensFile {
  dashboardUrl: string;
  uiToken: string;
  ingestToken: string;
}

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const { port } = address;
        srv.close(() => resolvePort(port));
      } else {
        srv.close(() => reject(new Error("could not allocate a free port")));
      }
    });
  });
}

async function waitForHealthy(baseURL: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/healthz`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`scratch musterd never became healthy at ${baseURL}: ${String(lastErr)}`);
}

async function readTokens(dataDir: string): Promise<TokensFile> {
  const raw = await readFile(join(dataDir, "tokens.json"), "utf-8");
  return JSON.parse(raw) as TokensFile;
}

/** A per-run scratch `musterd`: its own port, data dir, tmux socket and process. */
export class ScratchDaemon {
  readonly port: number;
  readonly baseURL: string;
  readonly dataDir: string;
  readonly dbPath: string;
  /** Dedicated tmux socket name for this run only (REQ-19) — never `-L muster`. */
  readonly tmuxSocket: string;
  /** Absolute path to the stub `claude` binary this run's launches will invoke. */
  readonly claudeBinPath: string;
  uiToken = "";
  ingestToken = "";
  dashboardUrl = "";
  private proc: ChildProcess | null = null;
  /** Tail of the current process's stdout+stderr, kept for crash diagnostics. */
  private output = "";

  private constructor(port: number, dataDir: string) {
    this.port = port;
    this.baseURL = `http://127.0.0.1:${port}`;
    this.dataDir = dataDir;
    this.dbPath = join(dataDir, "muster.db");
    // dataDir's mkdtemp suffix is already a fresh random name — reuse it as the tmux
    // socket name too, so no separate uniqueness scheme is needed.
    this.tmuxSocket = basename(dataDir);
    this.claudeBinPath = join(dataDir, "stub-claude.sh");
  }

  static async start(): Promise<ScratchDaemon> {
    const port = await freePort();
    const dataDir = await mkdtemp(join(tmpdir(), "muster-e2e-"));
    const daemon = new ScratchDaemon(port, dataDir);
    await daemon.writeStubClaude();
    await daemon.spawnAndWait();
    return daemon;
  }

  /**
   * Writes the fake `claude` binary musterd will spawn (REQ-19's `-claude-bin` seam).
   * A sleep loop that never exits on its own: liveness tests kill the tmux window
   * explicitly (E9) rather than relying on the stub to die. No real `claude` binary is
   * ever invoked by this harness (CLAUDE.md hard rule).
   */
  private async writeStubClaude(): Promise<void> {
    await writeFile(this.claudeBinPath, "#!/bin/sh\nwhile true; do sleep 3600; done\n", {
      mode: 0o755,
    });
  }

  private async spawnAndWait(): Promise<void> {
    this.output = "";
    const proc = spawn(
      musterdBin,
      [
        "-addr",
        `127.0.0.1:${this.port}`,
        "-data-dir",
        this.dataDir,
        "-web-dist",
        webDist,
        "-claude-bin",
        this.claudeBinPath,
        "-tmux-socket",
        this.tmuxSocket,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    // Drain stdio: an unread pipe discards a crashed daemon's diagnostics and can stall
    // a chatty process once the pipe buffer fills. Keep only a bounded tail.
    for (const stream of [proc.stdout, proc.stderr]) {
      stream?.setEncoding("utf-8");
      stream?.on("data", (chunk: string) => {
        this.output = (this.output + chunk).slice(-16_384);
      });
    }
    proc.on("exit", (code, signal) => {
      // kill() nulls this.proc before signalling, so this only fires for crashes.
      if (this.proc === proc) {
        console.error(
          `scratch musterd exited unexpectedly (code ${String(code)}, signal ${String(signal)}); last output:\n${this.output}`,
        );
      }
    });
    this.proc = proc;
    try {
      await waitForHealthy(this.baseURL);
    } catch (err) {
      throw new Error(`${String(err)}\nscratch musterd output:\n${this.output}`);
    }
    const tokens = await readTokens(this.dataDir);
    this.uiToken = tokens.uiToken;
    this.ingestToken = tokens.ingestToken;
    this.dashboardUrl = tokens.dashboardUrl;
  }

  /** Builds an ingest URL for the given endpoint, using this run's real ingest token. */
  ingestURL(kind: "hook" | "status"): string {
    return `${this.baseURL}/ingest/${this.ingestToken}/${kind}`;
  }

  /** Sends SIGTERM (REQ-20's graceful path) and waits for exit, escalating after 5s. */
  async kill(): Promise<void> {
    const proc = this.proc;
    this.proc = null;
    if (!proc || proc.exitCode !== null) return;
    await new Promise<void>((resolveExit) => {
      const timer = setTimeout(() => proc.kill("SIGKILL"), 5_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
      proc.kill("SIGTERM");
    });
  }

  /** Kills then respawns on the SAME port and data dir (E12 — tokens/db must survive). */
  async restart(): Promise<void> {
    await this.kill();
    await this.spawnAndWait();
  }

  /** Kills the process, kills this run's private tmux server, removes the temp data dir. */
  async teardown(): Promise<void> {
    await this.kill();
    try {
      await execFileAsync("tmux", ["-L", this.tmuxSocket, "kill-server"]);
    } catch {
      // No server was ever started on this socket (no session launched) — fine.
    }
    await rm(this.dataDir, { recursive: true, force: true });
  }

  /** Kills one tmux window by its recorded `tmuxTarget` (E9's explicit-death control). */
  async killTmuxWindow(tmuxTarget: string): Promise<void> {
    await execFileAsync("tmux", ["-L", this.tmuxSocket, "kill-window", "-t", tmuxTarget]);
  }

  /** True iff a pane still exists for the given `tmuxTarget` on this run's socket. */
  async tmuxPaneExists(tmuxTarget: string): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["-L", this.tmuxSocket, "list-panes", "-t", tmuxTarget]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function startScratchDaemon(): Promise<ScratchDaemon> {
  return await ScratchDaemon.start();
}
