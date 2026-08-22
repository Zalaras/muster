import { expect, test } from "@playwright/test";
import { countAllEvents, queryEvents } from "./helpers/db";
import { type ScratchDaemon, startScratchDaemon } from "./helpers/daemon";
import {
  envelopedSessionStart,
  envelopedStatusLinePreFirstResponse,
  malformedJsonBody,
  rawHookMissingSessionId,
  rawStop,
} from "./helpers/payloads";

// REQ-10 through REQ-13 — both ingest endpoints, seq assignment, and the drop paths.
// Each test uses its own claude_session_id so tests sharing one scratch daemon never
// depend on each other's side effects or on execution order.

let daemon: ScratchDaemon;

test.beforeAll(async () => {
  daemon = await startScratchDaemon();
});

test.afterAll(async () => {
  await daemon.teardown();
});

test("persists an enveloped SessionStart then a raw Stop for the same session as seq 1 and 2", async ({
  request,
}) => {
  const sessionId = "e2e-s1";

  const startRes = await request.post(daemon.ingestURL("hook"), {
    data: envelopedSessionStart(sessionId),
  });
  expect(startRes.status()).toBe(200);

  const stopRes = await request.post(daemon.ingestURL("hook"), {
    data: rawStop(sessionId),
  });
  expect(stopRes.status()).toBe(200);

  await expect
    .poll(async () => (await queryEvents(daemon.dbPath, sessionId)).length, {
      message: "waiting for the async ingest worker to persist both events",
    })
    .toBe(2);

  const rows = await queryEvents(daemon.dbPath, sessionId);
  const [first, second] = rows;
  if (!first || !second) throw new Error(`expected 2 persisted rows, got ${rows.length}`);

  expect(first.seq).toBe(1);
  expect(first.type).toBe("SessionStart");
  expect(first.muster_session).toBe(1);
  expect(first.tmux_pane).toBe("%12");

  expect(second.seq).toBe(2);
  expect(second.type).toBe("Stop");
  // The Stop POST was raw (no envelope) — those columns must be NULL on this row.
  expect(second.muster_session).toBeNull();
  expect(second.tmux_pane).toBeNull();
});

test("persists a status-line POST as an event with type status_line", async ({ request }) => {
  const sessionId = "e2e-s2";

  const res = await request.post(daemon.ingestURL("status"), {
    data: envelopedStatusLinePreFirstResponse(sessionId),
  });
  expect(res.status()).toBe(200);

  await expect
    .poll(async () => (await queryEvents(daemon.dbPath, sessionId)).length)
    .toBe(1);

  const rows = await queryEvents(daemon.dbPath, sessionId);
  const [row] = rows;
  if (!row) throw new Error("expected 1 persisted row");
  expect(row.type).toBe("status_line");
});

test("rejects a wrong ingest token with 404 and persists nothing", async ({ request }) => {
  const sessionId = "e2e-s3";

  const res = await request.post(`${daemon.baseURL}/ingest/not-the-real-token/hook`, {
    data: envelopedSessionStart(sessionId),
  });
  expect(res.status()).toBe(404);

  // Prove absence rather than presence — wait past any plausible async persistence.
  await new Promise((r) => setTimeout(r, 300));
  expect(await queryEvents(daemon.dbPath, sessionId)).toHaveLength(0);
});

test("returns 200 for a malformed JSON hook body and persists nothing", async ({ request }) => {
  const before = await countAllEvents(daemon.dbPath);

  const res = await request.post(daemon.ingestURL("hook"), {
    data: malformedJsonBody,
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(200);

  await new Promise((r) => setTimeout(r, 300));
  expect(await countAllEvents(daemon.dbPath)).toBe(before);
});

test("returns 200 for valid JSON with no usable session_id and persists nothing", async ({ request }) => {
  const before = await countAllEvents(daemon.dbPath);

  const res = await request.post(daemon.ingestURL("hook"), {
    data: rawHookMissingSessionId(),
  });
  expect(res.status()).toBe(200);

  await new Promise((r) => setTimeout(r, 300));
  expect(await countAllEvents(daemon.dbPath)).toBe(before);
});
