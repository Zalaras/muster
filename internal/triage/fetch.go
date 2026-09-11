package triage

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// RunFunc is the injectable subprocess seam (docs/conventions.md §Testing: "never a
// $PATH shim"), so every case below is unit-testable with canned JSON.
//
// It keeps stdout and stderr apart, unlike tools/versions' CombinedOutput equivalent:
// gh writes progress and warnings to stderr, and merging them would splice non-JSON
// into the document being decoded.
type RunFunc func(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error)

// Issue is the allowlisted view of a GitHub issue. Assembled by explicit copy rather
// than by unmarshalling a whole object and removing keys — the same discipline
// internal/server/issue.go applies to the outbound snapshot, for the same reason:
// subtraction silently admits every field added upstream later.
//
// Every string field is attacker-controlled. Number and the association are the only
// values here that GitHub itself asserts.
type Issue struct {
	Number            int
	CreatedAt         string
	UserLogin         string
	AuthorAssociation string
	Title             string
	Body              string
	State             string
}

// Fetcher reads open issues through the gh CLI. docs/conventions.md settles the choice:
// os/exec plus the gh CLI, never a Go GitHub library.
type Fetcher struct {
	Run  RunFunc
	Repo string // "owner/name"
}

// ghIssue is the wire shape. Only the fields below are ever read.
type ghIssue struct {
	Number            int    `json:"number"`
	CreatedAt         string `json:"created_at"`
	Title             string `json:"title"`
	Body              string `json:"body"`
	AuthorAssociation string `json:"author_association"`
	State             string `json:"state"`
	User              *struct {
		Login string `json:"login"`
	} `json:"user"`
	// Presence alone matters: the REST issues endpoint returns pull requests too, and
	// unlike `gh issue list` it does not filter them out.
	PullRequest json.RawMessage `json:"pull_request"`
}

// ListOpen returns every open issue, pull requests excluded.
func (f *Fetcher) ListOpen(ctx context.Context) ([]Issue, error) {
	return f.List(ctx, "open")
}

// List returns issues in the given state ("open", "closed" or "all"), pull requests
// excluded. The audit needs closed ones to spot an entry ticked while its issue is open.
func (f *Fetcher) List(ctx context.Context, state string) ([]Issue, error) {
	path := fmt.Sprintf("repos/%s/issues?state=%s&per_page=100", f.Repo, state)
	// --slurp is not optional with --paginate: without it gh concatenates each page's
	// raw array, and the result is not a single JSON document.
	stdout, stderr, err := f.Run(ctx, "gh", "api", path, "--paginate", "--slurp")
	if err != nil {
		return nil, fmt.Errorf("gh api %s: %w: %s", path, err, strings.TrimSpace(string(stderr)))
	}
	var pages [][]ghIssue
	if err := json.Unmarshal(stdout, &pages); err != nil {
		return nil, fmt.Errorf("decoding gh api output: %w", err)
	}
	var out []Issue
	for _, page := range pages {
		for _, g := range page {
			if len(g.PullRequest) > 0 {
				continue
			}
			iss := Issue{
				Number:            g.Number,
				CreatedAt:         g.CreatedAt,
				AuthorAssociation: g.AuthorAssociation,
				State:             g.State,
				Title:             g.Title,
				Body:              g.Body,
			}
			if g.User != nil {
				iss.UserLogin = g.User.Login
			}
			out = append(out, iss)
		}
	}
	return out, nil
}

// ResolveRepo derives the repository slug from the Go module path and refuses unless the
// checkout's own origin agrees.
//
// The slug is not a fourth copy of a constant that already lives in go.mod: it is read
// from there. The cross-check exists because gh resolves the repo from the working
// directory's origin remote, so inside a worktree of a fork, or after a remote rename,
// the tool would triage one repository and splice issue URLs pointing at another.
func ResolveRepo(ctx context.Context, run RunFunc, modulePath string) (string, error) {
	want := strings.TrimPrefix(modulePath, "github.com/")
	if want == modulePath || strings.Count(want, "/") != 1 {
		return "", fmt.Errorf("module path %q is not a github.com/owner/name path", modulePath)
	}
	stdout, stderr, err := run(ctx, "gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")
	if err != nil {
		return "", fmt.Errorf("gh repo view: %w: %s", err, strings.TrimSpace(string(stderr)))
	}
	got := strings.TrimSpace(string(stdout))
	if got != want {
		return "", fmt.Errorf("checkout points at %q but the module path says %q — refusing to triage a different repository", got, want)
	}
	return want, nil
}
