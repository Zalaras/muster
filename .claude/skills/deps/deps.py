#!/usr/bin/env python3
"""Dependency report and svu comparison for /deps. Run from the repo root.

  deps.py report               markdown tables of every dependency with an update
  deps.py svu-compare OLD NEW  the version-bump matrix docs/conventions.md relies on, both versions

Reads only: go.mod, web/package.json, web/package-lock.json, .nvmrc, .github/workflows/*.yml,
the Go/npm registries, nodejs.org, go.dev and (if gh is authenticated) GitHub releases.
"""

import json
import os
import re
import subprocess
import sys
import tempfile


def run(cmd, cwd=None, check=False):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit(f"{' '.join(cmd)} failed:\n{p.stderr}")
    return p.stdout


def fetch_json(url):
    # curl, not urllib: the python.org macOS build ships without a CA bundle.
    try:
        return json.loads(run(["curl", "-fsS", "--max-time", "20", url], check=True))
    except (SystemExit, ValueError) as e:  # report degrades, never aborts
        print(f"<!-- fetch failed: {url}: {e} -->", file=sys.stderr)
        return None


def vtuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def major(v):
    return vtuple(v)[0] if vtuple(v) else None


def table(title, header, rows):
    print(f"\n### {title}\n")
    if not rows:
        print("Nothing to update.")
        return
    print("| " + " | ".join(header) + " |")
    print("|" + "---|" * len(header))
    for r in rows:
        print("| " + " | ".join(str(c) for c in r) + " |")


def go_section():
    gomod = json.loads(run(["go", "mod", "edit", "-json"], check=True))
    cur = gomod["Go"]
    listed = {r["Path"]: r.get("Indirect", False) for r in gomod.get("Require") or []}
    rel = fetch_json("https://go.dev/dl/?mode=json&include=all") or []
    stable = [r["version"][2:] for r in rel if r.get("stable")]
    minor = ".".join(cur.split(".")[:2])
    same = sorted((v for v in stable if v.startswith(minor + ".")), key=vtuple)
    newest = max(stable, key=vtuple) if stable else "unknown"
    rows = []
    if same and vtuple(same[-1]) > vtuple(cur):
        rows.append(["Go (`go` directive)", cur, same[-1], "patch: always take it"])
    if stable and vtuple(newest)[:2] > vtuple(cur)[:2]:
        rows.append(["Go (`go` directive)", cur, newest, "new minor: ask"])

    out = run(["go", "list", "-m", "-u", "-json", "all"], check=True)
    dec, i, mods = json.JSONDecoder(), 0, []
    while True:
        s = out[i:].lstrip()
        if not s:
            break
        o, n = dec.raw_decode(s)
        i = len(out) - len(s) + n
        mods.append(o)
    graph_only = []
    for m in mods:
        if m.get("Main") or not m.get("Update"):
            continue
        p = m["Path"]
        if p in listed:
            kind = "indirect" if listed[p] else "direct"
            rows.append([f"`{p}`", m["Version"], m["Update"]["Version"], kind])
        else:
            graph_only.append(p)
    table("Go", ["Item", "Current", "Available", "Kind"], rows)
    if graph_only:
        print(f"\nGraph-only (not in go.mod, not compiled in; leave): {', '.join(sorted(graph_only))}")
    if "Tool" in gomod:
        print(f"\nTools (`go tool`): {', '.join(t['Path'] for t in gomod['Tool'])}, covered above via their modules.")


def npm_section():
    pkg = json.load(open("web/package.json"))
    lock = json.load(open("web/package-lock.json"))["packages"]
    declared = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    raw = run(["npm", "outdated", "--json"], cwd="web") or "{}"
    outdated = json.loads(raw)
    rows, majors, drift = [], [], []
    for name, spec in sorted(declared.items()):
        locked = lock.get(f"node_modules/{name}", {}).get("version", "?")
        installed = outdated.get(name, {}).get("current", locked)
        if installed != locked:
            drift.append(f"{name} {installed}≠{locked}")
        latest = outdated.get(name, {}).get("latest") or run(["npm", "view", name, "version"], cwd="web").strip()
        pin = "exact" if re.match(r"^\d", spec) else spec[0]
        if major(latest) != major(locked):
            within = run(["npm", "view", f"{name}@^{locked}", "version", "--json"], cwd="web")
            try:
                w = json.loads(within)
                w = w[-1] if isinstance(w, list) else w
            except Exception:
                w = locked
            majors.append([name, locked, latest, f"major; newest in {major(locked)}.x is {w}"])
            latest = w
        if latest and vtuple(latest) > vtuple(locked):
            rows.append([name, f"{spec} ({locked})", latest, pin])
    table("Web packages", ["Package", "Declared (locked)", "Newest in major", "Pin"], rows)
    table("Majors (separate session)", ["Package", "Locked", "Latest", "Note"], majors)
    if drift:
        print(f"\nnode_modules behind the lockfile (run `npm ci` first): {', '.join(drift)}")

    ov = pkg.get("overrides", {})
    orows = []
    for name, ver in ov.items():
        parents = [
            f"{k.split('node_modules/')[-1]} wants {v['dependencies'][name]}"
            for k, v in lock.items()
            if k and name in (v.get("dependencies") or {})
        ]
        latest = run(["npm", "view", name, "version"], cwd="web").strip()
        orows.append([name, ver, latest, "; ".join(sorted(set(parents))) or "nothing"])
    table("Overrides (try removing each)", ["Package", "Forced", "Latest", "Parents' ranges"], orows)

    audit = json.loads(run(["npm", "audit", "--json"], cwd="web") or "{}")
    print(f"\nnpm audit: {audit.get('metadata', {}).get('vulnerabilities', 'unknown')}")


