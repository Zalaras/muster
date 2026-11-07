#!/usr/bin/env python3
"""affected-go-packages.py [--base main] [--all-if-shared]

Prints the Go packages a wave-2 gate must test: every package whose test build (go list -deps
-test) reaches a package that owns a changed .go file since the merge-base with --base. Prints
`./...` instead when the change touches something every package shares (go.mod, go.sum, embedded
assets, testdata, Makefile, the version record) or when anything goes wrong — a wave gate never
under-runs (kb:adr/process-cycle-gates-affected-only). Final Validation always runs the whole
suite; this is for the cycle gates only.
"""
import os, subprocess, sys
base = "main"
args = sys.argv[1:]
if "--base" in args:
    base = args[args.index("--base") + 1]
SHARED = ("go.mod", "go.sum", "Makefile", "internal/webui/", "internal/claudecode/observed_versions.txt", "testdata/", ".golangci.yml")

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True, check=True).stdout

try:
    mb = sh("git", "merge-base", base, "HEAD").strip()
    changed = [l for l in sh("git", "diff", "--name-only", mb, "HEAD").splitlines()] + \
              [l for l in sh("git", "diff", "--name-only").splitlines()]   # uncommitted edits count too
    changed = sorted(set(changed))
    if any(any(c == s or c.startswith(s) or ("/" + s) in c for s in SHARED) for c in changed):
        print("./..."); sys.exit(0)
    go_dirs = sorted({os.path.dirname(c) for c in changed if c.endswith(".go")})
    if not go_dirs:
        print(""); sys.exit(0)   # no Go change: nothing to test on this side
    mod = sh("go", "list", "-m").strip()
    changed_pkgs = {f"{mod}/{d}" if d else mod for d in go_dirs}
    out = sh("go", "list", "-e", "-f", "{{.ImportPath}}\t{{join .Deps \" \"}}\t{{join .TestImports \" \"}}\t{{join .XTestImports \" \"}}", "./...")
    # transitive closure of test-time deps: a package is affected if it is changed, or any of its
    # deps/test imports (followed transitively through Deps) is changed.
    deps = {}
    for line in out.splitlines():
        ip, d, ti, xti = (line.split("\t") + ["", "", ""])[:4]
        deps[ip] = set(d.split()) | set(ti.split()) | set(xti.split())
    def reach(ip, seen=None):
        seen = seen if seen is not None else set()
        for d in deps.get(ip, ()):
            if d in seen: continue
            seen.add(d); reach(d, seen)
        return seen
    affected = sorted(ip for ip in deps if ip in changed_pkgs or (reach(ip) & changed_pkgs))
    if not affected:
        print("./..."); sys.exit(0)
    print(" ".join("./" + ip[len(mod) + 1:] if ip != mod else "." for ip in affected))
except Exception as e:  # noqa: BLE001 — any failure means the full suite
    print("./...")
