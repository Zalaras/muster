# Web Tests: issue-capture

**Plan**: issue-capture
**Verdict**: pass

## Summary

Tests created: 34 | Passing: 34 | Failing: 0

(Full suite after this change: 606 passing across 21 files — no pre-existing test broke.)

## Tests

| File | Test Name | What It Tests | Status |
|------|-----------|---------------|--------|
| `render/issue.test.ts` | returns the empty string for an empty note | `composeNoteSection` W4 base case | pass |
| `render/issue.test.ts` | returns the empty string for a whitespace-only note (spaces, tabs, newlines) | W4 whitespace-only rule | pass |
| `render/issue.test.ts` | returns the empty string for a note that is CRLF-only whitespace | W4 whitespace-only + CRLF | pass |
| `render/issue.test.ts` | wraps a single-line note in the '## What happened' section | W4 composition format | pass |
| `render/issue.test.ts` | trims leading and trailing whitespace from the note before composing | W4 trim rule | pass |
| `render/issue.test.ts` | preserves internal newlines in a multi-line note | W4 multi-line | pass |
| `render/issue.test.ts` | normalises CRLF to LF throughout the note | W4 CRLF rule | pass |
| `render/issue.test.ts` | normalises a lone CRLF at the note's own end distinctly from the trim | W4 trim+CRLF interaction | pass |
| `render/issue.test.ts` | normalises mixed CRLF and bare LF line endings in the same note | W4 CRLF rule, mixed input | pass |
| `render/issue.test.ts` | passes through backticks, a fence, a pipe and `</details>` verbatim | Edge Case 10/11, INV-2 precondition | pass |
| `render/issue.test.ts` | a single non-whitespace character is enough to produce the section | W4 boundary | pass |
| `render/issue.test.ts` | enables the button when connected | `renderIssueButton` REQ-13 | pass |
| `render/issue.test.ts` | disables the button when not connected | `renderIssueButton` REQ-13 | pass |
| `api.test.ts` | posts sessionId and decodes a 201 response, renaming `capturedAt`→`takenAt` | `captureIssueSnapshot` protocol decode, REQ-3 | pass |
| `api.test.ts` | sends a literal null sessionId for dashboard scope, not an omitted field | `captureIssueSnapshot` request shape, REQ-2 | pass |
| `api.test.ts` | decodes a 400 invalid_request error envelope | `captureIssueSnapshot` error decode | pass |
| `api.test.ts` | decodes a 404 unknown_session error envelope | `captureIssueSnapshot` error decode | pass |
| `api.test.ts` | decodes a 404 not_found error envelope (feature disabled) | `captureIssueSnapshot` Edge Case 14 | pass |
| `api.test.ts` | decodes a 401 unauthorized error envelope | `captureIssueSnapshot` auth | pass |
| `api.test.ts` | falls back to a generic error when the success body is missing captureId | `captureIssueSnapshot` malformed decode | pass |
| `api.test.ts` | falls back to a generic error when snapshot is not an object | `captureIssueSnapshot` malformed decode | pass |
| `api.test.ts` | falls back to a generic error when snapshotMarkdown is missing | `captureIssueSnapshot` malformed decode | pass |
| `api.test.ts` | preserves the snapshot object verbatim as an opaque record | `captureIssueSnapshot` opacity (W3 precondition) | pass |
| `api.test.ts` | posts captureId/title/note and decodes a 201 FiledIssue response | `fileIssue` protocol decode, REQ-3/REQ-9 | pass |
| `api.test.ts` | sends the raw (untrimmed) note field | `fileIssue` request shape | pass |
| `api.test.ts` | decodes a 400 invalid_request error envelope | `fileIssue` error decode | pass |
| `api.test.ts` | decodes a 404 not_found error envelope | `fileIssue` Edge Case 14 | pass |
| `api.test.ts` | decodes a 409 capture_expired error envelope | `fileIssue` REQ-15/D10/Edge Case 2 | pass |
| `api.test.ts` | decodes a 502 issue_auth_failed error envelope | `fileIssue` Edge Cases 4/5 | pass |
| `api.test.ts` | decodes a 502 issue_post_failed error envelope | `fileIssue` Edge Cases 6-9 | pass |
| `api.test.ts` | never surfaces a bearer token in a decoded error message | `fileIssue` INV-3 client-side half | pass |
| `api.test.ts` | falls back to a generic error when the success body is not a valid FiledIssue | `fileIssue` malformed decode | pass |
| `api.test.ts` | never throws when the response body isn't valid JSON at all | `fileIssue` decode robustness | pass |
| `api.test.ts` (network-error sweep) | `captureIssueSnapshot`/`fileIssue`: a rejected fetch resolves to `network_error` | REQ-13 network failure mode | pass |

## Test Run Output

```
$ npx tsc --noEmit
(clean, no output)

$ npm test
 Test Files  21 passed (21)
      Tests  606 passed (606)
   Duration  1.09s

$ npm run build
> tsc --noEmit && vite build
✓ 34 modules transformed.
✓ built in 204ms
```

## Scope Decisions

- **`composeNoteSection` and `renderIssueButton`** (both exported, pure) get full
  coverage — these are exactly the "logic" docs/conventions.md assigns to Vitest, and
  `composeNoteSection` is W4's named acceptance criterion.
- **`api.ts`'s `captureIssueSnapshot`/`fileIssue`** get the same protocol-decoding
  treatment as every other endpoint in `api.test.ts` (success decode, every documented
  error code, malformed-body fallback, network-error short-circuit) — matching the
  existing file's established pattern rather than inventing a new one.
- **`initIssueDialog` was deliberately left untested here.** Its exported surface is a
  single `IssueDialogController` (`open`/`closeAll`); everything else — session-select
  preselection, the capture-request staleness guard, submit-enable/disable derivation,
  live preview composition, success/error/daemon-down state transitions — lives inside
  one closure wired directly to `<dialog>`/`<select>`/`<form>` DOM elements and
  `showModal()`/`close()`/event-listener calls. That is interaction, not logic
  (docs/conventions.md's split), and `plans/issue-capture/test-specs.md`'s 10
  `issue-capture.spec.ts` E2E tests already exercise every one of those state
  transitions against the real DOM and a real daemon (live preview updates including a
  mid-flow assertion before Submit, Submit disable/re-enable across capture-in-flight
  and POST-in-flight, session-select re-capture, success/error panels, daemon-down
  close/re-enable). Building a parallel `FakeDomNode`-style harness (the pattern
  `render/masthead.test.ts` uses for `renderModelWeek`) to re-derive the same
  transitions here would be exactly the "DOM-simulation test suite" this agent's brief
  says not to build, for coverage the E2E suite already owns byte-for-byte (INV-2's
  preview==payload assertion is stronger evidence than any unit-level rebuild of
  `composePreview` could offer, since it round-trips through the real daemon). Not
  flagged as an implementation gap — `render/issue.ts`'s own header comment says the
  module is "DOM + wiring only," which is the intended shape.
- `formatCaptureTime` and `formatErrorDetail` are small private (non-exported)
  formatting helpers inside `initIssueDialog`'s module scope. They're simple enough
  (one-line date formatting, one string template) that extracting them just to unit-test
  in isolation would add an export with no other caller; their observable behavior
  (`captured HH:MM:SSZ`, `<code> — <message>`) is covered by the E2E suite's
  `#issue-captured-at` and `#issue-error-detail` assertions. Not an implementation bug.
