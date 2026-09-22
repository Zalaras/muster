#!/usr/bin/env python3
"""S10 — event-based rebase replay.
For every real merge on <target> whose parents conflict under merge-tree, simulate the branch
having been rebased onto <target> every time <target> moved (each first-parent commit between
the merge base and the merge's first parent). The branch is treated as its squashed diff.
At each step: merge-tree(--merge-base=prev_base, new_base, branch_on_prev_base). Clean => the
branch now sits on new_base. Conflict => record the event (files, hunks, lines); to keep
walking we "resolve" by taking the real merge commit's version of each conflicted file
(approximation, flagged). Output one row per merge: final conflict size vs first-event size,
number of events, and whether any event would have been avoided.
Usage: rebase-replay.py <repo> <target> <real-merges.tsv> > replay.tsv
"""
import subprocess, sys, csv, re
R, T, TSV = sys.argv[1], sys.argv[2], sys.argv[3]
POLICY = sys.argv[4] if len(sys.argv)>4 else "real"   # real | theirs
def git(*a, check=True, inp=None):
    p = subprocess.run(["git","-C",R,*a], capture_output=True, text=True, input=inp)
    if check and p.returncode not in (0,1): raise RuntimeError(p.stderr)
    return p
def mt(base, a, b):
    p = git("merge-tree","--write-tree",f"--merge-base={base}",a,b, check=False)
    lines = p.stdout.splitlines(); tree = lines[0] if lines else None
    if p.returncode == 0: return tree, []
    files = sorted({l.split("\t",1)[1] for l in lines[1:] if re.match(r"^\d+ [0-9a-f]+ [123]\t", l)})
    return tree, files
def size(tree, files):
    hunks=lines=0
    for f in files:
        raw = subprocess.run(["git","-C",R,"show",f"{tree}:{f}"], capture_output=True).stdout
        s = raw.decode("utf-8", errors="replace").splitlines()
        inb=False
        for l in s:
            if l.startswith("<<<<<<<"): hunks+=1; inb=True
            elif l.startswith(">>>>>>>"): inb=False
            elif inb and not l.startswith("======="): lines+=1
    return hunks, lines
def commit(tree, parent, msg="replay"):
    return git("commit-tree", tree, "-p", parent, "-m", msg).stdout.strip()
def resolve_with_real(tree, files, real, theirs=None):
    src = theirs if POLICY=="theirs" else real
    # build a tree = merge tree with conflicted files replaced by the real merge's version
    git("read-tree", "--empty", check=False)
    idx = git("ls-tree","-r",tree).stdout.splitlines()
    entries=[]
    for l in idx:
        mode_type_sha, path = l.split("\t",1); mode,_,sha = mode_type_sha.split()
        if path in files:
            p = git("rev-parse", f"{src}:{path}", check=False)
            if p.returncode==0: sha = p.stdout.strip()
            else: continue  # deleted in real merge
        entries.append(f"{mode} {sha}\t{path}")
    git("update-index","--index-info", inp="\n".join(f"{e.split()[0]} blob {e.split()[1]}\t{e.split(chr(9),1)[1]}" for e in entries)+"\n")
    return git("write-tree").stdout.strip()
out = csv.writer(sys.stdout, delimiter="\t")
out.writerow(["merge","steps","span_days","final_files","final_hunks","final_lines","events","first_step","first_files","first_hunks","first_lines","sum_event_hunks","sum_event_lines","verdict","final_file_list","policy"])
env_index = subprocess.os.environ.copy()
for r in csv.DictReader(open(TSV), delimiter="\t"):
    if r["mt_status"] != "conflict": continue
    m, p1, p2, base = r["merge"], r["p1"], r["p2"], r["base"]
    tree, files = mt(base, p1, p2); fh, fl = size(tree, files)
    path = git("rev-list","--first-parent","--reverse",f"{base}..{p1}").stdout.split()
    if not path: continue
    d0 = git("log","-1","--format=%ct",base).stdout.strip(); d1 = git("log","-1","--format=%ct",p1).stdout.strip()
    span = round((int(d1)-int(d0))/86400,1)
    # branch on base = p2's tree as a commit on base
    cur = commit(git("rev-parse", f"{p2}^{{tree}}").stdout.strip(), base)
    prev = base; events=[]; first=None
    for i, d in enumerate(path, 1):
        t, cf = mt(prev, d, cur)
        if cf:
            h, l = size(t, cf); events.append((i, len(cf), h, l))
            if first is None: first=(i, len(cf), h, l)
            t = resolve_with_real(t, cf, m, theirs=d)
        cur = commit(t, d); prev = d
    if not events: verdict="DISAPPEARS (no step conflicts)"
    else:
        sh = sum(e[2] for e in events); sl = sum(e[3] for e in events)
        if first[2] < fh or (first[2]==fh and first[3] < fl): verdict="SHRINKS (first event smaller)"
        elif sh > fh or sl > fl: verdict="WORSE (more total conflict across events)"
        else: verdict="SAME"
    out.writerow([m, len(path), span, len(files), fh, fl, len(events), first[0] if first else "-", first[1] if first else "-", first[2] if first else "-", first[3] if first else "-", sum(e[2] for e in events), sum(e[3] for e in events), verdict, ",".join(files)[:80], POLICY])
