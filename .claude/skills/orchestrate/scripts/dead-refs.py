#!/usr/bin/env python3
"""dead-refs.py [--all | <file>...] — every repo path, `make <target>` and `musterd -flag`
that markdown or a code comment cites must exist.

Default scope: files changed against main (on main: the last commit). --all scans the tree.
Exit 1 on any missing reference, 0 otherwise; a run that extracts nothing says so instead
of passing silently. plans/** and docs/history/** are out of scope — they record what was
true when written.

Why (2026-09-11): three of four consecutive second review cycles were a stale statement, and
two of those were a reference to something deleted (a Go comment pointing at a removed doc;
three live citations of a deleted docs/ file). A false *statement* still needs a reader; a
dead *reference* does not.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
os.chdir(ROOT)

# Tokens that look like repo paths but are not, one reason each.
WHITELIST = {
    "web/dist": "build output, gitignored",
    "test/expect/types": "a @playwright/test import path, not a repo dir",
    "cmd/muster-desktop/": "SPEC §5's future Wails wrapper, deliberately not built",
}
TOP_DIRS = ("docs", "internal", "web", "cmd", "spikes", "scripts", "tools", "test", ".claude", ".githooks", ".github")
PATH_RE = re.compile(r"^(?:%s)/[A-Za-z0-9_./@-]+$|^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:md|go|ts|sh|yaml|yml|json|sql|py)$|^Makefile$" % "|".join(re.escape(d) for d in TOP_DIRS))
BARE_RE = re.compile(r"(?:(?<=^)|(?<=[\s(]))((?:%s)/[A-Za-z0-9_./@-]+)" % "|".join(re.escape(d) for d in TOP_DIRS))
TICK_RE = re.compile(r"`([^`\n]+)`")
SKIP_CHARS = ("*", "<", ">", "{", "…", "$", "...")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def scope_files(argv):
    pats = ["*.md", "*.go", "*.ts", "*.sh", "Makefile", ".githooks/*"]
    if argv[:1] == ["--all"]:
        out = git("ls-files", "--", *pats)
    elif argv:
        return argv
    else:
        out = git("diff", "--name-only", diff_range(), "--", *pats)
    return [f for f in out.split("\n") if f]


def diff_range():
    branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()
    return "HEAD~1" if branch == "main" else "main...HEAD"


def moved_paths():
    """(old path, new path or None, tail) for every file the range renamed or deleted; `tail` is the
    old path's last two segments (`render/launch.ts`) — the shape a bare comment citation takes, which
    BARE_RE cannot see because it has no top-dir prefix (code-breakup: three review-Major citations)."""
    out = []
    for row in git("diff", "--name-status", "--diff-filter=DR", diff_range()).split("\n"):
        cols = row.split("\t")
        if len(cols) < 2:
            continue
        old, new = cols[1], (cols[2] if len(cols) > 2 else None)
        tail = "/".join(old.split("/")[-2:])
        if "/" in tail and not os.path.exists(old) and (new is None or not new.endswith("/" + tail)):
            out.append((old, new, tail))
    return out


def in_scope(f):
    return not (f.startswith(("plans/", "docs/history/", "docs/research/", "web/dist/", "dist/")) or "node_modules/" in f or (f.startswith("web/e2e/") and f.endswith(".spec.ts")))


def candidate_lines(f, text):
    if f.endswith(".md"):  # outside ``` fences only — templates and examples cite illustrative paths
        out, fenced = [], False
        for i, l in enumerate(text.split("\n"), 1):
            if l.lstrip().startswith("```"):
                fenced = not fenced
                continue
            if not fenced:
                out.append((i, l))
        return out
    if f.endswith((".go", ".ts")):
        return [(i, l) for i, l in enumerate(text.split("\n"), 1) if re.match(r"^\s*(//|/\*|\*)", l)]
    return [(i, l) for i, l in enumerate(text.split("\n"), 1) if re.match(r"^\s*#", l)]


def known_make_targets():
    with open("Makefile") as fh:
        return {m.group(1) for m in re.finditer(r"^([a-zA-Z0-9_-]+):", fh.read(), re.M)}


def known_flags():
    names = set()
    for f in git("ls-files", "--", "cmd/musterd/*.go").split():
        if f.endswith("_test.go"):
            continue
        with open(f) as fh:
            for m in re.finditer(r"\.(?:String|Bool|Int|Duration|Var|Func|Float64)\w*\(\s*(?:&[\w.]+\s*,\s*)?\"([a-z][a-z0-9-]*)\"", fh.read()):
                names.add(m.group(1))
    return names


def tracked_basenames():
    return {os.path.basename(f) for f in git("ls-files").split("\n") if f}


def main(argv):
    files = [f for f in scope_files(argv) if in_scope(f) and os.path.isfile(f)]
    targets, flags, basenames = known_make_targets(), known_flags(), tracked_basenames()
    checked = missing = 0
    for f in files:
        with open(f, errors="replace") as fh:
            text = fh.read()
        for ln, line in candidate_lines(f, text):
            toks = TICK_RE.findall(line)
            if not f.endswith(".md"):
                toks += BARE_RE.findall(line)
            for tok in toks:
                tok = tok.strip()
                m = re.match(r"^make\s+([a-zA-Z0-9_ =.-]+)$", tok)
                if m:
                    for t in m.group(1).split():
                        if "=" in t or f"make {t}" in WHITELIST:
                            continue
                        checked += 1
                        if t not in targets:
                            missing += 1
                            print(f"{f}:{ln}  make {t}  missing (make target)")
                    continue
                if re.match(r"^musterd\s", tok):
                    for fl in re.findall(r"\s--?([a-z][a-z0-9-]*)", tok):
                        checked += 1
                        if fl not in flags:
                            missing += 1
                            print(f"{f}:{ln}  musterd -{fl}  missing (flag)")
                    continue
                p = re.split(r"[#§]", tok)[0]
                p = re.sub(r":\d+([-–,]\d+)*$", "", p)
                p = re.sub(r"[.,;:)]+$", "", p)
                p = re.sub(r"^\./", "", p)
                if not PATH_RE.match(p) or any(c in p for c in SKIP_CHARS) or p.endswith("-") or p.startswith("_"):
                    continue
                if p in WHITELIST:
                    continue
                if "/" not in p:
                    # A bare filename is a weak reference (runtime artifacts, files in other
                    # trees, suffix patterns). Count it only when it resolves; otherwise skip.
                    if os.path.exists(os.path.join(os.path.dirname(f), p)) or p in basenames:
                        checked += 1
                    continue
                checked += 1
                if os.path.exists(p):
                    continue
                d, _, last = p.rpartition("/")  # Go qualified identifier: internal/session.Manager → internal/session
                if re.match(r"^[a-z0-9_]+\.[A-Za-z]", last) and os.path.isdir(os.path.join(d, last.split(".")[0])):
                    continue
                missing += 1
                print(f"{f}:{ln}  {tok}  missing (path)")
    moved = moved_paths()
    if moved:  # a rename orphans citations in files the diff never touched — scan the whole tree
        pats = ["*.md", "*.go", "*.ts", "*.sh", "Makefile", ".githooks/*"]
        for f in [x for x in git("ls-files", "--", *pats).split("\n") if x and in_scope(x) and os.path.isfile(x)]:
            with open(f, errors="replace") as fh:
                text = fh.read()
            for ln, line in candidate_lines(f, text):
                for old, new, tail in moved:
                    if re.search(r"(?<![A-Za-z0-9_./-])%s(?![A-Za-z0-9_-])" % re.escape(tail), line) and not (new and new in line):
                        checked += 1
                        missing += 1
                        print(f"{f}:{ln}  {tail}  missing (moved: {old} -> {new or 'deleted'})")
    for w in WHITELIST:
        exists = (w.startswith("make ") and w[5:] in targets) or (not w.startswith("make ") and os.path.exists(w) and w not in ("web/dist",))
        if exists:
            print(f"dead-refs: whitelist entry {w!r} now exists — remove it from WHITELIST")
    if checked == 0:
        print(f"dead-refs: 0 references checked (nothing to scan in {len(files)} file(s))")
        return 0
    print(f"dead-refs: {checked} references checked, {missing} missing")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
