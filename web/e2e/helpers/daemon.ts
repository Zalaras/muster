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
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
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
// Plan embed-dashboard REQ-7: the disk-override fixture every non-embedded spec in this
// suite uses now points at the daemon's new build output (internal/webui/assets), not
// the retired web/dist — the flag was always passed explicitly, but the path it named
// stopped being produced once web-impl repointed vite.config.ts's outDir.
const webDist = join(repoRoot, "internal", "webui", "assets");

interface TokensFile {
  dashboardUrl: string;
  uiToken: string;
  ingestToken: string;
}

/** `-on-exit` values (plan m4-reconcile REQ-3): `ask` is the daemon's own default when
 * the flag is omitted entirely, so `start()`'s `onExit` option defaults to `undefined`
 * (no flag passed) rather than the string `"ask"` — that keeps the default-flag path
 * exercised by every pre-M4 spec unchanged. */
export type OnExitPolicy = "ask" | "leave" | "kill";

/**
 * Plan issue-capture REQ-17/REQ-14: `-issue-repo` value the harness passes
 * unconditionally for every scratch daemon, regardless of whether a given test cares
 * about the feature. Deliberately NOT the daemon's own default (`Zalaras/muster`) —
 * a distinct, obviously-fake identifier means no scratch run's response can ever be
 * confused with the real repo, and tests get a fixed string to assert `Filed
 * <owner>/<repo>#<n>` against without depending on the daemon's production default.
 */
export const ISSUE_REPO_FIXTURE = "muster-e2e/fake-repo";

/**
 * Plan issue-capture REQ-17: every scratch daemon that doesn't opt into a real fake
 * GitHub server (helpers/ghapi.ts's `FakeGitHubAPI`) still gets `-issue-api-url` pointed
 * somewhere — this run-local stub, which 403s every request with a loud, diagnosable
 * body. Never the real GitHub API host; never silently unset (an unset `-issue-api-url` means
 * the flag is empty, which *disables* the feature per REQ-14 rather than reaching a real
 * host — but E2E always passes a live URL so `POST /api/issue/captures` still works for
 * tests that don't care about the filing step).
 */
async function startIssueDenyStub(): Promise<{ server: HttpServer; url: string }> {
  return await new Promise((resolvePromise, reject) => {
    const server = createHttpServer((_req, res) => {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "e2e: no fake GitHub configured for this test" }));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolvePromise({ server, url: `http://127.0.0.1:${address.port}` });
      } else {
        reject(new Error("issue deny stub could not bind a port"));
      }
    });
  });
}

