// Command versions keeps internal/claudecode/observed_versions.txt and the generated
// fragments in README.md and docs/claude-code-versions.md in sync
// (docs/claude-code-versions.md "The green ritual").
//
//	go run ./tools/versions gen    # rewrite every fragment from the on-disk record
//	go run ./tools/versions check  # fail naming any stale or markerless file (make check)
//	go run ./tools/versions bump   # after a green `make canary`: record the installed
//	                                # version if it fell outside the range, then gen
//
// It reads the record from disk, not the embedded copy: `go run` compiles this tool
// before bump appends a row, so an embedded read would render the pre-append range.
package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/Zalaras/muster/internal/claudecode"
)

// recordPath is internal/claudecode/observed_versions.txt, relative to the repo root —
// the one file this tool ever writes a version row to.
const recordPath = "internal/claudecode/observed_versions.txt"

// fragmentFiles are the docs gen/check rewrite/validate, relative to the repo root.
var fragmentFiles = []string{
	"README.md",
	"docs/claude-code-versions.md",
}

// offlineEnv mirrors test/canary's MUSTER_CANARY_OFFLINE: bump never records or edits
// anything under it (INV-4).
const offlineEnv = "MUSTER_CANARY_OFFLINE"

// runFunc runs an external command in dir and returns its combined output — an
// injectable seam (docs/conventions.md §Testing: "never a $PATH shim") so bump's git
// calls are testable without a real git repo.
type runFunc func(ctx context.Context, dir, name string, args ...string) ([]byte, error)

func realRun(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	return cmd.CombinedOutput()
}

func main() {
	if err := run(os.Args[1:], os.Stdout, realRun); err != nil {
		fmt.Fprintln(os.Stderr, "versions:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer, runCmd runFunc) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: versions <gen|check|bump>")
	}
	root, err := repoRoot()
	if err != nil {
		return err
	}
	switch args[0] {
	case "gen":
		return cmdGen(root, stdout)
	case "check":
		return cmdCheck(root, stdout)
	case "bump":
		return cmdBump(context.Background(), root, stdout, runCmd, "claude")
	default:
		return fmt.Errorf("unknown subcommand %q (want gen, check or bump)", args[0])
	}
}

// repoRoot returns the current directory, verifying go.mod is present there — the
// Makefile always runs this tool from the repo root, and a clear error here is better
// than a confusing "file not found" on the record path.
func repoRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getting working directory: %w", err)
	}
	if _, err := os.Stat(filepath.Join(cwd, "go.mod")); err != nil {
		return "", fmt.Errorf("must run from the repo root (no go.mod in %s)", cwd)
	}
	return cwd, nil
}

// readRecord reads and parses the on-disk record (never the embedded copy — see the
// package doc).
func readRecord(root string) ([]claudecode.ObservedVersion, error) {
	path := filepath.Join(root, recordPath)
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", recordPath, err)
	}
	defer func() { _ = f.Close() }()

	rows, err := claudecode.ParseObservedVersions(f)
	if err != nil {
		return nil, fmt.Errorf("parsing %s: %w", recordPath, err)
	}
	return rows, nil
}

// renderFragments computes every named fragment's rendered value from rows.
func renderFragments(rows []claudecode.ObservedVersion) map[string]string {
	floor, verified := claudecode.RangeOf(rows)
	return map[string]string{
		"range":    claudecode.FormatRange(floor, verified),
		"floor":    floor,
		"verified": verified,
		// The table fragment sits on its own lines (Implementation Notes), unlike the
		// inline range/floor/verified fragments: applyFragments discards whatever
		// whitespace previously sat between the markers, so the leading/trailing
		// newline has to be part of the rendered value itself, or the closing marker
		// would land on the table's last row and the opening marker on its header row
		// — breaking GFM table detection, which requires each row on its own line.
		"table": "\n" + renderTable(rows) + "\n",
	}
}

