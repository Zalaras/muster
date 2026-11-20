// Command runs serves a local page showing every /orchestrate run and /fix sweep across the
// repository's worktrees, read from their orchestration-state.json and sweep-state.json and
// pushed to the page whenever one changes — progress without asking a session.
//
//	make runs                        # the same, opened in the default browser
//	go run ./tools/runs              # http://127.0.0.1:7390
//	go run ./tools/runs -addr :7391 -stale 45m -done 10
//
// Read-only: it never writes a state file, never talks to musterd and never launches claude.
package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:7390", "listen address")
	root := flag.String("root", ".", "any checkout of the repository")
	stale := flag.Duration("stale", 30*time.Minute, "flag an in-progress run with no state write or file change for this long")
	every := flag.Duration("poll", 2*time.Second, "how often to rescan the state files")
	done := flag.Int("done", 6, "how many finished runs to list")
	openB := flag.Bool("open", false, "open the page in the default browser once listening")
	flag.Parse()

	start, err := worktrees(*root)
	if err != nil || len(start) == 0 {
		fmt.Fprintf(os.Stderr, "runs: %s is not a git checkout: %v\n", *root, err)
		os.Exit(1)
	}
	home, _ := os.UserHomeDir()
	ledger := newLedger(filepath.Join(home, ".claude", "projects"), start[0].Path)
	scan := func() Snapshot {
		trees, _ := worktrees(*root)
		return Scan(trees, Env{Now: time.Now(), Stale: *stale, Done: *done,
			Alive: pidAlive, Activity: treeActivity, Usage: latestUsage, Tokens: ledger})
	}
	h := newHub()
	h.publish(scan()) // the first page load never sees an empty snapshot
	go h.poll(scan, *every, nil)
	ln, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", *addr)
	if err != nil {
		fmt.Fprintln(os.Stderr, "runs:", err)
		os.Exit(1)
	}
	url := "http://" + ln.Addr().String()
	fmt.Println("runs:", url)
	if *openB {
		_, _ = output("open", url)
	}
	srv := &http.Server{Handler: h.routes(), ReadHeaderTimeout: 5 * time.Second}
	if err := srv.Serve(ln); err != nil {
		fmt.Fprintln(os.Stderr, "runs:", err)
		os.Exit(1)
	}
}
