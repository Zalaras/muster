# Web Tests: version-claude-interface

**Plan**: version-claude-interface
**Verdict**: pass

## Summary

Tests created: 34 new/rewritten | Passing: 1072 (full suite) | Failing: 0

Scope: web-impl's implementation itself was already sound (`npx vite build` succeeded on
their side). My job was the three test fixtures/files the plan's Affected Files lists as
web-tests' (W3/W4/W5), which were still shaped for protocol 1's `{pinned, installed,
drift}` and blocked `tsc --noEmit` (the build gate) on two of the three files.

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `protocol.test.ts` | `parses a fully-populated hello` | protocol-2 `claudeCode` shape round-trips | pass |
| `protocol.test.ts` | `asserts PROTOCOL_VERSION is 2` | W3: explicit version assertion | pass |
| `protocol.test.ts` | `parses claudeCode.status %s with a populated installed version` (below/verified/above) | each non-unknown status parses | pass |
| `protocol.test.ts` | `parses claudeCode.status 'unknown' with installed null (INV-1)` | the one wire-legal null-installed case | pass |
| `protocol.test.ts` | `structurally accepts ... a non-unknown status paired with a null installed` | parser only type-checks; INV-1 is a wire contract, not a parser rule (Edge Case 22) | pass |
| `protocol.test.ts` | `rejects a hello whose claudeCode.floor is missing` / `is not a string` | W3: reject missing/malformed floor | pass |
| `protocol.test.ts` | `rejects a hello whose claudeCode.verified is missing` / `is not a string` | W3: reject missing/malformed verified | pass |
| `protocol.test.ts` | `rejects a hello whose claudeCode.status is an unrecognized string` / `is missing` | W3: reject bad status | pass |
| `protocol.test.ts` | `rejects a hello whose claudeCode.installed is a non-string, non-null value` | W3: reject bad installed | pass |
| `protocol.test.ts` | `rejects any other version: %p` (rewritten table `[0,1,3,-1,1.5]`) | pre-existing test bug: table still had literal `2` as "unsupported" after the bump | pass |
| `ws.test.ts` | `hello` fixture (module-level) | updated to protocol 2 / new `claudeCode` shape so the file type-checks | pass |
| `ws.test.ts` | `routes a hello with an unsupported protocolVersion to onProtocolMismatch, not onHello` | bad value changed `2` → `3` (2 is now supported) | pass |
| `masthead.test.ts` | `describeClaudeVersion` × 8 cases (rows 1–6 of the DOM table, including both the daemon-real and defensive null-installed variants of rows 2 and 6) | W5: full six-row table | pass |
| `masthead.test.ts` | `renderClaudeVersion` × 5 cases (no-warning single text node, pre-hello null, above/below warning glyph shape, warning→no-warning self-heal) | W5: DOM rebuild via `replaceChildren`, `role="img"`/`aria-label`/`title` parity, trailing-space text node | pass |

## Decisions

- **`protocol.test.ts` was in scope even though it never failed `tsc`.** Its `validHello`/
  `claudeCode` literals are passed as untyped `unknown` into `parseMessage`, so TypeScript
  never caught the stale `{pinned, installed, drift}` shape — but the assertions were
  wrong against the real parser (protocol 1, old fields). Per the plan's Affected Files >
  Web tests, this file is W3 and squarely mine; fixed it in full rather than only what
  broke a gate.
- **Fixed a pre-existing test bug outside the plan's stated scope**: `protocol.test.ts`'s
  `isSupportedProtocolVersion > rejects any other version` table was `[0, 2, -1, 1.5]` —
  correct when `PROTOCOL_VERSION` was 1, but `2` is now the *valid* version, so the test
  failed after `PROTOCOL_VERSION = 2` (an existing, correct implementation change).
  Distinguished as a test bug, not an implementation bug: `isSupportedProtocolVersion(2)`
  returning `true` is exactly what REQ-4/the protocol contract specify. Replaced the
  literal `2` with `1` and `3` in the table so it still exercises "old version" and "future
  version" without asserting a now-false claim. Evidence: before the fix, `npm test` failed
  with `expected true to be false` on that one case; after, full suite green (1072/1072).
- **`describeClaudeVersion` row 2 and row 6 each got two variants** (the daemon-real one
  the wire actually sends, and the defensive one INV-1 rules out but the parser doesn't
  reject) rather than collapsing to one case each — the plan's own DOM table lists both as
  separate rows with identical output, and Edge Case 22 calls out the defensive path by
  name, so both are asserted independently rather than assumed to be covered by the other.
- **New `FakeVersionNode`/`FakeVersionElement` classes** rather than reusing
  `FakeDomNode`/`FakeDomNodeRich`: `renderClaudeVersion` mixes `document.createTextNode`
  (no other renderer in this file uses text nodes) with one `createElement`d span, and
  needs `setAttribute`/`getAttribute`/`title` but not `insertBefore`/`querySelector`/
  `classList`/`addEventListener`. A dedicated minimal pair keeps the DOM-stand-in tests
  legible about exactly what `renderClaudeVersion` touches (this file already has three
  such stand-ins for the same "no jsdom, only the DOM primitives this renderer needs"
  reason — `FakeDomNode`, `FakeDomNodeRich`, and now this one).
- **No E2E-territory assertions duplicated.** `web/e2e/claude-version.spec.ts` (E1–E6)
  covers the real DOM end-to-end including the daemon's actual hello payload; these unit
  tests cover the pure `describeClaudeVersion` table and the `replaceChildren` child-node
  shape in isolation, which is what a Vitest-vs-Playwright split (docs/conventions.md)
  calls for.

## Implementation Bugs

None found. `protocol.ts`'s `parseClaudeCode` and `masthead.ts`'s `describeClaudeVersion`/
`renderClaudeVersion` match the plan's Protocol Contract and UI Specifications > DOM table
exactly, including the two defensive/edge rows (INV-1's daemon-side guarantee vs. the
client parser's looser structural check).

## Test Run Output

```
$ npx tsc --noEmit
(clean — no output)

$ npm test
 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web
 Test Files  29 passed (29)
      Tests  1072 passed (1072)
   Duration  1.62s

$ npm run build
> tsc --noEmit && vite build
✓ 43 modules transformed.
../internal/webui/assets/index.html                  14.75 kB │ gzip:   3.64 kB
../internal/webui/assets/assets/index-BF5BnZLW.css   29.55 kB │ gzip:   6.09 kB
../internal/webui/assets/assets/index-DNqI_zwJ.js   399.22 kB │ gzip: 103.82 kB │ map: 1,085.33 kB
✓ built in 209ms

$ make web-test   # from repo root
 Test Files  29 passed (29)
      Tests  1072 passed (1072)

$ make contrast   # from repo root
instrument: 43 pairs, 0 failures
dark: 43 pairs, 0 failures
light: 43 pairs, 0 failures
```