export interface ScratchDaemonOptions {
  onExit?: OnExitPolicy;
  /**
   * Plan usage-model-bar REQ-13 test seam: `-usage-poll` duration string (e.g. `"0"` to
   * exercise the disabled-poller path, E6). Omit to leave the daemon's own 5m default —
   * every test still observes the poller's immediate on-Start fetch (REQ-1), so a short
   * interval is rarely needed and no spec here relies on a second, timer-driven tick.
   */
  usagePoll?: string;
  /**
   * Plan usage-model-bar REQ-13 test seam: `-usage-api-url` base, pointed at a
   * `FakeUsageAPI` (helpers/usageapi.ts) so this run's poller never reaches
   * api.anthropic.com. Omit to leave the daemon's real default — still safe, because
   * `usageTokenPath` is always a scratch path (see below), so every run without
   * `usageTokenContent` fails at the credentials step before any network call.
   */
  usageApiURL?: string;
  /**
   * JSON content to write to the scratch `-usage-token-file` before spawning — the
   * `{"claudeAiOauth":{"accessToken":"…"}}` shape `internal/claudecode` reads
   * (spikes/canary-fields.md; use helpers/usageapi.ts's `credentialsFileContent`). Omit
   * to leave the file absent — the "no-credentials" fixture (REQ-6 edge case 1).
   */
  usageTokenContent?: string;
  /**
   * Plan embed-dashboard REQ-7/E1 test seam: the embedded-serving fixture. When true,
   * this run copies `bin/musterd` into the scratch data dir, spawns that copy with
   * `cwd` set to the data dir, and omits `-web-dist` entirely — proving the binary
   * serves its `go:embed`-ed dashboard rather than a disk directory. The scratch data
   * dir is an OS tmpdir this harness creates fresh per run, so it genuinely contains no
   * `web/` or `internal/` tree next to the copied binary (R7). Omit (default false) to
   * keep every other spec's existing disk-override behaviour, passing `-web-dist`
   * pointed at `webDist` exactly as before.
   */
  serveEmbedded?: boolean;
  /**
   * Plan issue-capture REQ-13/E3/E4: `-issue-api-url` base, pointed at a
   * `FakeGitHubAPI` (helpers/ghapi.ts) so a filing test never reaches the real GitHub API host.
   * Omit to get this run's own per-run deny stub (`startIssueDenyStub`), which answers
   * every request `403 {"message":"e2e: no fake GitHub configured for this test"}` —
   * loud and diagnosable, never the real host. Either way the flag is passed
   * unconditionally (REQ-17).
   */
  issueApiURL?: string;
  /**
   * Plain-text content (the trimmed-contents-are-the-token shape, REQ-14 — unlike
   * `-usage-token-file`'s JSON) written to the scratch `-issue-token-file` before
   * spawning. Omit to leave the file absent — safe for every test that never calls
   * `POST /api/issues` (capture-only assertions), since `-issue-token-file` is still
   * passed unconditionally (REQ-17) so `gh` is never executed regardless.
   */
  issueTokenContent?: string;
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
  /**
   * Plan usage-model-bar REQ-13/INV-4: always a scratch path inside `dataDir`, passed
   * unconditionally via `-usage-token-file` for every scratch daemon — regardless of
   * whether a given test cares about the usage-model feature — so no E2E run, in this
   * file or any other, can ever fall through to the real macOS Keychain.
   */
  readonly usageTokenPath: string;
  /**
   * Plan embed-dashboard REQ-7/E1: absolute path this run copies `bin/musterd` to
   * inside `dataDir`, used only when `serveEmbedded` is true. Living inside `dataDir`
   * means `teardown()`'s `rm` cleans it up like everything else this run creates.
   */
  readonly embeddedBinPath: string;
  /**
   * Plan issue-capture REQ-17/REQ-14: always a scratch path inside `dataDir`, passed
   * unconditionally via `-issue-token-file` for every scratch daemon — mirroring
   * `usageTokenPath`'s discipline — so no E2E run can ever fall through to a real `gh`
   * invocation.
   */
  readonly issueTokenPath: string;
  /**
   * Plan issue-capture REQ-17: this run's `-issue-api-url` value — either the caller's
   * `FakeGitHubAPI` base URL or this run's own deny stub (`startIssueDenyStub`). Always
   * set, always passed (REQ-17), never the real GitHub API host.
   */
  readonly issueApiURL: string;
  /** The deny stub server started for this run when no `issueApiURL` option was given,
   * or `null` when the caller supplied its own (nothing here to close). Closed in
   * `teardown()`. */
  private denyStubServer: HttpServer | null = null;
  /** Plan embed-dashboard REQ-7: true iff this run spawns the copied binary from
   * `embeddedBinPath` with `cwd` = `dataDir` and no `-web-dist` flag at all — the
   * embedded-serving fixture — rather than the shared `musterdBin` with `-web-dist
   * webDist` every other spec uses. */
  private readonly serveEmbedded: boolean;
  uiToken = "";
  ingestToken = "";
  dashboardUrl = "";
  private proc: ChildProcess | null = null;
  /** Tail of the current process's stdout+stderr, kept for crash diagnostics and for
   * INV-4/E7's "the token never appears in a log line" grep. */
  private output = "";
  /** `-on-exit` policy this run's process is (re)spawned with — set once at construction
   * and reused by every `restart()` (plan m4-reconcile REQ-3). `undefined` omits the flag
   * entirely, exercising the daemon's own default (`ask`). */
  private readonly onExit: OnExitPolicy | undefined;
  /** `-usage-poll` value for this run, or `undefined` to omit the flag (plan
   * usage-model-bar REQ-13). */
  private readonly usagePoll: string | undefined;
  /** `-usage-api-url` value for this run, or `undefined` to omit the flag (plan
   * usage-model-bar REQ-13). */
  private readonly usageApiURL: string | undefined;

