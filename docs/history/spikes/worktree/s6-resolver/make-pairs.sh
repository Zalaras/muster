#!/usr/bin/env bash
# S6 — build adversarial conflict pairs where the right resolution is NOT recoverable from
# either diff alone; each pair is a tiny Go module with a verify command (go vet + go test).
# Two clean-room copies per pair: "ctx" keeps TASK-A.md/TASK-B.md + real commit messages;
# "diff" strips them (messages become "work"). Ground truth = verify passes. Zero LLM here.
set -eu
D="${MUSTER_SPIKES_HOME:-$HOME/.muster-spikes}/s6-resolver"; rm -rf "$D/pairs"; mkdir -p "$D/pairs"
mk() { # mk <pair> <task-a> <task-b>  — caller has cd'd into fresh repo dir with base files, defines a() b() to mutate
  local p="$1"; git init -q; git config user.email s6@x; git config user.name s6; git add -A; git commit -qm "base"; git branch -M main
  git checkout -qb A; echo "$2" > TASK-A.md; a; git add -A; git commit -qm "A: $2"
  git checkout -q main; git checkout -qb B; echo "$3" > TASK-B.md; b; git add -A; git commit -qm "B: $3"
  git checkout -q main; git merge -q --squash A >/dev/null; git commit -qm "land A: $2"
  cd ..; cp -R repo ctx; cp -R repo diff
  ( cd diff && git checkout -q B && git filter-branch -f --msg-filter 'echo work' --index-filter 'git rm -q --cached --ignore-unmatch TASK-A.md TASK-B.md' -- --all >/dev/null 2>&1 ); rm -rf diff/.git/refs/original
  echo "pair $p ready: $(cd ctx && git merge-tree --write-tree main B >/dev/null 2>&1 && echo 'NO textual conflict (bad pair)' || echo 'conflicts')"
}
# ---- pair 1: sorted-insert with two different orderings -------------------------------
mkdir -p "$D/pairs/p1/repo"; cd "$D/pairs/p1/repo"
cat > go.mod <<'G'
module p1
go 1.22
G
cat > list.go <<'G'
package p1

// Regions is kept sorted; Order() defines the sort.
var Regions = []string{"eu-west", "us-east"}

func Order(a, b string) bool { return a < b }
G
cat > list_test.go <<'G'
package p1

import "testing"

func TestSorted(t *testing.T) {
	for i := 1; i < len(Regions); i++ {
		if !Order(Regions[i-1], Regions[i]) {
			t.Fatalf("Regions not in Order at %d: %v", i, Regions)
		}
	}
}
G
a() { cat > list.go <<'G'
package p1

// Regions is kept sorted; Order() defines the sort — now by length, then lexical.
var Regions = []string{"eu-west", "us-east", "ap-southeast"}

func Order(a, b string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	return a < b
}
G
}
b() { cat > list.go <<'G'
package p1

// Regions is kept sorted; Order() defines the sort.
var Regions = []string{"af-south", "eu-west", "us-east"}

func Order(a, b string) bool { return a < b }
G
}
mk p1 "Sort regions by length then name; add ap-southeast" "Add the af-south region, keeping the sorted invariant"
# ---- pair 2: rename in A vs new call sites in B, same hunk ----------------------------
mkdir -p "$D/pairs/p2/repo"; cd "$D/pairs/p2/repo"
cat > go.mod <<'G'
module p2
go 1.22
G
cat > svc.go <<'G'
package p2

func Fetch(id string) string { return "item:" + id }

func All() []string {
	return []string{Fetch("1")}
}
G
cat > svc_test.go <<'G'
package p2

import "testing"

func TestAll(t *testing.T) {
	if len(All()) < 1 {
		t.Fatal("empty")
	}
}
G
a() { cat > svc.go <<'G'
package p2

// Load replaces Fetch: ids are now ints.
func Load(id int) string { return "item:" + itoa(id) }

func itoa(i int) string { return string(rune('0' + i)) }

func All() []string {
	return []string{Load(1)}
}
G
}
b() { cat > svc.go <<'G'
package p2

func Fetch(id string) string { return "item:" + id }

func All() []string {
	return []string{Fetch("1"), Fetch("2"), Fetch("3")}
}
G
}
mk p2 "Rename Fetch to Load and switch ids to int" "All() must return items 1, 2 and 3"
# ---- pair 3: A deletes a feature flag path; B extends that path -------------------------
mkdir -p "$D/pairs/p3/repo"; cd "$D/pairs/p3/repo"
cat > go.mod <<'G'
module p3
go 1.22
G
cat > flags.go <<'G'
package p3

var Legacy = false

func Mode() string {
	if Legacy {
		return "legacy"
	}
	return "modern"
}
G
cat > flags_test.go <<'G'
package p3

import "testing"

func TestMode(t *testing.T) {
	if Mode() == "" {
		t.Fatal("empty mode")
	}
}
G
a() { cat > flags.go <<'G'
package p3

// Legacy mode removed; modern is the only path.
func Mode() string {
	return "modern"
}
G
}
b() { cat > flags.go <<'G'
package p3

var Legacy = false
var Verbose = false

func Mode() string {
	if Legacy {
		if Verbose {
			return "legacy-verbose"
		}
		return "legacy"
	}
	return "modern"
}
G
cat >> flags_test.go <<'G'

func TestVerboseIgnoredWhenModern(t *testing.T) {
	Verbose = true
	if Mode() != "modern" {
		t.Fatal("verbose must not change modern")
	}
}
G
}
mk p3 "Remove the Legacy flag and its code path entirely" "Add a Verbose flag that refines legacy output"
echo "verify command per pair: cd <copy> && go vet ./... && go test ./..."
