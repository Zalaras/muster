#!/usr/bin/env bash
# Size warnings — function length, duplicated blocks, file length. Never fails.
#
# Usage (from anywhere; the script cds to the project root):
#   size-warn.sh [--changed] [--files N]
#
#   --changed   scope to the files this branch changed against main (committed range plus the
#               working tree); default is the whole tree
#   --files N   file-length threshold in lines (default 500)
#
# Prints one `WARN <kind> <file:line> <detail>` line per hit and a final `size-warn: N hits`
# line, then exits 0 whether or not anything was found. These are warnings by decision
# (kb:adr/process-size-linters-warn-never-fail): a long function or a big file can have a reason,
# and the reason belongs in the implementation log's Decisions, where the maintainability reviewer
# reads it beside this output. gocyclo and Biome's cognitive-complexity ceiling remain hard gates.
#
# golangci-lint runs with the repo config and `--enable-only funlen,dupl` — never `--no-config`,
# which would drop the canary build tag (silently skipping test/canary) and reset
# issues.max-same-issues to 3, truncating the count.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 2

CHANGED=0; FILE_LINES=500
while [[ $# -gt 0 ]]; do
  case "$1" in
    --changed) CHANGED=1 ;;
    --files) shift; FILE_LINES="${1:-500}" ;;
    --files=*) FILE_LINES="${1#*=}" ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

PATH="$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin:$PATH"

# --- scope ---------------------------------------------------------------------------------
# SCOPE is a newline-separated list of repo-relative paths, or empty for the whole tree.
SCOPE=""
if (( CHANGED )); then
  _base="$(git merge-base main HEAD 2>/dev/null || true)"
  SCOPE="$( { [[ -n "$_base" ]] && git diff --name-only "$_base" HEAD; git status --porcelain | cut -c4-; } 2>/dev/null | sort -u )"
  if [[ -z "${SCOPE// }" ]]; then
    echo "size-warn: 0 hits (no changed files against main)"; exit 0
  fi
fi

in_scope() {                   # $1 = path; true when unscoped or the path is in SCOPE
  [[ -z "$SCOPE" ]] && return 0
  grep -qxF -- "$1" <<<"$SCOPE"
}

HITS=0

# --- Go: funlen + dupl via golangci-lint (repo config kept) -----------------------------------
if command -v golangci-lint >/dev/null 2>&1; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    f="${line%%:*}"
    in_scope "$f" || continue
    printf 'WARN  %s\n' "$line"
    HITS=$((HITS+1))
  done < <(golangci-lint run --enable-only funlen,dupl ./... 2>/dev/null | grep -E '^[^ :]+\.go:[0-9]+' || true)
else
  echo "NOTE  golangci-lint not on PATH — funlen/dupl skipped"
fi

# --- file length: non-test Go and TypeScript -----------------------------------------------
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  in_scope "$f" || continue
  n="$(wc -l <"$f" | tr -d ' ')"
  if (( n > FILE_LINES )); then
    printf 'WARN  %s:1: file is %d lines (threshold %d) (filelen)\n' "$f" "$n" "$FILE_LINES"
    HITS=$((HITS+1))
  fi
done < <( { git ls-files 'cmd/*.go' 'internal/*.go' 'tools/*.go' | grep -v '_test\.go$';
            git ls-files 'web/src/*.ts' | grep -v '\.test\.ts$'; } 2>/dev/null )

echo "size-warn: $HITS hits"
exit 0
