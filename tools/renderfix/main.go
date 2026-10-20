//go:build renderfix

// Command renderfix records the render-test fixtures from the daemon
// (kb:adr/process-render-fixtures-generated-from-daemon).
//
//	go run -tags renderfix ./tools/renderfix gen    # write every fixture whose content changed
//	go run -tags renderfix ./tools/renderfix check  # fail naming any stale or missing fixture (make check)
//	go run -tags renderfix ./tools/renderfix list   # print the scenario names
package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Zalaras/muster/internal/server"
)

// fixturesDir is where the fixtures live, relative to the repo root.
const fixturesDir = "web/render/fixtures"

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "renderfix:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	if len(args) != 1 {
		return errors.New("usage: renderfix <gen|check|list>")
	}
	if args[0] == "list" {
		for _, name := range server.RenderScenarioNames() {
			fmt.Fprintln(stdout, name)
		}
		return nil
	}
	root, err := repoRoot()
	if err != nil {
		return err
	}
	dir := filepath.Join(root, fixturesDir)
	switch args[0] {
	case "gen":
		return cmdGen(context.Background(), dir, stdout)
	case "check":
		return cmdCheck(context.Background(), dir, stdout)
	default:
		return fmt.Errorf("unknown subcommand %q (want gen, check or list)", args[0])
	}
}

// repoRoot returns the current directory, verifying go.mod is present there.
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

func fixturePath(dir, name string) string { return filepath.Join(dir, name+".json") }

type generated struct {
	name string
	data []byte
	err  error
}

// generateAll drives every scenario concurrently (each on its own Server, store and
// temp root) and returns them in scenario order. Scenarios pace their steps into
// distinct wall-clock seconds, so run one after another they would take tens of seconds.
func generateAll(ctx context.Context) ([]generated, error) {
	names := server.RenderScenarioNames()
	out := make([]generated, len(names))
	var wg sync.WaitGroup
	for i, name := range names {
		wg.Add(1)
		go func() {
			defer wg.Done()
			data, err := server.GenerateRenderFixture(ctx, name)
			out[i] = generated{name: name, data: data, err: err}
		}()
	}
	wg.Wait()
	for _, g := range out {
		if g.err != nil {
			return nil, g.err
		}
	}
	return out, nil
}

// cmdGen writes each fixture whose content differs from the file on disk and prints
// what it wrote.
func cmdGen(ctx context.Context, dir string, stdout io.Writer) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	all, err := generateAll(ctx)
	if err != nil {
		return err
	}
	for _, g := range all {
		want := g.data
		path := fixturePath(dir, g.name)
		have, err := os.ReadFile(path)
		if err == nil && bytes.Equal(have, want) {
			continue
		}
		if err := os.WriteFile(path, want, 0o644); err != nil {
			return err
		}
		fmt.Fprintf(stdout, "wrote %s\n", path)
	}
	return nil
}

// cmdCheck regenerates every fixture in memory and compares it byte for byte with the
// file on disk, naming each stale, missing or unexpected file.
func cmdCheck(ctx context.Context, dir string, stdout io.Writer) error {
	var problems []string
	expected := map[string]bool{}
	all, err := generateAll(ctx)
	if err != nil {
		return err
	}
	for _, g := range all {
		expected[g.name+".json"] = true
		want := g.data
		path := fixturePath(dir, g.name)
		have, readErr := os.ReadFile(path)
		switch {
		case errors.Is(readErr, os.ErrNotExist):
			problems = append(problems, "missing: "+path)
		case readErr != nil:
			return readErr
		case !bytes.Equal(have, want):
			problems = append(problems, "stale: "+path)
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".json") && !expected[e.Name()] {
			problems = append(problems, "unexpected: "+filepath.Join(dir, e.Name()))
		}
	}
	if len(problems) == 0 {
		fmt.Fprintf(stdout, "render fixtures up to date (%d scenarios)\n", len(expected))
		return nil
	}
	return fmt.Errorf("render fixtures out of date:\n  %s\nrun `make gen-render-fixtures`", strings.Join(problems, "\n  "))
}
