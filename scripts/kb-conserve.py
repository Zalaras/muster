#!/usr/bin/env python3
"""kb-conserve.py <history-file>... [--range YYYY-MM-DD..YYYY-MM-DD]

Proves a frozen history file was fully migrated into knowledge records: every unit in it
carries a marker naming the records it produced, or an explicit no-decision / no-fact
marker, and every named record exists on disk.

Markers (HTML comments, so the history text renders unchanged):
    <!-- kb: adr/slug, adr/other -->      the unit produced these records
    <!-- kb: fact/slug -->
    <!-- kb:no-decision -->               read and judged: nothing decided here
    <!-- kb:no-fact -->                   read and judged: nothing measured here

Units per file, by path suffix:
    spec-changelog.md      each "### YYYY-MM-DD — ..." entry; marker on the next non-blank line
    interview-notes.md     each table row under "## Rejected options"; marker in the last cell
    protocol-changelog.md  each "- **" bullet; marker at the end of the bullet's last line
    todo-done.md           each "## " heading; marker on the next non-blank line
    canary-fields.md       each table row and each "- " bullet under a "## "; marker at the end

Exit 1 on any unit without a marker or any dangling record id. A no-decision unit whose text
reads as decision-bearing is a WARN, never a failure. Run by hand per migration batch and
once over every history file at the end; deliberately not part of make check, because the
files it reads are frozen once the migration lands.
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(ROOT)

MARKER_RE = re.compile(r"<!-- kb: ((?:adr|fact)/[a-z0-9][a-z0-9-]*(?:, (?:adr|fact)/[a-z0-9][a-z0-9-]*)*) -->|<!-- kb:no-(decision|fact) -->")
DECISION_WORDS = re.compile(r"\*\*[^*]+\*\*.*\b(chosen|decided|rejected|instead of|option [AB]|settled|we (?:keep|drop|use))\b", re.I)
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
TYPE_DIR = {"adr": "docs/adr", "fact": "docs/facts"}


def units_for(path, lines):
    """Yield (label, date, text) per unit; text is the unit's lines joined, including the
    line where its marker is expected."""
    name = os.path.basename(path)
    if name == "spec-changelog.md":
        yield from heading_units(lines, r"^### (\d{4}-\d{2}-\d{2})")
    elif name == "todo-done.md":
        yield from heading_units(lines, r"^## ")
    elif name == "interview-notes.md":
        yield from table_rows(lines, start_after=r"^## Rejected options")
    elif name == "protocol-changelog.md":
        yield from bullet_units(lines, r"^- \*\*")
    elif name == "canary-fields.md":
        yield from canary_units(lines)
    else:
        sys.exit(f"kb-conserve: no unit rule for {path}")


def heading_units(lines, head_re):
    head = re.compile(head_re)
    starts = [i for i, l in enumerate(lines) if head.match(l)]
    for n, i in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        m = DATE_RE.search(lines[i])
        yield lines[i].strip("# ").strip(), (m.group(1) if m else None), "\n".join(lines[i:end])


def bullet_units(lines, bullet_re):
    bullet = re.compile(bullet_re)
    starts = [i for i, l in enumerate(lines) if bullet.match(l)]
    for n, i in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        # a bullet ends at the next blank line or the next bullet
        j = i + 1
        while j < end and lines[j].strip() and not lines[j].startswith("## "):
            j += 1
        m = DATE_RE.search(lines[i])
        yield lines[i][:80].strip(), (m.group(1) if m else None), "\n".join(lines[i:j])


def table_rows(lines, start_after):
    start = re.compile(start_after)
    active = False
    for l in lines:
        if start.match(l):
            active = True
            continue
        if active and l.startswith("## "):
            active = False
        if active and l.startswith("| ") and not re.match(r"^\|\s*-+", l) and not l.startswith("| Option"):
            yield l[:80].strip(), None, l


def canary_units(lines):
    in_section = False
    fenced = False
    for l in lines:
        if l.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        if l.startswith("## "):
            in_section = True
            continue
        if not in_section:
            continue
        if l.startswith("| ") and not re.match(r"^\|\s*-+", l) and not re.match(r"^\| (field|event|version|key|flag|hook|Field|Event)\b", l):
            yield l[:80].strip(), None, l
        elif l.startswith("- "):
            yield l[:80].strip(), None, l


def in_range(date, rng):
    if not rng or not date:
        return True
    lo, hi = rng
    return lo <= date <= hi


def main(argv):
    rng = None
    files = []
    it = iter(argv)
    for a in it:
        if a == "--range":
            lo, hi = next(it).split("..")
            rng = (lo, hi)
        else:
            files.append(a)
    if not files:
        sys.exit(__doc__.strip().splitlines()[0])
    fails = warns = n_units = n_ids = n_no = 0
    for path in files:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().split("\n")
        for label, date, text in units_for(path, lines):
            if not in_range(date, rng):
                continue
            n_units += 1
            markers = MARKER_RE.findall(text)
            if not markers:
                print(f"FAIL  {path}: no marker: {label}")
                fails += 1
                continue
            for ids, no in markers:
                if no:
                    n_no += 1
                    if DECISION_WORDS.search(text):
                        print(f"WARN  {path}: no-{no} unit looks decision-bearing: {label}")
                        warns += 1
                    continue
                for tok in ids.split(", "):
                    typ, slug = tok.split("/", 1)
                    n_ids += 1
                    rec = os.path.join(TYPE_DIR[typ], slug + ".md")
                    if not os.path.isfile(rec):
                        print(f"FAIL  {path}: dangling {tok} in: {label} ({rec} does not exist)")
                        fails += 1
    print(f"kb-conserve: {n_units} units, {n_ids} records referenced, {n_no} no-decision/no-fact, {warns} warnings, {fails} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