// renderTable renders the markdown table fragment, sorted ascending by version — the
// record file itself is append-only and need not be sorted (Implementation Notes).
func renderTable(rows []claudecode.ObservedVersion) string {
	sorted := make([]claudecode.ObservedVersion, len(rows))
	copy(sorted, rows)
	sort.Slice(sorted, func(i, j int) bool {
		return versionLess(sorted[i].Version, sorted[j].Version)
	})

	var b strings.Builder
	b.WriteString("| version | verified on | run |\n")
	b.WriteString("| --- | --- | --- |\n")
	for _, row := range sorted {
		fmt.Fprintf(&b, "| %s | %s | %s |\n", row.Version, row.Date, row.Note)
	}
	return strings.TrimRight(b.String(), "\n")
}

// versionLess compares two already-validated "major.minor.patch" strings (every row in
// the record has passed claudecode.ParseObservedVersions, so a plain numeric split
// suffices — no need to duplicate claudecode's unexported semver comparator here).
func versionLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := range 3 {
		if pa[i] != pb[i] {
			// Numeric compare by length-then-lexical avoids a strconv import for a
			// three-field, already-validated split.
			if len(pa[i]) != len(pb[i]) {
				return len(pa[i]) < len(pb[i])
			}
			return pa[i] < pb[i]
		}
	}
	return false
}

// fragmentOpenRE matches one opening marker, e.g. "<!-- versions:range -->".
var fragmentOpenRE = regexp.MustCompile(`<!-- versions:(\w+) -->`)

// applyFragments replaces every `<!-- versions:NAME -->...<!-- /versions:NAME -->` block
// in content with fragments[NAME], scanning left to right so adjacent or nested-looking
// blocks cannot swallow each other. count is how many blocks were found and replaced.
//
// Go's regexp package (RE2) has no backreferences, so unlike the single-regex sketch this
// tool was first drafted against, each opening marker's matching closer is located by
// name explicitly (measured: regexp.Compile on a `\1` backreference pattern fails with
// "invalid escape sequence: `\1`") — same non-greedy, name-matched behaviour, expressible
// in RE2.
func applyFragments(content string, fragments map[string]string) (string, int, error) {
	var b strings.Builder
	count := 0
	rest := content
	consumedTotal := 0

	for {
		loc := fragmentOpenRE.FindStringSubmatchIndex(rest)
		if loc == nil {
			b.WriteString(rest)
			break
		}
		name := rest[loc[2]:loc[3]]
		openEnd := loc[1]
		closer := "<!-- /versions:" + name + " -->"
		closeIdx := strings.Index(rest[openEnd:], closer)
		if closeIdx == -1 {
			return "", 0, fmt.Errorf("fragment %q at offset %d has no matching closing marker", name, consumedTotal+loc[0])
		}
		val, ok := fragments[name]
		if !ok {
			return "", 0, fmt.Errorf("unknown fragment name %q at offset %d", name, consumedTotal+loc[0])
		}

		b.WriteString(rest[:loc[0]])
		b.WriteString("<!-- versions:" + name + " -->")
		b.WriteString(val)
		b.WriteString(closer)
		count++

		consumed := openEnd + closeIdx + len(closer)
		consumedTotal += consumed
		rest = rest[consumed:]
	}
	return b.String(), count, nil
}

// renderFile applies fragments to the file at root/rel and returns the rendered content
// plus how many fragment blocks it found. Errors if the file carries no fragment at all.
func renderFile(root, rel string, fragments map[string]string) (rendered string, count int, err error) {
	path := filepath.Join(root, rel)
	data, err := os.ReadFile(path)
	if err != nil {
		return "", 0, fmt.Errorf("reading %s: %w", rel, err)
	}
	rendered, count, err = applyFragments(string(data), fragments)
	if err != nil {
		return "", 0, fmt.Errorf("%s: %w", rel, err)
	}
	if count == 0 {
		return "", 0, fmt.Errorf("%s: carries no versions fragment marker", rel)
	}
	return rendered, count, nil
}

