# Web Implementation: version-claude-interface

**Plan**: version-claude-interface
**Mode**: initial

## Changes

| File | Action | What and Why |
|------|--------|--------------|
| `web/src/protocol.ts` | edited | `PROTOCOL_VERSION` 1 → 2; `ClaudeCodeInfo` replaced with `{installed, floor, verified, status}` and new `ClaudeCodeStatus` union; `parseClaudeCode` rewritten to type-check the four new fields and reject an unrecognized `status` string (old `pinned`/`drift` parsing removed) |
| `web/src/render/masthead.ts` | edited | new exported pure `describeClaudeVersion(info)` implementing the UI Specifications > DOM six-row table; `renderClaudeVersion` rewritten to call it and rebuild `#claude-version`'s children via `replaceChildren` (trailing-space text node + `role="img"` glyph when a warning applies, matching `aria-label`/`title`) |
| `web/src/style.css` | edited | added `.version-warn { margin-left: 4px; }` — no colour rule, per REQ-5/design-system §3 (state colour is meaning; this glyph is not state) |
| `docs/design/design-system.md` | edited | REQ-14: new paragraph in §5 Masthead naming `#claude-version` and its warning glyph, stating the glyph carries no state colour |

## Decisions

- `describeClaudeVersion`'s branch order folds two DOM-table rows into one code path:
  `status === "unknown"` and the defensive `installed === null` (non-unknown status) both
  return `{text: "Claude installation unknown", warning: null}` from the same `if`. This
  matches the table exactly (both rows have identical output) and keeps `installed === null`
  from ever reaching the `claude ${info.installed}` template literal.
- Did not add a new `isClaudeCodeStatus` export from `protocol.ts` — kept it as a private
  helper alongside `parseClaudeCode`, matching the existing file's convention (no other
  discriminant-string checker in this file is exported either, e.g. `isSessionState`,
  `isModelScopedError`).
- `web/index.html` needed no change — the plan states the existing `#claude-version` span
  is the surface and stays where it is; confirmed by reading it (still a bare `<span
  id="claude-version" class="claude-version">`).

## Handoff

**Build status**: NOT BUILDING — `npx tsc --noEmit` (and therefore `npm run build` /
`make web-build`) fails with exactly two pre-existing test-file errors, both **outside**
my allowed edits (Constraints: I may only touch a test file to repoint an import path;
these are typed object-literal fixtures using the old wire shape, not import paths):

```
src/render/masthead.test.ts(237,36): error TS2353: Object literal may only specify known properties, and 'pinned' does not exist in type 'ClaudeCodeInfo'.
src/render/masthead.test.ts(244,36): error TS2353: Object literal may only specify known properties, and 'pinned' does not exist in type 'ClaudeCodeInfo'.
src/render/masthead.test.ts(251,36): error TS2353: Object literal may only specify known properties, and 'pinned' does not exist in type 'ClaudeCodeInfo'.
src/ws.test.ts(9,17): error TS2353: Object literal may only specify known properties, and 'pinned' does not exist in type 'ClaudeCodeInfo'.
```

Both files declare an explicit `ClaudeCodeInfo`-typed fixture with the old
`{pinned, installed, drift}` shape (`ws.test.ts:5` `const hello: Hello = {...}`;
`masthead.test.ts`'s three `renderClaudeVersion` tests at lines 229-254). These are W4/W5
in the plan's Affected Files (web-tests' job) — the fixtures need the new
`{installed, floor, verified, status}` shape and `masthead.test.ts`'s
`renderClaudeVersion`/`describeClaudeVersion` tests need rewriting to the new six-row
table (the old drift/pinned assertions no longer apply).

Note `protocol.test.ts`'s `validHello`/`claudeCode` object literals do **not** fail —
they're untyped inline objects passed to `parseMessage(unknown)`, so TS structurally
accepts the stale field names there; those tests will still *run* but their assertions
(old `pinned`/`drift` shape, `protocolVersion: 1`) are now wrong against the real parser
and are also W3's job to update.

**Evidence the app code itself is sound, independent of the two test files**: `npx vite
build` (bypassing the `tsc --noEmit` gate that only the two test files trip) succeeds
cleanly — `43 modules transformed`, dashboard emitted to
`internal/webui/assets/`. I also ran `make web-build build` from the repo root as
instructed; it fails at the `web-build` step for the same two-file `tsc` error above (the
Makefile chain has no way to skip test files), before ever reaching the Go build, so
`./bin/musterd` was not produced by that command. `internal/claudecode`, `cmd/musterd`,
`internal/server` are all daemon-impl's concurrent-agent territory and had no committed
changes at the time of this run (`git status --short` showed only the four files above),
so a real end-to-end daemon+dashboard smoke run isn't possible from this agent's side of
the plan yet regardless of the tsc gate — the wire contract needs both sides present.

**E2E**: could not run `web/e2e/claude-version.spec.ts` for the same reason (no daemon
build available). I read it in full against my implementation instead: every locator/name
it asserts (`#claude-version`, `getByRole("img", {name: <exact warning sentence>})`,
`title` equal to that same sentence, the `^claude <version>(\s|$)` regex tolerating the
trailing-space-before-glyph case, the exact `claude <verified>` match with no trailing
space when there's no warning, `#claude-version button, #claude-version a` matching
nothing) lines up with `describeClaudeVersion`/`renderClaudeVersion` as written. No spec
edit needed or made.

**Test files needing changes I was not allowed to make**:
- `web/src/protocol.test.ts` — W3: `validHello`'s `claudeCode` literal and every test
  built on it need the new shape; `protocolVersion` in `validHello` should become 2 (or a
  dedicated "unsupported version" test should use something other than 1).
- `web/src/ws.test.ts` — W4: line 5's `hello: Hello` fixture needs the new `claudeCode`
  shape; the "unsupported protocolVersion" tests currently use `2` as the bad value
  (`ws.test.ts:136`, `:334`) — now the *good* value — and must switch to something else
  (e.g. `3` or `99`, the latter already used at `:334`... but `:136` uses `2` specifically
  and needs to change).
- `web/src/render/masthead.test.ts` — W5: the `describe("renderClaudeVersion", ...)`
  block (lines 228-255) tests the removed pinned/drift behaviour; needs replacing with
  `describeClaudeVersion` coverage for all six DOM-table rows (null, unknown, verified,
  above, below, non-unknown-with-null-installed) plus a `renderClaudeVersion` DOM
  assertion for the warning-glyph shape (`role="img"`, `aria-label` == `title` == the
  warning sentence, trailing-space text node before it).
