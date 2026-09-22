#!/usr/bin/env bash
# S2 analysis — per tick, pairwise filename intersection between worktrees of the same repo
# (dirty ∪ committed-vs-merge-base). Prints: ticks, ticks with any overlap, and the files that
# overlap most (the candidate suppression list), plus per-pair overlap durations.
set -u
IN="${1:-${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/radar/samples.jsonl}"
jq -sc '
  def files: ([.dirty[] | sub("^...";"")] + .committed) | unique;
  group_by(.at) | map({at: .[0].at,
    pairs: ([combinations(2)] | map(select(.[0].repo==.[1].repo and .[0].worktree < .[1].worktree)
            | {a:(.[0].branch), b:(.[1].branch), overlap: ((.[0]|files) - ((.[0]|files) - (.[1]|files)))})) })
' "$IN" > /tmp/radar-ticks.$$.json
echo "ticks: $(jq length /tmp/radar-ticks.$$.json)   ticks with any overlap: $(jq '[.[] | select(any(.pairs[]; .overlap|length>0))] | length' /tmp/radar-ticks.$$.json)"
echo "== files overlapping most (tick-count) — suppression candidates"; jq -r '[.[].pairs[].overlap[]] | group_by(.) | map({f:.[0], n:length}) | sort_by(-.n)[:15][] | "\(.n)\t\(.f)"' /tmp/radar-ticks.$$.json
echo "== per pair: ticks overlapping / ticks observed"; jq -r '[.[].pairs[]] | group_by(.a+" ↔ "+.b) | .[] | "\(map(select(.overlap|length>0))|length) / \(length)\t\(.[0].a) ↔ \(.[0].b)"' /tmp/radar-ticks.$$.json
rm -f /tmp/radar-ticks.$$.json