def toolchain_section():
    rows = []
    nv = open(".nvmrc").read().strip().lstrip("v")
    idx = fetch_json("https://nodejs.org/dist/index.json") or []
    same = [r["version"][1:] for r in idx if major(r["version"]) == major(nv)]
    if same and vtuple(same[0]) > vtuple(nv):
        rows.append(["Node (`.nvmrc`)", nv, same[0], "same major"])

    wf = "".join(open(os.path.join(".github/workflows", f)).read() for f in os.listdir(".github/workflows"))
    for mod, pin in re.findall(r"go install (github\.com/[\w./-]+?)(?:/cmd/\w+)?@(v[\d.]+)", wf):
        vers = run(["go", "list", "-m", "-versions", mod]).split()[1:]
        if vers and vtuple(vers[-1]) > vtuple(pin):
            rows.append([f"`{mod}` (workflow pin)", pin, vers[-1], "pinned: re-verify before moving"])
        m = re.match(r"(.*/v)(\d+)$", mod)
        # The path of a major that was never released still resolves, printing no versions.
        if m and run(["go", "list", "-m", "-versions", f"{m[1]}{int(m[2]) + 1}"]).split()[1:]:
            rows.append([f"`{mod}`", pin, f"v{int(m[2]) + 1} exists", "major: separate session"])

    for action, tag in sorted(set(re.findall(r"uses:\s*([\w-]+/[\w-]+)@(v\d+)\b", wf))):
        latest = run(["gh", "api", f"repos/{action}/releases/latest", "--jq", ".tag_name"]).strip()
        if latest and major(latest) and major(latest) > major(tag):
            rows.append([f"`{action}`", tag, latest, "new major tag"])
    table("Toolchain and CI", ["Item", "Current", "Available", "Note"], rows)


def svu_compare(old, new):
    cases = [
        ("feat!: x", None), ("unknownthing!: x", None), ("docs: x", "see BREAKING CHANGE: here"),
        ("docs: x", "see BREAKING-CHANGE: here"), ("docs: mentions BREAKING CHANGE: mid", None),
        ("feat: x", None), ("fix: x", None), ("perf: x", None), ("refactor: x", None), ("docs: x", None),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        bins = {}
        for v in (old, new):
            d = os.path.join(tmp, v)
            env = {**os.environ, "GOBIN": d}
            p = subprocess.run(["go", "install", f"github.com/caarlos0/svu/v{major(v)}@{v}"], env=env,
                               capture_output=True, text=True)
            if p.returncode:
                sys.exit(p.stderr)
            bins[v] = os.path.join(d, "svu")
        git = ["git", "-c", "user.name=t", "-c", "user.email=t@t"]
        print(f"| commit | {old} --v0 | {old} | {new} --v0 | {new} |\n|---|---|---|---|---|")
        differ = False
        for subj, body in cases:
            r = tempfile.mkdtemp(dir=tmp)
            run(["git", "init", "-q"], cwd=r, check=True)
            run(git + ["commit", "-q", "--allow-empty", "-m", "chore: init"], cwd=r, check=True)
            run(["git", "tag", "v0.2.0"], cwd=r, check=True)
            msg = ["-m", subj] + (["-m", body] if body else [])
            run(git + ["commit", "-q", "--allow-empty"] + msg, cwd=r, check=True)
            res = [run([bins[v], "next"] + f, cwd=r).strip() for v in (old, new) for f in (["--v0"], [])]
            differ |= res[:2] != res[2:]
            label = subj + (f" / body: {body}" if body else "")
            print(f"| `{label}` | " + " | ".join(res) + " |")
        print("\nRESULT:", "DIFFERENT, do not move the pin without the developer" if differ else "identical")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "report":
        print("## Dependency report")
        go_section()
        npm_section()
        toolchain_section()
    elif len(sys.argv) == 4 and sys.argv[1] == "svu-compare":
        svu_compare(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