  private constructor(
    port: number,
    dataDir: string,
    issueApiURL: string,
    onExit?: OnExitPolicy,
    usagePoll?: string,
    usageApiURL?: string,
    serveEmbedded = false,
  ) {
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
    this.usageTokenPath = join(dataDir, "usage-token.json");
    this.issueTokenPath = join(dataDir, "issue-token.txt");
    this.issueApiURL = issueApiURL;
    this.embeddedBinPath = join(dataDir, "musterd");
    this.onExit = onExit;
    this.usagePoll = usagePoll;
    this.usageApiURL = usageApiURL;
    this.serveEmbedded = serveEmbedded;
  }

  static async start(opts: ScratchDaemonOptions = {}): Promise<ScratchDaemon> {
    const port = await freePort();
    // M4 (plan m4-hook-quoting, REQ-6/E1): the prefix contains a literal space so every
    // scratch daemon's data dir exercises the production path shape — the default macOS
    // data dir (`~/Library/Application Support/Muster`) contains a space, and until this
    // change no E2E run ever exercised the shell-quoting path the two command hooks rely
    // on (spikes/FINDINGS.md 2026-08-25 addendum). Do not "fix" a spec that breaks on the
    // space — that's the harness doing its job; report it instead (plan Affected Files).
    const dataDir = await mkdtemp(join(tmpdir(), "muster e2e-"));
    // Plan issue-capture REQ-17: resolve the deny stub BEFORE constructing, since the
    // constructor wants a concrete `issueApiURL` string, never `undefined`.
    let denyStubServer: HttpServer | null = null;
    let issueApiURL = opts.issueApiURL;
    if (issueApiURL === undefined) {
      const stub = await startIssueDenyStub();
      denyStubServer = stub.server;
      issueApiURL = stub.url;
    }
    const daemon = new ScratchDaemon(
      port,
      dataDir,
      issueApiURL,
      opts.onExit,
      opts.usagePoll,
      opts.usageApiURL,
      opts.serveEmbedded,
    );
    daemon.denyStubServer = denyStubServer;
    await mkdir(daemon.browseRoot, { recursive: true });
    await daemon.writeStubClaude();
    if (daemon.serveEmbedded) {
      // Plan embed-dashboard REQ-7: a COPY, not the shared musterdBin in place — the
      // fixture must prove a binary can be moved away from the checkout and still serve
      // its own dashboard. copyFile doesn't preserve the executable bit on all
      // platforms, so chmod it explicitly.
      await copyFile(musterdBin, daemon.embeddedBinPath);
      await chmod(daemon.embeddedBinPath, 0o755);
    }
    if (opts.usageTokenContent !== undefined) {
      await writeFile(daemon.usageTokenPath, opts.usageTokenContent, "utf-8");
    }
    if (opts.issueTokenContent !== undefined) {
      await writeFile(daemon.issueTokenPath, opts.issueTokenContent, "utf-8");
    }
    await daemon.spawnAndWait();
    return daemon;
  }

