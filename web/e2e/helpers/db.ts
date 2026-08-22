// Read-only sqlite3-CLI oracle for the scratch daemon's `event` table (plan m0-skeleton,
// Protocol Contract: "the E2E ingest oracle queries it read-only via the sqlite3 CLI").
// GET /api/state can't show events until M1, so this is the only way an E2E test can
// observe ingest without becoming a daemon-internals test.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface EventRow {
  id: number;
  claude_session_id: string;
  seq: number;
  type: string;
  prompt_id: string | null;
  tool_use_id: string | null;
  muster_session: number | null;
  tmux_pane: string | null;
  payload: string;
  received_at: string;
}

async function runQuery(dbPath: string, sql: string): Promise<unknown[]> {
  const { stdout } = await execFileAsync("sqlite3", ["-json", "-readonly", dbPath, sql]);
  const trimmed = stdout.trim();
  return trimmed ? (JSON.parse(trimmed) as unknown[]) : [];
}

/** All persisted events for one claude_session_id, ordered by per-session seq. */
export async function queryEvents(dbPath: string, claudeSessionId: string): Promise<EventRow[]> {
  const escaped = claudeSessionId.replace(/'/g, "''");
  const sql = `SELECT id, claude_session_id, seq, type, prompt_id, tool_use_id, muster_session, tmux_pane, payload, received_at FROM event WHERE claude_session_id = '${escaped}' ORDER BY seq;`;
  return (await runQuery(dbPath, sql)) as EventRow[];
}

/** Total row count across every session — used to prove a dropped/rejected post persisted nothing. */
export async function countAllEvents(dbPath: string): Promise<number> {
  const rows = (await runQuery(dbPath, "SELECT COUNT(*) AS n FROM event;")) as Array<{
    n: number;
  }>;
  return rows[0]?.n ?? 0;
}

/** Row count in schema_migrations — used to prove a second startup applies nothing (REQ-9). */
export async function countMigrations(dbPath: string): Promise<number> {
  const rows = (await runQuery(dbPath, "SELECT COUNT(*) AS n FROM schema_migrations;")) as Array<{
    n: number;
  }>;
  return rows[0]?.n ?? 0;
}
