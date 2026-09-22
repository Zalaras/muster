#!/usr/bin/env bash
# Real-merge census — for every merge commit on <branch>, its two parents were genuinely
# parallel. Ask merge-tree whether they conflict, how many files overlap, and how long the
# call takes (the radar's cost on this repo). Also: did the recorded merge resolve by hand
# (merge tree ≠ recorded tree)? Zero LLM, read-only on the clone.
# Usage: census-real-merges.sh <repo> [branch]  → <repo>/../real-merges.tsv
set -u
R="$1"; B="${2:-main}"; OUT="$(dirname "$R")/real-merges.tsv"; cd "$R" || exit 1
printf 'merge\tp1\tp2\tbase\tfiles_p1\tfiles_p2\toverlap\tmt_status\tconflict_files\tmt_ms\thand_resolved\tsubject\n' > "$OUT"
for m in $(git rev-list --merges --first-parent "$B"); do
  p1=$(git rev-parse "$m^1"); p2=$(git rev-parse "$m^2"); base=$(git merge-base "$p1" "$p2") || continue
  f1=$(git diff --name-only "$base" "$p1" | sort); f2=$(git diff --name-only "$base" "$p2" | sort)
  ov=$(comm -12 <(echo "$f1") <(echo "$f2") | grep -c . || true)
  t0=$(python3 -c 'import time;print(int(time.time()*1000))')
  if out=$(git merge-tree --write-tree --merge-base="$base" "$p1" "$p2" 2>/dev/null); then st=clean; cf="-"; else st=conflict; cf=$(echo "$out" | sed -n '2,$p' | awk '/^[0-9]+ [0-9a-f]+ [123]\t/{print $NF}' | sort -u | tr '\n' ',' ); fi
  t1=$(python3 -c 'import time;print(int(time.time()*1000))')
  mtree=$(echo "$out" | head -1); rtree=$(git rev-parse "$m^{tree}"); hand=$([ "$st" = clean ] && [ "$mtree" != "$rtree" ] && echo yes || echo no)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "${m:0:7}" "${p1:0:7}" "${p2:0:7}" "${base:0:7}" "$(echo "$f1"|grep -c .)" "$(echo "$f2"|grep -c .)" "$ov" "$st" "${cf:--}" "$((t1-t0))" "$hand" "$(git log -1 --format=%s "$m" | cut -c1-60)" >> "$OUT"
done
echo "wrote $OUT"
