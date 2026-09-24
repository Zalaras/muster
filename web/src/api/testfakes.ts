// Shared `Response` fakes for `web/src/api/*.test.ts`. Every endpoint spec decodes one of
// these four shapes — a JSON body with an `ok` flag, a bare status with an optional JSON
// body, a response whose `.json()` rejects, or a raw-text success body — so this is the one
// copy the split per-endpoint spec files import instead of each redeclaring it.
export function fakeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

export function fakeResponseThatThrows(): Response {
  return { ok: true, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
}

export function fakeStatusResponse(status: number, body?: unknown): Response {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  } as unknown as Response;
}

export function fakeTextResponse(text: string): Response {
  return { ok: true, text: () => Promise.resolve(text) } as unknown as Response;
}
