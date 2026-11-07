#!/usr/bin/env bash
# PostToolUse formatter (.claude/settings.json, matcher Edit|Write|MultiEdit): gofmt a written
# .go file, Biome-format a written web/ .ts file, so a fix wave is never spent on formatting
# and `make lint` / `make web-lint` never fail on it. Best effort: always exits 0; a missing tool
# is silence, not a block. Nested CLAUDE.md fragments and style.css are untouched (style.css is
# the contrast gate's, Biome does not format it).
in="$(cat)"
path="$(printf '%s' "$in" | python3 -c 'import json,sys; d=json.load(sys.stdin); i=d.get("tool_input") or {}; print(i.get("file_path") or "")' 2>/dev/null)"
[[ -n "$path" && -f "$path" ]] || exit 0
case "$path" in
  *.go) command -v gofmt >/dev/null && gofmt -w "$path" >/dev/null 2>&1 ;;
  */web/*.ts|*/web/*.tsx|*/web/*.js|*/web/*.json)
    [[ "$path" == */web/dist/* || "$path" == */node_modules/* ]] && exit 0
    root="${path%%/web/*}/web"
    [[ -s "$HOME/.nvm/nvm.sh" ]] && { . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; (cd "$root" && nvm use >/dev/null 2>&1); }
    (cd "$root" && npx --no-install biome format --write "$path" >/dev/null 2>&1) ;;
esac
exit 0
