# usage: python3 run.py PKGDIR [OUTDIR]  (PKGDIR relative to the repo root, e.g. internal/locate)
# Mutates every non-test .go file in PKGDIR, runs the package's tests once per mutant
# (8 in parallel, via go test -overlay — the tree is never edited), and writes
# results.json + report.txt under OUTDIR (default: $TMPDIR/test-audit/<pkg>).
import json, subprocess, sys, os, glob, collections, concurrent.futures as cf, shutil, tempfile
tools = os.path.dirname(os.path.abspath(__file__))
repo = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=tools, capture_output=True, text=True, check=True).stdout.strip()
pkg = sys.argv[1]
here = sys.argv[2] if len(sys.argv) > 2 else os.path.join(tempfile.gettempdir(), "test-audit", pkg.replace("/", "_"))
shutil.rmtree(here, ignore_errors=True); os.makedirs(here + "/mutants")
srcs = [f for f in sorted(glob.glob(f"{repo}/{pkg}/*.go")) if not f.endswith("_test.go")]
subprocess.run(["go", "run", os.path.join(tools, "mutate.go"), here + "/mutants", *srcs], check=True)
def gotest_all(overlay, alltests):
    # a panic or timeout aborts the test binary, hiding every later test's verdict:
    # skip the tests already judged and re-run until every test has reported
    judged, failed, panic, bf, rc = set(), set(), False, False, 0
    while True:
        skip = sorted(judged)
        tests, f, b, p, r = gotest(overlay, skip)
        if b and not judged: return tests, f, True, p, r
        failed |= f; panic |= p; rc = rc or r
        new = (tests | f) - judged
        judged |= new
        if r == 0 or judged >= alltests or not new: return judged, failed, False, panic, rc
def gotest(overlay=None, skip=()):
    cmd = ["go", "test", "-count=1", "-json", "-timeout=60s", "-vet=off"] + (["-overlay", overlay] if overlay else []) + (["-skip", "^(" + "|".join(skip) + ")$"] if skip else []) + ["./" + pkg]
    p = subprocess.run(cmd, cwd=repo, capture_output=True, text=True)
    tests, failed, bf, panic = set(), set(), False, False
    running = False
    for line in p.stdout.splitlines():
        try: e = json.loads(line)
        except: continue
        if e.get("Action") == "build-fail": bf = True
        o = e.get("Output", "")
        if "panic: test timed out" in o: panic = True
        if o.strip() == "running tests:": running = True
        elif running and o.startswith("\t") and o.strip().startswith("Test"):
            failed.add(o.strip().split()[0].split("/")[0])
        elif running and o.strip(): running = False
        t = e.get("Test")
        if t and "/" not in t:
            tests.add(t)
            if e["Action"] == "fail": failed.add(t)
    if p.returncode and not tests: bf = True
    return tests, failed, bf, panic, p.returncode
alltests, f0, b0, _, rc = gotest()
assert rc == 0 and not f0, "baseline red"
rows = [r.rstrip("\n").split("\t") for r in open(here + "/mutants/manifest.tsv")]
def one(row):
    name, orig, loc, desc = row
    ov = f"{here}/mutants/{name}.json"
    json.dump({"Replace": {orig: f"{here}/mutants/{name}"}}, open(ov, "w"))
    _, failed, bf, panic, rc = gotest_all(ov, alltests)
    st = "compile" if bf else "timeout" if panic else "killed" if (failed or rc) else "lived"
    return name, dict(loc=loc, desc=desc, status=st, killers=sorted(failed))
with cf.ThreadPoolExecutor(8) as ex:
    res = dict(ex.map(one, rows))
kills = collections.defaultdict(set)
for m, r in res.items():
    for t in r["killers"]: kills[t].add(m)
out = []
st = collections.Counter(r["status"] for r in res.values())
out.append(f"{pkg}: {len(alltests)} tests, {len(res)} mutants: {dict(st)}")
out.append("\nkills uniq subsumed-by  test")
for t in sorted(alltests, key=lambda t: (len(kills[t]), t)):
    uniq = sum(1 for m in kills[t] if len(res[m]["killers"]) == 1)
    sup = [u for u in alltests if u != t and kills[t] and kills[t] <= kills[u]]
    out.append(f"{len(kills[t]):5d} {uniq:4d} {len(sup):3d} {t}" + (f"  (e.g. {min(sup, key=lambda u: len(kills[u]))})" if sup else ""))
out.append("\nlived:")
for m, r in sorted(res.items()):
    if r["status"] == "lived": out.append(f"  {m} {r['loc']} {r['desc']}")
out.append("\ntimeouts (killed by hang, killer unknown):")
for m, r in sorted(res.items()):
    if r["status"] == "timeout": out.append(f"  {m} {r['loc']} {r['desc']}")
json.dump(dict(tests=sorted(alltests), res=res), open(here + "/results.json", "w"), indent=1)
open(here + "/report.txt", "w").write("\n".join(out) + "\n"); print("\n".join(out))
