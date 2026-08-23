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
// `claude` binary passed via `-claude-bin`, so `POST /api/sessions` really spawns a tmux
// window without ever launching a real `claude` process. The stub never exits on its
// own — pane-liveness tests (E9/E12) control death explicitly via `tmux kill-window`.
//
// M2 addition (plan m2-terminal, REQ-5 — the queued M1 follow-up): the socket is now a
// filesystem *path* inside the scratch data dir (`-S`, never a bare `-L` name), so every
// tmux server this harness starts lives, and dies, inside a directory the harness already
// deletes — matching REQ-5's socket-path support the daemon itself gains. The stub
// `claude` binary is upgraded from a plain sleep loop to an echo loop (REQ-1/E1/E2's
// terminal-bridge round trip needs *something* to read back): it prints
// `MUSTER-STUB-READY`, then `stub-echo:<line>` per input line, then falls into the old
// sleep-forever loop once its stdin hits EOF (pane death) — so M1's liveness specs, which
// depend on the pane staying alive until explicitly killed, are unaffected.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  /**
   * Dedicated tmux socket *path* for this run only (REQ-19, path form per M2 REQ-5) —
   * never `-L muster`. Living inside `dataDir` means `teardown()`'s `rm` cleans up the
   * socket file too; every `tmux` invocation below uses `-S`, never `-L`.
   */
  readonly tmuxSocket: string;
  /** Absolute path to the stub `claude` binary this run's launches will invoke. */
  readonly claudeBinPath: string;
  /**
   * Per-run folder-browser root (`-browse-root`): the modal's Browse… flow starts and
   * stops here, so browse tests never create anything under the real `$HOME`.
   */
  readonly browseRoot: string;
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
    // M2 REQ-5: a path (contains "/"), not a bare name — exercises the daemon's own
    // `-S` vs `-L` branch and keeps the socket file inside the scratch dir teardown()
    // already deletes.
    this.tmuxSocket = join(dataDir, "tmux.sock");
    this.claudeBinPath = join(dataDir, "stub-claude.sh");
    this.browseRoot = join(dataDir, "browse-root");
  }

  static async start(): Promise<ScratchDaemon> {
    const port = await freePort();
    const dataDir = await mkdtemp(join(tmpdir(), "muster-e2e-"));
    const daemon = new ScratchDaemon(port, dataDir);
    await mkdir(daemon.browseRoot, { recursive: true });
    await daemon.writeStubClaude();
    await daemon.spawnAndWait();
    return daemon;
  }

  /**
   * Writes the fake `claude` binary musterd will spawn (REQ-19's `-claude-bin` seam),
   * upgraded by m2-terminal from a plain sleep loop to an echo loop so the terminal
   * bridge (REQ-1) has something deterministic to stream both directions: it prints
   * `MUSTER-STUB-READY` (E1's readback token) once at startup, then `stub-echo:<line>`
   * for every line it reads from its controlling pty (E2's round trip), then — once
   * stdin hits EOF, which only happens when the pane itself is torn down — falls into
   * the old sleep-forever loop. Liveness tests still kill the tmux window explicitly
   * (E9/E12) rather than relying on the stub to exit on its own. No real `claude` binary
   * is ever invoked by this harness (CLAUDE.md hard rule).
   */
  private async writeStubClaude(): Promise<void> {
    const script = [
      "#!/bin/sh",
      'echo "MUSTER-STUB-READY"',
      "while IFS= read -r line; do",
      '  echo "stub-echo:$line"',
      "done",
      "while true; do sleep 3600; done",
      "",
    ].join("\n");
    await writeFile(this.claudeBinPath, script, { mode: 0o755 });
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
        "-browse-root",
        this.browseRoot,
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
      await execFileAsync("tmux", ["-S", this.tmuxSocket, "kill-server"]);
    } catch {
      // No server was ever started on this socket (no session launched) — fine.
    }
    await rm(this.dataDir, { recursive: true, force: true });
  }

  /** Kills one tmux window by its recorded `tmuxTarget` (E9/E12's explicit-death control). */
  async killTmuxWindow(tmuxTarget: string): Promise<void> {
    await execFileAsync("tmux", ["-S", this.tmuxSocket, "kill-window", "-t", tmuxTarget]);
  }

  /** True iff a pane still exists for the given `tmuxTarget` on this run's socket. */
  async tmuxPaneExists(tmuxTarget: string): Promise<boolean> {
    try {
      await execFileAsync("tmux", ["-S", this.tmuxSocket, "list-panes", "-t", tmuxTarget]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Tmux geometry oracle for E4/INV-3 (plan m2-terminal): `display-message -p` evaluates
   * a tmux format string against `target` (a window or session, e.g. `#{window_width}` /
   * `#{window_height}`) and returns the trimmed result — never a state source (CLAUDE.md
   * hard rule: capture/attach are display + oracle only), used purely to observe geometry
   * the daemon already applied via `pty.Setsize` + `resize-window`.
   */
  async tmuxDisplay(target: string, format: string): Promise<string> {
    const { stdout } = await execFileAsync("tmux", [
      "-S",
      this.tmuxSocket,
      "display-message",
      "-p",
      "-t",
      target,
      format,
    ]);
    return stdout.trim();
  }

  /**
   * Daemon-side oracle for INV-2 (review m2-terminal Minor 7): sums `#{session_attached}`
   * (each Muster session is its own tmux session under structural decision 1, so this is
   * an attach-client count per session, 0 or 1 under the one-live-client law) across every
   * tmux session on this run's socket. A browser-only `page.on('websocket')` count can't
   * see the server-side truth diverge from what the client believes — exactly the gap
   * behind Critical 4, where a client-initiated close leaked a PTY/attach client the
   * browser had already stopped counting. Returns 0 if the tmux server on this socket
   * hasn't started yet (no session launched), rather than throwing.
   */
  async totalAttachedClients(): Promise<number> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "-S",
        this.tmuxSocket,
        "list-sessions",
        "-F",
        "#{session_attached}",
      ]);
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .reduce((sum, line) => sum + Number(line), 0);
    } catch {
      return 0;
    }
  }
}

export async function startScratchDaemon(): Promise<ScratchDaemon> {
  return await ScratchDaemon.start();
}
