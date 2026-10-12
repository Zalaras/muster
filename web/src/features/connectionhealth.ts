import type { ConnectionStatus } from "../app";
import type { ConnectionHealthDescription } from "../render/masthead";

const CONNECTED: ConnectionHealthDescription = {
  health: "ok",
  word: "connected",
  title: "Connected to musterd",
};
const CONNECTING: ConnectionHealthDescription = {
  health: "pending",
  word: "connecting…",
  title: "Connecting to musterd…",
};
const UPDATING: ConnectionHealthDescription = {
  health: "pending",
  word: "reconnecting…",
  title: "Restarting musterd for an update…",
};
const DOWN: ConnectionHealthDescription = {
  health: "down",
  word: "reconnecting…",
  title: "musterd unreachable — reconnecting…",
};

export function describeConnectionHealth(
  status: ConnectionStatus,
  override: { neutral: boolean } | null,
): ConnectionHealthDescription {
  if (status === "connected") return CONNECTED;
  if (status === "connecting") return CONNECTING;
  return override !== null && !override.neutral ? UPDATING : DOWN;
}
