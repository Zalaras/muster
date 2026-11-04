export function parseSessionParam(params: URLSearchParams): number | null {
  const raw = params.get("session");
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
}
