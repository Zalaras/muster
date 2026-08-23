# Web Tests: M3 — Gauges

**Plan**: m3-gauges
**Verdict**: pass

## Summary

Tests created/modified: 54 new test cases (across 2 new files + 4 modified files) + 1 obsolete
assertion updated (sanctioned by the plan) | Passing: 326/326 | Failing: 0

**Updated by Fix Attempt 1** (see that section below): 6 `card.test.ts` assertions removed
(Major 1 — `contextText` deleted from the implementation) and 2 tests added to
`render/masthead.test.ts` (Major 2 — order regression guard), net current total
**Passing: 322/322 | Failing: 0**.

`npx tsc --noEmit`, `npm test`, and `npm run build` all exit 0. The W3 automated check
(`! rg -n "rate_limits|used_percentage|context_window|total_input_tokens|session_name" web/src`)
also passes — one of my own test comments initially tripped it (see Notes).

## Tests

| File | Test Name (representative) | What It Tests | Status |
|------|-----------|---------------|--------|
| `sessions/context.test.ts` (new) | "is unknown for the all-null fresh-launch shape" | `buildContextRowViewModel` honesty rule 1 (INV-3) | pass |
| `sessions/context.test.ts` | "is unknown for the measured pre-first-response shape (null pct alongside a zero token count)" | REQ-2's measured absence from `spikes/canary-fields.md` | pass |
| `sessions/context.test.ts` | "is unknown (defensive, protocol INV-2) when usedPct is null but totalInputTokens is populated" | INV-2 all-or-nothing defensiveness at the derivation boundary | pass |
| `sessions/context.test.ts` | "rounds usedPct for display and formats totalInputTokens compactly" | known-context derivation | pass |
| `sessions/context.test.ts` | "is not hot at 59.6% even though it would round to 60% on screen" | W9 threshold uses raw, not rounded, pct | pass |
| `sessions/context.test.ts` | "is hot at exactly 60%" / "is not hot at 59%" | W9 boundary at exactly ≥60 | pass |
| `render/context.test.ts` (new) | "renders 'ctx unknown' with the 'unk' modifier class... for a rail/strip card ('r3')" | `renderContextRow` unknown-branch DOM output | pass |
| `render/context.test.ts` | "renders the same shape for a tile header ('ctxinfo')" | REQ-13 "one derivation, two renderers" | pass |
| `render/context.test.ts` | "treats a mixed null/non-null context... as unknown — never half-renders" | INV-2 defensiveness at the render boundary | pass |
| `sessions/format.test.ts` | `formatTokens` boundary table (`999`→"999", `1000`→"1k", `999999`→"1000k", `1000000`→"1.0M") | W5 token formatting boundaries | pass |
| `sessions/format.test.ts` | `formatResets` same-day / different-day / past-reset / midnight-boundary cases | W6/REQ-14 reset-time formatting, edge case 10 | pass |
| `sessions/format.test.ts` | `GAUGE_WARN_THRESHOLD` is 60 | design-system §5 constant | pass |
| `protocol.test.ts` | "parses a fully-populated usage message including the M3 model field" | `parseUsageMessage`/`parseMessage("usage")` | pass |
| `protocol.test.ts` | "parses the boot/no-hydration state: null buckets, no model key at all" + explicit `"model" in usage` check | REQ-7 no-hydration; optional-vs-null `model` key distinction | pass |
| `protocol.test.ts` | "parses an explicit usage.model: null the same as an absent key" | additive-evolution round-trip | pass |
| `protocol.test.ts` | "rejects a usage.model missing displayName" / "...that isn't an object" | malformed model rejection | pass |
| `protocol.test.ts` | "parses a snapshot whose usage carries the M3 model field" | `Snapshot.usage` reuses `parseUsage` | pass |
| `ws.test.ts` | "routes a usage message to onUsage with the bare usage object, not onSnapshot" | `WsClient.dispatch` routing | pass |
| `ws.test.ts` | "dispatches a usage frame to onUsage" | full socket-lifecycle routing | pass |
| `render/masthead.test.ts` | "touches the element zero times for a null bucket (no track, no resets text)" | `renderUsageTrack` honesty-rule early return (W7) | pass |
| `render/masthead.test.ts` | "shows the element with the model's displayName verbatim when present" / "hides... when model is null/undefined" | `renderUsageModel` (REQ-12) | pass |
| `render/masthead.test.ts` | "re-hides on a known -> null transition (e.g. daemon restart, REQ-7)" | self-healing masthead model readout | pass |
| `sessions/card.test.ts` | *(removed in Fix Attempt 1 — `contextText` deleted from the implementation; coverage lives in `sessions/context.test.ts`)* | — | n/a |
| `render/masthead.test.ts` (Fix Attempt 1) | "orders children lbl, bar, num, resets for a known bucket — bar reads before the number" | Major 2 regression guard: masthead element order | pass |
| `render/masthead.test.ts` (Fix Attempt 1) | "applies the 'warn' modifier at or above the 60% threshold and omits it below" | Major 2 regression guard: warn className split | pass |

