// Fake GitHub Issues API for the issue-capture plan (REQ-8, E2/E3/E4/E8), modelled on
// helpers/usageapi.ts's FakeUsageAPI. musterd's `-issue-api-url` points here instead of
// the real GitHub REST API host (helpers/daemon.ts's `issueApiURL` option), so no E2E
// run ever reaches the real GitHub API or spends a real token against a real repo — the same
// discipline CLAUDE.md's hard rule applies to a real `claude` binary, extended to a real
// `gh`/GitHub call (REQ-17). Records every request (method, path, headers, parsed JSON
// body) so a test can assert both what the daemon composed (INV-2's body-equality check)
// and what it sent to authenticate (the `Authorization: Bearer <token>` header, never
// logged per INV-3).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ISSUE_REPO_FIXTURE } from "./daemon";

export interface RecordedIssueRequest {
  method: string | undefined;
  path: string | undefined;
  authorization: string | undefined;
  accept: string | undefined;
  apiVersion: string | undefined;
  /** Parsed JSON body, or `undefined` if the body was empty/unparseable. Protocol
   * contract: the daemon POSTs `{title, body}` to `{issueAPIURL}/repos/{repo}/issues`. */
  body: { title?: string; body?: string } | undefined;
}

interface PendingResponse {
  status: number;
  body: unknown;
}

/** Default success body for a bare `setResponse(201)` call — REQ-8's response shape
 * (`number`/`html_url`, the only two fields the daemon reads) plus a little of the real
 * API's noise, so a response the daemon ignores still round-trips like the genuine
 * thing. */
function defaultSuccessBody(number: number): unknown {
  return {
    number,
    html_url: `https://github.com/${ISSUE_REPO_FIXTURE}/issues/${number}`,
    title: "fake issue",
    id: 900000 + number,
  };
}

/**
 * A fake GitHub Issues API. Every request (regardless of path) is recorded and answered
 * with the currently configured status/body — tests set the response before triggering
 * the daemon's POST, then read `lastRequest`/`requests` to assert on what was sent.
 */
export class FakeGitHubAPI {
  private readonly server: Server;
  port = 0;
  requests: RecordedIssueRequest[] = [];
  private response: PendingResponse = { status: 201, body: undefined };
  private nextNumber = 1;
  private held = false;
  private pendingResponses: ServerResponse[] = [];

  private constructor(server: Server) {
    this.server = server;
  }

  static async start(): Promise<FakeGitHubAPI> {
    return await new Promise((resolvePromise, reject) => {
      const server = createServer();
      const api = new FakeGitHubAPI(server);
      server.on("request", (req, res) => api.handle(req, res));
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          api.port = address.port;
          resolvePromise(api);
        } else {
          reject(new Error("FakeGitHubAPI could not bind a port"));
        }
      });
    });
  }

  get baseURL(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      let parsed: { title?: string; body?: string } | undefined;
      try {
        parsed = raw.length > 0 ? (JSON.parse(raw) as { title?: string; body?: string }) : undefined;
      } catch {
        parsed = undefined;
      }
      this.requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        accept: req.headers.accept,
        apiVersion: req.headers["x-github-api-version"] as string | undefined,
        body: parsed,
      });
      if (this.held) {
        this.pendingResponses.push(res);
        return;
      }
      this.respond(res);
    });
  }

  private respond(res: ServerResponse): void {
    const usingDefault = this.response.status === 201 && this.response.body === undefined;
    const body = usingDefault ? defaultSuccessBody(this.nextNumber) : this.response.body;
    if (usingDefault) this.nextNumber += 1;
    res.writeHead(this.response.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  /** Sets the status/body every subsequent request receives. Pass an explicit `body`
   * (e.g. `{ number: 14, html_url: "https://github.com/…/issues/14" }`) to pin the
   * values E3's success-panel assertion checks; omit `body` on a 201 to auto-increment a
   * default one. For an error status, `body` should carry GitHub's own `message` field
   * (REQ-8's `502 issue_post_failed` message composition reads it). */
  setResponse(status: number, body?: unknown): void {
    this.response = { status, body };
  }

  /** Holds every incoming request open (no response sent) until `release()` — used to
   * observe Submit's in-flight-disabled window deterministically (REQ-19/edge case 12)
   * instead of racing a fast fake response, mirroring `FakeUsageAPI.hold()`. */
  hold(): void {
    this.held = true;
  }

  /** Releases every currently-held request (using the response configured at release
   * time) and stops holding future ones. */
  release(): void {
    this.held = false;
    const waiting = this.pendingResponses;
    this.pendingResponses = [];
    for (const res of waiting) this.respond(res);
  }

  get lastRequest(): RecordedIssueRequest | undefined {
    return this.requests.at(-1);
  }

  /** Releases any still-held requests (so client sockets don't linger) and closes the
   * server. */
  async stop(): Promise<void> {
    this.release();
    await new Promise<void>((resolvePromise) => this.server.close(() => resolvePromise()));
  }
}

/** A distinctive, fixed (never random) fake bearer token — mirrors usage-model-bar's
 * `FAKE_TOKEN` pattern so INV-3's "never in a log line" grep has something unambiguous
 * to look for. */
export const FAKE_GH_TOKEN = "MUSTER-E2E-FAKE-GH-TOKEN-7c31ae";

/**
 * `-issue-token-file` content (REQ-14: the file's TRIMMED contents are the bearer token
 * — plain text, unlike `-usage-token-file`'s JSON). The trailing newline exercises the
 * daemon's trim, matching how a real `printf`/editor-saved file would look.
 */
export function issueTokenFileContent(token: string = FAKE_GH_TOKEN): string {
  return `${token}\n`;
}