func cmdGen(root string, stdout io.Writer) error {
	rows, err := readRecord(root)
	if err != nil {
		return err
	}
	fragments := renderFragments(rows)

	for _, rel := range fragmentFiles {
		rendered, _, err := renderFile(root, rel, fragments)
		if err != nil {
			return err
		}
		path := filepath.Join(root, rel)
		original, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		if rendered == string(original) {
			continue
		}
		if err := os.WriteFile(path, []byte(rendered), 0o644); err != nil {
			return fmt.Errorf("writing %s: %w", rel, err)
		}
	}
	fmt.Fprintln(stdout, "versions: regenerated fragments")
	return nil
}

func cmdCheck(root string, stdout io.Writer) error {
	rows, err := readRecord(root)
	if err != nil {
		return err
	}
	fragments := renderFragments(rows)

	var stale []string
	for _, rel := range fragmentFiles {
		rendered, _, err := renderFile(root, rel, fragments)
		if err != nil {
			return err
		}
		original, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			return fmt.Errorf("reading %s: %w", rel, err)
		}
		if rendered != string(original) {
			stale = append(stale, rel)
		}
	}
	if len(stale) > 0 {
		return fmt.Errorf("stale generated fragments in: %s (run `go run ./tools/versions gen`)", strings.Join(stale, ", "))
	}
	fmt.Fprintln(stdout, "versions: all fragments fresh")
	return nil
}

// cmdBump is the tail of `make canary` (Makefile): after a green `go test`, record the
// installed version if it fell outside the observed range, then regenerate. claudeBin is
// the `claude` binary to query for its version — an injectable seam (docs/conventions.md
// §Testing: "never a $PATH shim"), the same pattern as musterd's -claude-bin flag: a test
// points it at an absolute path to a stub script instead of mutating PATH globally, so
// nothing here forks the real, installed claude.
func cmdBump(ctx context.Context, root string, stdout io.Writer, runCmd runFunc, claudeBin string) error {
	if os.Getenv(offlineEnv) != "" {
		fmt.Fprintf(stdout, "versions: %s is set; not checking for a version to record\n", offlineEnv)
		return nil
	}

	installed, err := claudecode.InstalledVersion(ctx, claudeBin)
	if err != nil {
		return fmt.Errorf("determining installed claude version: %w", err)
	}

	rows, err := readRecord(root)
	if err != nil {
		return err
	}
	floor, verified := claudecode.RangeOf(rows)
	status := claudecode.ClassifyAgainst(installed, rows)
	if status == claudecode.StatusVerified {
		fmt.Fprintf(stdout, "versions: %s is inside the verified range (%s); nothing to record\n",
			installed, claudecode.FormatRange(floor, verified))
		return nil
	}

	out, err := runCmd(ctx, root, "git", "status", "--porcelain", "--", recordPath)
	if err != nil {
		return fmt.Errorf("git status %s: %w: %s", recordPath, err, out)
	}
	if strings.TrimSpace(string(out)) != "" {
		return fmt.Errorf("refusing to record %s: %s has uncommitted changes — commit or revert them first", installed, recordPath)
	}

	if appendErr := appendRow(root, installed, time.Now().Format("2006-01-02")); appendErr != nil {
		return appendErr
	}
	if genErr := cmdGen(root, stdout); genErr != nil {
		return genErr
	}

	diff, err := runCmd(ctx, root, "git", "diff", "--stat")
	if err != nil {
		return fmt.Errorf("git diff --stat: %w: %s", err, diff)
	}
	fmt.Fprint(stdout, string(diff))
	fmt.Fprintf(stdout, "versions: recorded %s as verified by make canary — commit with:\n  git commit -am \"fix(versions): record Claude Code %s as verified by make canary\"\n",
		installed, installed)
	return nil
}

// appendRow appends "<version> <date> make canary" to the on-disk record, newline
// terminated (Implementation Notes "bump sequence").
func appendRow(root, version, date string) error {
	path := filepath.Join(root, recordPath)
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("reading %s: %w", recordPath, err)
	}
	if len(data) > 0 && data[len(data)-1] != '\n' {
		data = append(data, '\n')
	}
	data = append(data, []byte(fmt.Sprintf("%s %s make canary\n", version, date))...)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("writing %s: %w", recordPath, err)
	}
	return nil
}