  /** Tail of this run's captured stdout+stderr (plan usage-model-bar E7/INV-4: grepped
   * for the fake usage token to prove it never appears in a log line). */
  get log(): string {
    return this.output;
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
    const args = [
      "-addr",
      `127.0.0.1:${this.port}`,
      "-data-dir",
      this.dataDir,
      "-claude-bin",
      this.claudeBinPath,
      "-tmux-socket",
      this.tmuxSocket,
      "-browse-root",
      this.browseRoot,
      // Plan usage-model-bar REQ-13/INV-4: unconditional on every scratch daemon so no
      // E2E run — this file or any other — can ever fall through to the real Keychain.
      "-usage-token-file",
      this.usageTokenPath,
      // Plan issue-capture REQ-17: all three issue-capture flags are unconditional on
      // every scratch daemon — same discipline as `-usage-token-file` above — so no run
      // can reach the real GitHub API host or execute `gh`.
      "-issue-api-url",
      this.issueApiURL,
      "-issue-token-file",
      this.issueTokenPath,
      "-issue-repo",
      ISSUE_REPO_FIXTURE,
    ];
    // Plan embed-dashboard REQ-7: the embedded-serving fixture omits -web-dist
    // ENTIRELY (not an empty-string flag — R7) so the daemon falls through to its
    // go:embed default; every other run keeps passing the disk override exactly as
    // before.
    if (!this.serveEmbedded) {
      args.push("-web-dist", webDist);
    }
    // Plan m4-reconcile REQ-3: omit the flag entirely to exercise the daemon's own
    // default (`ask`) rather than hardcoding the string here.
    if (this.onExit !== undefined) {
      args.push("-on-exit", this.onExit);
    }
    // Plan usage-model-bar REQ-13: both test seams are opt-in per run.
    if (this.usagePoll !== undefined) {
      args.push("-usage-poll", this.usagePoll);
    }
    if (this.usageApiURL !== undefined) {
      args.push("-usage-api-url", this.usageApiURL);
    }
    const proc = spawn(this.serveEmbedded ? this.embeddedBinPath : musterdBin, args, {
      // Plan embed-dashboard REQ-7: the embedded fixture runs from the scratch data dir
      // itself (an OS tmpdir containing no web/ or internal/ tree) rather than the repo
      // root every other run inherits as its cwd — proving the binary doesn't need a
      // checkout nearby to find its dashboard.
      cwd: this.serveEmbedded ? this.dataDir : undefined,
      // stdin "ignore" (=/dev/null) is never a character device, so every scratch daemon
      // this harness spawns is a non-TTY process by construction — REQ-3's "ask behaves
      // as leave under non-TTY stdin" path, not the interactive prompt (which E2E cannot
      // drive: the daemon-side `-on-exit=ask` TTY-prompt path is D21/a Go test's job).
      stdio: ["ignore", "pipe", "pipe"],
    });
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

  /** Kills the process, kills this run's private tmux server, closes this run's own
   * issue-capture deny stub (if started), removes the temp data dir. */
  async teardown(): Promise<void> {
    await this.kill();
    try {
      await execFileAsync("tmux", ["-S", this.tmuxSocket, "kill-server"]);
    } catch {
      // No server was ever started on this socket (no session launched) — fine.
    }
    if (this.denyStubServer) {
      const server = this.denyStubServer;
      this.denyStubServer = null;
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
    await rm(this.dataDir, { recursive: true, force: true });
  }

  /** Kills one tmux window by its recorded `tmuxTarget` (E9/E12's explicit-death control). */
  async killTmuxWindow(tmuxTarget: string): Promise<void> {
    await execFileAsync("tmux", ["-S", this.tmuxSocket, "kill-window", "-t", tmuxTarget]);
  }

  /**
   * Plan m4-reconcile REQ-2's oracle: every tmux session name live on this run's socket
   * (`tmux ls -F '#{session_name}'`), used to assert reconcile never adopts a row for a
   * `muster-*` pane it doesn't already know, and to confirm `-on-exit=kill`/End actually
   * removed a named session. Returns `[]` if the tmux server on this socket hasn't
   * started yet, rather than throwing (mirrors `totalAttachedClients`).
   */
  async tmuxSessions(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "-S",
        this.tmuxSocket,
        "list-sessions",
        "-F",
        "#{session_name}",
      ]);
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Plan m4-reconcile REQ-2's "unknown panes are reported, never adopted" fixture: creates
   * a tmux session on this run's socket that the daemon never launched — the exact shape
   * reconcile must log-and-skip. Named by the caller so tests can use a `muster-<n>` name
   * with no corresponding row.
   */
  async createForeignTmuxSession(name: string): Promise<void> {
    await execFileAsync("tmux", ["-S", this.tmuxSocket, "new-session", "-d", "-s", name]);
  }

  /**
   * Plan m4-reconcile E7's resume-argv oracle: `#{pane_start_command}` reports the shell
   * command line tmux actually started the pane with, so a resumed session's pane can be
   * proven to carry `--resume <claudeSessionId>` without ever launching a real `claude`
   * (the harness's stub binary receives the same argv either way). Thin wrapper over
   * `tmuxDisplay` for call-site clarity at the plan's named seam.
   */
  async paneStartCommand(target: string): Promise<string> {
    return await this.tmuxDisplay(target, "#{pane_start_command}");
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

export async function startScratchDaemon(opts: ScratchDaemonOptions = {}): Promise<ScratchDaemon> {
  return await ScratchDaemon.start(opts);
}