Full new/changed test counts by file: `sessions/context.test.ts` 13, `render/context.test.ts` 6,
`sessions/format.test.ts` +7 `it`/`it.each` blocks (19 runtime cases), `protocol.test.ts` +9,
`ws.test.ts` +2, `render/masthead.test.ts` +6, `sessions/card.test.ts` 1 removed + 4 added.

## Sanctioned Test Fix Applied

`web/src/sessions/card.test.ts` (previously lines 112-118, content-located): the M1-era
assertion `expect(vm.contextText).toBe("ctx unknown")` for a session with populated
`usedPct`/`totalInputTokens` was replaced per the team-lead's handoff note and
`web-implementation.md`'s own flagged decision — REQ-13 supersedes this behavior.
`contextText()` now correctly returns `"42% · 1k"`-shaped strings for known context, so
the test now asserts exactly that, plus three new cases (compaction suffix on a known
context, percentage rounding, and a defensive INV-2 mixed-null case).

## Deliberate Scope Decisions (not implementation bugs)

- **No jsdom added.** This Vitest config has no DOM implementation (`typeof document ===
  "undefined"` inside a running test, confirmed directly). `renderContextRow`'s known
  branch and `renderUsageTrack`'s known-bucket branch both call `document.createElement`
  and can't run here without adding a new devDependency — an infra change outside my
  remit and inconsistent with this repo's own established pattern (`render/sessions.test.ts`
  and `render/tiles.test.ts` already defer their template-cloning/DOM-construction branches
  to Playwright with the same rationale, predating M3). I covered every DOM-construction-free
  path directly (empty/unknown branches, hidden/textContent-only functions like
  `renderUsageModel`, the null-bucket early return in `renderUsageTrack`) and left the
  known-branch DOM structure (track markup, `hot`/`warn` classes, byte-for-byte mockup
  shape) to `web/e2e/gauges.spec.ts` (E1, E3-E5, E12), which was already authored against
  the real DOM before I started. The pure logic underlying those branches (`hot` threshold,
  pct rounding, token formatting) is fully covered without any DOM in
  `sessions/context.test.ts` and `sessions/format.test.ts`.
- Fixed one pre-existing test's stale framing in `protocol.test.ts`: "ignores an unknown
  message type" used to pass `{ type: "usage", usage: {} }` as its unknown-type example.
  Since `"usage"` is now a real, known message type (M3), that fixture no longer exercises
  the "unknown type" fallthrough branch it claims to (it still returns `null`, but via
  `parseUsageMessage` rejecting a malformed payload, not via the `default:` case) — I swapped
  it for a fixture with a genuinely unknown type (`"futureMessageType"`) so the coverage
  claim stays true, and added the dedicated `parseMessage — usage` describe block for real
  `"usage"` coverage.
- One of my own comments in `sessions/context.test.ts` initially used the literal snake_case
  tokens `context_window`/`used_percentage`/`total_input_tokens` (quoting
  `spikes/canary-fields.md`'s section heading and field names), which tripped the W3
  automated check (`web/src` must contain none of those tokens, unquoted). Reworded the
  comment to describe the same fact without the literal tokens; re-ran the grep to confirm
  it now passes.

## Test Run Output

```
> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  15 passed (15)
      Tests  326 passed (326)
   Start at  19:58:10
   Duration  756ms
```

```
$ npx tsc --noEmit
(exit 0, no output)

$ npm run build
> tsc --noEmit && vite build
vite v8.2.1 building client environment for production...
✓ 25 modules transformed.
dist/index.html                   6.60 kB │ gzip:  1.72 kB
dist/assets/index-Dg2Ddqcg.css   16.88 kB │ gzip:  3.80 kB
dist/assets/index-DTBP7bSU.js   360.52 kB │ gzip: 92.77 kB │ map: 814.04 kB
✓ built in 154ms

$ rg -n "rate_limits|used_percentage|context_window|total_input_tokens|session_name" web/src
(no output, exit 1 — W3 passes)
```

## Fix Attempt 1

**Failures addressed**: review.md cycle-1 Major 1, Major 2 (both tagged `[web-tests]`).

**Major 1 — removed the six orphaned `card.test.ts` assertions.** `web-implementation.md`'s
Fix Attempt 1 deleted `contextText()`/`CardViewModel.contextText` from `web/src/sessions/card.ts`
(the DOM never consumed it; `render/sessions.ts`/`render/tiles.ts` both derive the context row
independently via `sessions/context.ts` + `render/context.ts`). Deleted the whole
`describe("buildCardViewModel — context row …")` block from `card.test.ts` (6 `it`s reading
`vm.contextText`, previously lines 95-143 by content) rather than leaving orphaned/failing
assertions. No replacement tests were added here: the same derivation is already exhaustively
covered by `sessions/context.test.ts` (`buildContextRowViewModel` — honesty rule, known-context
rounding/formatting, INV-2 defensiveness, the >=60 hot threshold), confirmed by reading that file
before touching `card.test.ts`. `tsc --noEmit` before the fix showed exactly 6 `TS2339` errors
on this file; after deletion, zero.

**Major 2 — upgraded the fake to a real (minimal) DOM element instead of deferring to E2E.**
`web/src/render/masthead.ts`'s `renderBucket` (added in web-impl's Major-2 fix) now
unconditionally calls `document.createElement`, even for a null bucket — it builds a permanent
`.lbl`/`.num` span pair every render pass. That turned the whole `renderUsage — honesty rule`
block's `fakeElement()` (`{ textContent: "" }`) fixture into a guaranteed
`ReferenceError: document is not defined` for all 4 tests, confirmed by running
`npx vitest run src/render/masthead.test.ts` on the unmodified tree first.

