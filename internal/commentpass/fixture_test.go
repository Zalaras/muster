package commentpass

import (
	"bytes"
	"context"
	"encoding/json"
	"go/format"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const (
	mainAGo = `// Package a is the fixture.
package a

import "fmt"

// Helper does x.
func Helper() {}

// Keep stays.
func Keep() int {
	x := 1 // pre-existing trailing
	// about to be edited
	// second line
	return x
}

func Use() { fmt.Println(Keep()) }
`
	branchAGo = `// Package a is the fixture.
package a

import "fmt"

// Keep stays.
func Keep() int {
	// leading block line one
	// leading block line two
	x := 1 // pre-existing trailing
	// edited first line
	// second line
	y := x + 1 // added trailing
	return y
}

// NewFn is new.
func NewFn() int {
	return 2 //nolint:mnd // reason
}

func Use() { fmt.Println(Keep(), NewFn()) }
`
	mainBGo = `package b

// uses Helper to do x
func Other() {}
`
	mainMainGo = `package main

func main() {}
`
	aTestGo = `package a

// test comment should be ignored
func TestNothing() {}
`
	embedGo = `package a

//go:embed assets
var assets string
`
	mainAppTS = `/** Pre-existing JSDoc */
export function keep(): string {
  const proto = "http";
  const host = "x";
  return ` + "`${proto}//${host}`" + ` + "http://x";
}
`
	branchAppTS = mainAppTS + `
// added ts comment
// biome-ignore lint/suspicious/noExplicitAny: why
export const anyish: any = 1;

/** doc on newFn */
export function newFn(): number {
  // @ts-expect-error
  return 2 + "x"; // added trailing ts
}
`
	appTestTS = `// test comment ignored
export const t = 1;
`
	untrackedCGo = `package c

// NewThing is untracked.
func NewThing() int {
	return 1 // trailing in untracked
}
`
)

func gitFx(t *testing.T, dir string, args ...string) string {
	t.Helper()
	if len(args) > 0 && args[0] == "commit" {
		args = append([]string{"-c", "user.email=bob@example.com", "-c", "user.name=bob"}, args...)
	}
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	require.NoErrorf(t, err, "git %v: %s", args, out)
	return string(out)
}

func writeFx(t *testing.T, root, rel, content string) {
	t.Helper()
	path := filepath.Join(root, rel)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte(content), 0o644))
	if strings.HasSuffix(rel, ".go") {
		formatted, err := format.Source([]byte(content))
		require.NoError(t, err, rel)
		require.Equal(t, content, string(formatted), "%s must be gofmt-clean so keep-all is a fixed point", rel)
	}
}

func readFx(t *testing.T, root, rel string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(root, rel))
	require.NoError(t, err)
	return string(b)
}

func testRun(ctx context.Context, dir, name string, args ...string) ([]byte, []byte, error) {
	if name == "git" && len(args) > 0 && args[0] == "commit" {
		args = append([]string{"-c", "user.email=bob@example.com", "-c", "user.name=bob"}, args...)
	}
	return realRun(ctx, dir, name, args...)
}

func newPass(t *testing.T, root string) (*Pass, *bytes.Buffer) {
	t.Helper()
	var out bytes.Buffer
	p := &Pass{
		Root:     root,
		Plan:     "x",
		Run:      testRun,
		FormatTS: func(context.Context, string, []string) error { return nil },
		Now:      func() time.Time { return time.Date(2026, 10, 6, 12, 0, 0, 0, time.UTC) },
		Stdout:   &out,
	}
	return p, &out
}

// initMain builds the main-branch tree every fixture shares.
func initMain(t *testing.T) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	gitFx(t, root, "init", "-q", "-b", "main")
	writeFx(t, root, "go.mod", "module fixture\n")
	writeFx(t, root, "internal/a/a.go", mainAGo)
	writeFx(t, root, "internal/a/a_test.go", aTestGo)
	writeFx(t, root, "internal/b/b.go", mainBGo)
	writeFx(t, root, "cmd/m/main.go", mainMainGo)
	writeFx(t, root, "web/src/app.ts", mainAppTS)
	writeFx(t, root, "web/src/app.test.ts", appTestTS)
	gitFx(t, root, "add", "-A")
	gitFx(t, root, "commit", "-q", "-m", "main")
	gitFx(t, root, "checkout", "-q", "-b", "plan/x")
	return root
}

// newFixture is main plus the plan/x branch that adds every comment class the pass must
// tell apart, with one untracked file.
func newFixture(t *testing.T) (*Pass, *bytes.Buffer, string) {
	t.Helper()
	root := initMain(t)
	writeFx(t, root, "internal/a/a.go", branchAGo)
	writeFx(t, root, "internal/a/embed.go", embedGo)
	writeFx(t, root, "web/src/app.ts", branchAppTS)
	gitFx(t, root, "add", "-A")
	gitFx(t, root, "commit", "-q", "-m", "branch")
	writeFx(t, root, "internal/c/new.go", untrackedCGo)
	p, out := newPass(t, root)
	return p, out, root
}

// newDirectiveOnlyFixture adds nothing but a nolint line on the branch.
func newDirectiveOnlyFixture(t *testing.T) (*Pass, *bytes.Buffer, string) {
	t.Helper()
	root := initMain(t)
	writeFx(t, root, "internal/b/b.go", "package b\n\n// uses Helper to do x\nfunc Other() {}\n\nfunc Also() int {\n\treturn 1 //nolint:mnd // fixture\n}\n")
	gitFx(t, root, "commit", "-q", "-am", "branch")
	p, out := newPass(t, root)
	return p, out, root
}

func strip(t *testing.T, p *Pass) (string, *Manifest) {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, p.Strip(context.Background(), dir, false))
	return dir, readManifest(t, dir)
}

func readManifest(t *testing.T, dir string) *Manifest {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, "candidates.json"))
	require.NoError(t, err)
	var m Manifest
	require.NoError(t, json.Unmarshal(b, &m))
	return &m
}

func allIDs(m *Manifest) []string {
	var ids []string
	for _, f := range m.Files {
		for _, c := range f.Candidates {
			ids = append(ids, c.ID)
		}
	}
	return ids
}

func candidateByID(m *Manifest, id string) Candidate {
	for _, f := range m.Files {
		for _, c := range f.Candidates {
			if c.ID == id {
				return c
			}
		}
	}
	return Candidate{}
}

func writeVerdicts(t *testing.T, dir string, v Verdicts) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	path := filepath.Join(dir, "verdicts.json")
	require.NoError(t, os.WriteFile(path, b, 0o644))
	return path
}

func keepAll(m *Manifest) Verdicts {
	var v Verdicts
	for _, id := range allIDs(m) {
		v.Keep = append(v.Keep, KeepVerdict{ID: id, Reason: "fixture keeps " + id})
	}
	return v
}

func dropAll(m *Manifest) Verdicts {
	return Verdicts{Drop: allIDs(m)}
}

func lineOf(t *testing.T, content, substr string) int {
	t.Helper()
	i := strings.Index(content, substr)
	require.GreaterOrEqual(t, i, 0, "substring %q not found", substr)
	return strings.Count(content[:i], "\n") + 1
}

func headFiles(t *testing.T, root string) []string {
	t.Helper()
	return strings.Fields(gitFx(t, root, "show", "--name-only", "--format=", "HEAD"))
}
