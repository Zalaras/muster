// Fake `GET /api/oauth/usage` endpoint for usage-model-bar (E2E test
// seam): musterd's `-usage-api-url` points here instead of https://api.anthropic.com, so
// no E2E run ever calls the real subscription endpoint. Response shapes synthesized here
// must stay capture-faithful to docs/history/spikes/canary-fields.md's "GET /api/oauth/usage measured
// live 2026-08-30" entry — the only measurement of this wire, taken against the developer's own
// token — never invented.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface FakeUsageWindow {
  displayName: string;
  /** Integer percent, matching the measured `percent` field (canary-fields.md: "percent
   * (int)"). */
  percent: number;
  /** RFC3339 string, with fractional seconds and an offset — the measured `resets_at`
   * form (e.g. `"2026-09-01T13:59:59.522599+00:00"`), not epoch seconds (the decoder accepts
   * either on decode, but this fixture exercises the shape Claude Code actually sends). */
  resetsAt: string;
}

/** A top-level `five_hour` / `seven_day` window of the response: `utilization` is the
 * measured percent-scale float, `resetsAt` the measured RFC3339 string with microseconds
 * and an offset (kb:fact/usage-api-oauth-shape). */
export interface FakeUsageBucket {
  utilization: number;
  resetsAt: string;
}

export interface FakeUsageBuckets {
  /** Omitted: the capture's own `{utilization: 7.0, resets_at: 2026-08-30…}` (a reset long
   * past, so the daemon refuses it). `null`: the window
   * is JSON null, which the capture shows for `seven_day_opus` and the like. */
  fiveHour?: FakeUsageBucket | null;
  sevenDay?: FakeUsageBucket | null;
}

const MEASURED_PAST_BUCKET: FakeUsageBucket = {
  utilization: 7.0,
  resetsAt: "2026-08-30T13:39:59.522275+00:00",
};

function bucketBody(bucket: FakeUsageBucket | null | undefined): unknown {
  if (bucket === null) return null;
  const b = bucket ?? MEASURED_PAST_BUCKET;
  return { utilization: b.utilization, resets_at: b.resetsAt };
}

/** A reset far in the future, in the measured string form — never "past" against any
 * real clock, so a test that is not about resets never trips the
 * past-reset refusal. */
export const FAR_FUTURE_RESETS_AT = "2099-01-01T00:00:00.000000+00:00";

/**
 * Builds a capture-faithful 200 body for `GET /api/oauth/usage`
 * (docs/history/spikes/canary-fields.md): top-level `five_hour`/`seven_day` windows
 * (settable through `buckets`; the default is the capture's past-reset pair), one
 * `weekly_scoped` `limits[]` entry per window with the full measured field set
 * (`kind`/`group`/`percent`/`severity`/`resets_at`/`scope`/`is_active`), and one
 * feature-flag-noise top-level key (`amber_ladder`, named in the capture) to exercise
 * "unknown keys ignored" the way the real response actually looks — never an
 * invented shape.
 */
export function weeklyScopedUsageResponse(
  windows: FakeUsageWindow[],
  buckets: FakeUsageBuckets = {},
): unknown {
  return {
    five_hour: bucketBody(buckets.fiveHour),
    seven_day: bucketBody(buckets.sevenDay),
    seven_day_opus: null,
    seven_day_sonnet: null,
    seven_day_oauth_apps: null,
    extra_usage: null,
    amber_ladder: false,
    limits: windows.map((w) => ({
      kind: "weekly_scoped",
      group: "default",
      percent: w.percent,
      severity: "normal",
      resets_at: w.resetsAt,
      scope: { model: { id: null, display_name: w.displayName }, surface: null },
      is_active: true,
    })),
  };
}

/**
 * The `-usage-token-file` content `internal/claudecode`'s token reader parses
 * (Implementation Notes: `struct{ ClaudeAiOauth struct{ AccessToken string } }`, JSON key
 * `claudeAiOauth.accessToken` — the same shape the real Keychain item stores).
 */
export function credentialsFileContent(token: string): string {
  return JSON.stringify({ claudeAiOauth: { accessToken: token } });
}

interface PendingResponse {
  status: number;
  body: unknown;
}

/**
 * A fake `/api/oauth/usage` HTTP server. Settable response/status, a request counter for
 * cadence/coalescing assertions, and a hold/release gate so a test can
 * observe the pre-first-fetch state deterministically instead of racing a poll
 * interval.
 */
export class FakeUsageAPI {
  private readonly server: Server;
  port = 0;
  requestCount = 0;
  /** `Date.now()` at each request's arrival, in order — lets a test assert a call was
   * made after an instant, not merely that one was made. */
  readonly requestTimes: number[] = [];
  private response: PendingResponse = { status: 200, body: { limits: [] } };
  private held = false;
  private pendingResponses: ServerResponse[] = [];

  private constructor(server: Server) {
    this.server = server;
  }

  static async start(): Promise<FakeUsageAPI> {
    return await new Promise((resolvePromise, reject) => {
      const server = createServer();
      const api = new FakeUsageAPI(server);
      server.on("request", (req, res) => api.handle(req, res));
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          api.port = address.port;
          resolvePromise(api);
        } else {
          reject(new Error("FakeUsageAPI could not bind a port"));
        }
      });
    });
  }

  get baseURL(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // Only /api/oauth/usage is meaningful; anything else 404s harmlessly rather
    // than hanging a request this fixture was never meant to receive.
    if (req.url !== "/api/oauth/usage") {
      res.writeHead(404).end();
      return;
    }
    this.requestCount += 1;
    this.requestTimes.push(Date.now());
    if (this.held) {
      this.pendingResponses.push(res);
      return;
    }
    this.respond(res);
  }

  private respond(res: ServerResponse): void {
    const body = JSON.stringify(this.response.body ?? {});
    res.writeHead(this.response.status, { "Content-Type": "application/json" });
    res.end(body);
  }

  /** Sets the response every subsequent (unheld) request receives. */
  setResponse(status: number, body: unknown): void {
    this.response = { status, body };
  }

  /** Holds every incoming request open (no response sent) until `release()` — used to
   * observe the pre-first-fetch "unknown" state deterministically and to make a
   * refresh's `aria-busy` window observable instead of racing a fast response. */
  hold(): void {
    this.held = true;
  }

  /** Releases every currently-held request (using the response set at release time) and
   * stops holding future ones. */
  release(): void {
    this.held = false;
    const waiting = this.pendingResponses;
    this.pendingResponses = [];
    for (const res of waiting) this.respond(res);
  }

  /** Releases any still-held requests (so client sockets don't linger) and closes the
   * server. */
  async stop(): Promise<void> {
    this.release();
    await new Promise<void>((resolvePromise) => this.server.close(() => resolvePromise()));
  }
}
