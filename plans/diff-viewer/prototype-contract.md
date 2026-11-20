# diff-viewer prototype — the one wire shape both halves build to

Throwaway. Not `docs/protocol.md`; nothing here is landed.

## `GET /api/sessions/{id}/diff?scope=uncommitted|branch`

Cookie-guarded like every other `/api/*` route. `scope` defaults to `uncommitted`.

- `uncommitted` — the working tree against `HEAD`, **plus untracked files** (each as an all-added file).
- `branch` — the working tree against the merge-base of `HEAD` and the repo's default branch
  (`origin/HEAD` → else `main` → else `master`), so it shows everything the branch has done,
  committed or not, plus untracked files. When there is no usable merge-base (already on the default
  branch, no default branch found) it falls back to `HEAD` and says so in `baseLabel`.

The repo is the git top-level of the session's directory. Works for ended sessions too.

### 200

```json
{
  "scope": "uncommitted",
  "baseLabel": "HEAD",
  "branch": "plan/foo",
  "repoRoot": "/abs/path/to/repo",
  "truncated": false,
  "files": [
    {
      "path": "internal/server/diff.go",
      "oldPath": null,
      "status": "modified",
      "binary": false,
      "truncated": false,
      "additions": 12,
      "deletions": 3,
      "hunks": [
        {
          "header": "@@ -10,7 +10,9 @@ func foo() {",
          "oldStart": 10, "oldLines": 7, "newStart": 10, "newLines": 9,
          "lines": [
            { "kind": "context", "old": 10, "new": 10, "text": "\tx := 1" },
            { "kind": "del",     "old": 11, "new": null, "text": "\ty := 2" },
            { "kind": "add",     "old": null, "new": 11, "text": "\ty := 3" }
          ]
        }
      ]
    }
  ]
}
```

- `status`: `"modified" | "added" | "deleted" | "renamed"`. `oldPath` is set only for `renamed`.
- `binary: true` → `hunks` is `[]`.
- `text` carries no leading `+`/`-`/space and no trailing newline. A `\ No newline at end of file`
  marker is dropped.
- `baseLabel` examples: `"HEAD"`, `"main @ 1a2b3c4"`, `"HEAD (already on main)"`.
- `branch` is `null` on a detached HEAD.
- Caps: at most 300 files (`truncated: true` at the top level beyond that); a file with more than
  3000 diff lines keeps its first 3000 and sets its own `truncated: true`; an untracked file over
  256 KiB or containing a NUL byte is reported `binary: true`.
- Files are ordered by path.

## `GET /api/sessions/{id}/diff/summary` (round 1)

Cheap counts so the dashboard can decide whether to show a way into the diff at all. Always 200
for a known session:

```json
{
  "repo": true,
  "baseLabel": "main @ 1a2b3c4",
  "uncommitted": { "files": 3, "additions": 40, "deletions": 12 },
  "branch":      { "files": 5, "additions": 80, "deletions": 20 }
}
```

- `uncommitted` and `branch` count exactly what the two scopes of the diff route would list
  (untracked files included; a binary file counts as a file with 0/0).
- Not a git repository → `{"repo": false, "baseLabel": "", "uncommitted": {0,0,0}, "branch": {0,0,0}}`
  (all three counts zero in each), still 200.
- `baseLabel` is the `branch` scope's label.
- `404` unknown session.

### Errors

The repo's usual error body (`{"error": {"code", "message"}}` — whatever `internal/server/respond.go`
writes):

- `404` unknown session.
- `409` code `not_a_repo` — the session's directory is not inside a git repository.