I considered deferring to Playwright (the repo's established pattern for DOM-construction
branches — `render/sessions.test.ts`, `render/tiles.test.ts`, and this same file's
`renderUsageTrack` known-bucket branch already do this) but checked `web/e2e/gauges.spec.ts`
first per the handoff instruction: E1/E2/E11/E12 cover both-unknown, one-known/one-unknown,
restart-to-unknown, and the >=60% warn/hot threshold, but **no E2E test asserts the 0%/99.6%->100%
masthead rounding boundary** that one of the four tests exists specifically to pin. Deferring
would have silently dropped that boundary case rather than just relocating it, so instead I
added a minimal fake DOM (`FakeDomNode` in `masthead.test.ts`) — `createElement`, `appendChild`,
`insertBefore`, `replaceChildren`, `querySelector`, and a `textContent` getter that reflects
appended children — and stubbed `globalThis.document` with it via `vi.stubGlobal`/
`vi.unstubAllGlobals` scoped to just the two `describe` blocks that need it. This is not jsdom
(no new dependency, no config change) — just enough of `Element`/`Document` for these two pure
renderers' actual calls to execute.

While building the fake I found my own first draft had two test bugs (not implementation bugs),
both fixed before this was reported as passing:
- I initially asserted `el.textContent` as `"5h unknown"`/`"5h 61%"` (with a space). Running
  against the real DOM shape showed `"5hunknown"`/`"5h61%"` — no space — because `renderBucket`
  builds `.lbl`/`.num` as separate spans with the gap supplied by CSS, not a text character.
  `web-implementation.md`'s Fix Attempt 1 says this explicitly ("none of those assertions require
  a literal space between the label and the number") and verified it live against the real DOM.
  Rewrote the assertions to check `.lbl`/`.num` textContent individually rather than depend on
  the concatenation shape.
- My new order-regression test asserted `childTags()` (element `tagName`), but every node
  `renderBucket`/`renderUsageTrack` creates is a `<span>` (only the track fill is `<i>`), so
  `tagName` can't distinguish "lbl" from "bar" from "num". Renamed to `childClasses()` (asserts
  `className`), which is what actually encodes position/identity here.

Also added a new `describe` block (`renderUsage + renderUsageTrack — element order matches the
reference render`) as a regression guard for the exact defect Major 2 reported: one test asserts
the child order is `lbl, bar warn, num, resets` (via `childClasses()`) plus `.lbl`/`.num`/`.resets`
text content using the real `formatResets` for the expected suffix; a second asserts the `bar`
vs. `bar warn` className split at the 60% threshold. Not required by the fix instructions, but
directly guards against the order/threshold regression silently reappearing, since a plain
`textContent` string doesn't distinguish "bar before num" from "bar after num" once there's no
space to key off of.

**Files changed**: `web/src/sessions/card.test.ts` (6 tests removed, 0 added — coverage already
lives in `sessions/context.test.ts`), `web/src/render/masthead.test.ts` (4 existing tests fixed
in place, 2 tests added: `FakeDomNode`/`fakeDomElement` helper added, `formatResets` imported for
one assertion).

**Gate**: `make web-test` -> 322 passed (322), `make web-build` -> exit 0 (`tsc --noEmit && vite
build`, "built in 154ms"). W3 grep re-run clean.

### Fix Attempt 1 — Test Run Output

```
$ make web-test
cd web && npm test

> muster-web@0.0.0 test
> vitest run

 RUN  v4.1.10 /Users/damian/Documents/code/Projects/muster/web

 Test Files  15 passed (15)
      Tests  322 passed (322)
   Start at  20:35:40
   Duration  727ms

$ make web-build
cd web && npm run build

> muster-web@0.0.0 build
> tsc --noEmit && vite build

vite v8.2.1 building client environment for production...
✓ 25 modules transformed.
dist/index.html                   6.60 kB │ gzip:  1.72 kB
dist/assets/index-DcdddJ2H.css   16.89 kB │ gzip:  3.80 kB
dist/assets/index-BNtAH8lr.js   360.47 kB │ gzip: 92.77 kB │ map: 813.77 kB
✓ built in 154ms
```
