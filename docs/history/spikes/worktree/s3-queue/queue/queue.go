// Package queue is a spike: a daemon-side merge-queue state machine with no LLM in it.
// One entry per candidate branch, persisted as JSON under the repo's git common dir.
// Every transition is written to disk BEFORE the side effect it announces, so a crash at
// any point is recoverable by Run on the next invocation.
package queue

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type State string

const (
	Queued             State = "queued"
	Rebasing           State = "rebasing"
	Verifying          State = "verifying"
	AwaitingResolution State = "awaiting-resolution"
	AwaitingConfirm    State = "awaiting-confirm"
	Merging            State = "merging"
	Done               State = "done"
	Failed             State = "failed"
)

// Terminal reports whether the state machine stops at s until an external action
// (resolution files, Confirm) or forever (Done/Failed).
func (s State) Terminal() bool {
	return s == Done || s == Failed || s == AwaitingResolution || s == AwaitingConfirm
}

const maxAttempts = 3

// Entry is the persisted record of one queued branch.
type Entry struct {
	Branch  string `json:"branch"`
	Target  string `json:"target"`
	State   State  `json:"state"`
	Attempt int    `json:"attempt"`

	BranchSHA  string `json:"branch_sha,omitempty"`  // candidate tip when rebasing started
	BaseTarget string `json:"base_target,omitempty"` // target tip the rebase was onto
	RebasedSHA string `json:"rebased_sha,omitempty"`

	VerifyCmd    string `json:"verify_cmd"`
	VerifyExit   *int   `json:"verify_exit,omitempty"`
	VerifyOutput string `json:"verify_output,omitempty"` // tail; full log in verify.log
	VerifiedTree string `json:"verified_tree,omitempty"` // tree verify ran on (or confirmed)

	TargetBefore string `json:"target_before,omitempty"` // target tip when merging started (undo point)
	MergeCommit  string `json:"merge_commit,omitempty"`
	MergeTree    string `json:"merge_tree,omitempty"`
	TreeMismatch bool   `json:"tree_mismatch,omitempty"`

	Conflicts          []string          `json:"conflicts,omitempty"`            // paths the rebase stopped on
	MergeTreeConflicts []string          `json:"merge_tree_conflicts,omitempty"` // paths merge-tree reports
	RerereIDs          map[string]string `json:"rerere_ids,omitempty"`           // rr-cache id per open conflict
	RerereReplayed     []string          `json:"rerere_replayed,omitempty"`
	RerereForgotten    []string          `json:"rerere_forgotten,omitempty"`
	ResolutionsApplied []string          `json:"resolutions_applied,omitempty"`
	Confirmed          bool              `json:"confirmed,omitempty"`

	Reason  string   `json:"reason,omitempty"`
	History []string `json:"history"` // "<rfc3339> <from> -> <to>"
	Log     []string `json:"log,omitempty"`
}

// Queue drives entries for one repository.
type Queue struct {
	Repo          string // any path inside the repo
	Target        string // default "main"
	VerifyCmd     string // "" ⇒ skip verify, stop at awaiting-confirm
	VerifyTimeout time.Duration
	// CrashAfter names a point at which Run calls os.Exit(3) — used to prove restart
	// safety. Points: rebasing, rebased, verifying, verified, merging, committed, ff.
	CrashAfter string
	Logf       func(string, ...any)

	common string // git common dir
	dir    string // <common>/muster-queue
	wt     string // integration worktree
}

// Open resolves paths and makes sure the integration worktree exists and is clean.
func Open(q *Queue) (*Queue, error) {
	if q.Target == "" {
		q.Target = "main"
	}
	if q.VerifyTimeout == 0 {
		q.VerifyTimeout = 10 * time.Minute
	}
	if q.Logf == nil {
		q.Logf = func(string, ...any) {}
	}
	common, err := git(q.Repo, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return nil, err
	}
	q.common = common
	q.dir = filepath.Join(common, "muster-queue")
	q.wt = filepath.Join(q.dir, "wt")
	if err := os.MkdirAll(filepath.Join(q.dir, "entries"), 0o700); err != nil {
		return nil, err
	}
	if _, err := os.Stat(filepath.Join(q.wt, ".git")); err != nil {
		_, _ = git(q.Repo, "worktree", "prune") // a deleted dir may still be registered
		if _, err := git(q.Repo, "worktree", "add", "-q", "--detach", q.wt, q.Target); err != nil {
			return nil, err
		}
	}
	if err := enableRerere(q.wt); err != nil {
		return nil, err
	}
	return q, resetWorktree(q.wt)
}

func (q *Queue) Worktree() string { return q.wt }

func safeName(branch string) string { return strings.ReplaceAll(branch, "/", "__") }

func (q *Queue) entryDir(branch string) string {
	return filepath.Join(q.dir, "entries", safeName(branch))
}

// Load returns the persisted entry for branch, or nil if none.
func (q *Queue) Load(branch string) (*Entry, error) {
	b, err := os.ReadFile(filepath.Join(q.entryDir(branch), "entry.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var e Entry
	return &e, json.Unmarshal(b, &e)
}

// persist writes the entry atomically (temp file + rename).
func (q *Queue) persist(e *Entry) error {
	dir := q.entryDir(e.Branch)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(dir, "entry.json.tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "entry.json"))
}

func (q *Queue) crash(point string) {
	if q.CrashAfter == point {
		q.Logf("CRASH at %s", point)
		os.Exit(3)
	}
}

// transition persists the new state, then honours the crash point named after it.
func (q *Queue) transition(e *Entry, to State) error {
	e.History = append(e.History, fmt.Sprintf("%s %s -> %s", time.Now().UTC().Format(time.RFC3339), e.State, to))
	e.State = to
	if err := q.persist(e); err != nil {
		return err
	}
	q.Logf("%s: %s", e.Branch, to)
	q.crash(string(to))
	return nil
}

func (q *Queue) fail(e *Entry, reason string) error {
	e.Reason = reason
	q.Logf("%s: FAILED: %s", e.Branch, reason)
	return q.transition(e, Failed)
}

func (q *Queue) note(e *Entry, format string, a ...any) {
	e.Log = append(e.Log, fmt.Sprintf(format, a...))
	q.Logf(format, a...)
}

// Enqueue creates (or returns the existing) entry for branch.
func (q *Queue) Enqueue(branch string) (*Entry, error) {
	if e, err := q.Load(branch); err != nil || e != nil {
		return e, err
	}
	if _, err := revParse(q.Repo, "refs/heads/"+branch); err != nil {
		return nil, fmt.Errorf("no such branch %q", branch)
	}
	e := &Entry{Branch: branch, Target: q.Target, VerifyCmd: q.VerifyCmd, State: Queued}
	return e, q.persist(e)
}

// Confirm approves an awaiting-confirm entry for merging (dashboard action stand-in).
func (q *Queue) Confirm(branch string) error {
	e, err := q.Load(branch)
	if err != nil || e == nil {
		return fmt.Errorf("confirm %s: %v", branch, err)
	}
	e.Confirmed = true
	return q.persist(e)
}

// Requeue discards a finished entry (and its stored resolutions) so the branch can be
// driven again from queued — e.g. after the owner pushed a fix for a verify failure.
func (q *Queue) Requeue(branch string) error { return os.RemoveAll(q.entryDir(branch)) }

// Resolve stores a human/agent resolution for path; Run applies it on the next rebase.
func (q *Queue) Resolve(branch, path string, content []byte) error {
	p := filepath.Join(q.entryDir(branch), "resolutions", path)
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	return os.WriteFile(p, content, 0o600)
}

// Run drives branch's entry until it reaches a terminal/waiting state. It is safe to
// call after a crash: it recovers from whatever state was last persisted.
func (q *Queue) Run(branch string) (*Entry, error) {
	e, err := q.Enqueue(branch)
	if err != nil {
		return nil, err
	}
	if err := q.recover(e); err != nil {
		return e, err
	}
	for !e.State.Terminal() {
		var err error
		switch e.State {
		case Queued:
			err = q.startRebase(e)
		case Rebasing:
			err = q.doRebase(e)
		case Verifying:
			err = q.doVerify(e)
		case Merging:
			err = q.doMerge(e)
		default:
			err = fmt.Errorf("unknown state %q", e.State)
		}
		if err != nil {
			_ = resetWorktree(q.wt)
			return e, errors.Join(err, q.fail(e, err.Error()))
		}
	}
	return e, resetWorktree(q.wt)
}

// recover inspects a persisted state after a (possible) crash and decides whether to
// resume, restart or finish it. The integration worktree has already been reset by Open.
func (q *Queue) recover(e *Entry) error {
	switch e.State {
	case Rebasing:
		q.note(e, "recover: restarting rebase from %s", e.BranchSHA)
		return q.transition(e, Queued)
	case Verifying:
		q.note(e, "recover: re-running verify on %s", e.RebasedSHA) // doVerify checks out RebasedSHA itself
	case Merging:
		cur, err := revParse(q.Repo, "refs/heads/"+e.Target)
		if err != nil {
			return err
		}
		if cur == e.TargetBefore {
			q.note(e, "recover: target unchanged, redoing squash")
			return nil
		}
		parent, _ := revParse(q.Repo, cur+"^")
		tree, _ := revParse(q.Repo, cur+"^{tree}")
		if parent == e.TargetBefore && tree == e.VerifiedTree {
			q.note(e, "recover: fast-forward already landed as %s", cur)
			e.MergeCommit, e.MergeTree = cur, tree
			return q.transition(e, Done)
		}
		q.note(e, "recover: target moved underneath (%s), requeueing", cur)
		return q.transition(e, Queued)
	case AwaitingResolution:
		if n, _ := filepath.Glob(filepath.Join(q.entryDir(e.Branch), "resolutions", "*")); len(n) > 0 {
			q.note(e, "resolutions present, retrying rebase")
			return q.transition(e, Queued)
		}
	case AwaitingConfirm:
		if e.Confirmed {
			return q.startMerge(e)
		}
	}
	return nil
}

func (q *Queue) startRebase(e *Entry) error {
	e.Attempt++
	if e.Attempt > maxAttempts {
		return fmt.Errorf("gave up after %d attempts", maxAttempts)
	}
	var err error
	if e.BranchSHA, err = revParse(q.Repo, "refs/heads/"+e.Branch); err != nil {
		return err
	}
	if e.BaseTarget, err = revParse(q.Repo, "refs/heads/"+e.Target); err != nil {
		return err
	}
	e.RebasedSHA, e.VerifiedTree, e.VerifyExit, e.VerifyOutput = "", "", nil, ""
	e.Conflicts, e.MergeTreeConflicts, e.RerereIDs = nil, nil, nil
	return q.transition(e, Rebasing)
}

// doRebase replays the branch onto the target in the integration worktree, staging
// rerere replays and supplied resolutions; any other conflict parks the entry.
func (q *Queue) doRebase(e *Entry) error {
	if _, err := git(q.wt, "checkout", "-q", "--detach", e.BranchSHA); err != nil {
		return err
	}
	args := []string{"rebase", e.BaseTarget}
	for {
		if _, _, err := gitFull(q.wt, args...); err == nil {
			break
		}
		if !rebaseInProgress(q.wt) {
			return fmt.Errorf("rebase failed without leaving a rebase in progress")
		}
		unmerged, replayed, remaining, err := rerereSplit(q.wt)
		if err != nil {
			return err
		}
		if len(unmerged) == 0 {
			return fmt.Errorf("rebase stopped with no unmerged paths")
		}
		var stage, open []string
		stage = append(stage, replayed...)
		for _, p := range remaining {
			res := filepath.Join(q.entryDir(e.Branch), "resolutions", p)
			if b, err := os.ReadFile(res); err == nil {
				if err := os.WriteFile(filepath.Join(q.wt, p), b, 0o644); err != nil {
					return err
				}
				stage = append(stage, p)
				e.ResolutionsApplied = append(e.ResolutionsApplied, p)
			} else {
				open = append(open, p)
			}
		}
		if len(open) > 0 {
			return q.parkConflict(e, open)
		}
		e.RerereReplayed = append(e.RerereReplayed, replayed...)
		for _, p := range replayed {
			q.note(e, "rerere replayed %s", p)
		}
		if _, err := git(q.wt, append([]string{"add", "--"}, stage...)...); err != nil {
			return err
		}
		args = []string{"rebase", "--continue"}
	}
	var err error
	if e.RebasedSHA, err = revParse(q.wt, "HEAD"); err != nil {
		return err
	}
	q.crash("rebased")
	return q.transition(e, Verifying)
}

// parkConflict captures the conflict (paths, rr-cache ids, merge-tree blobs), aborts
// the rebase so the worktree is clean, and moves the entry to awaiting-resolution.
func (q *Queue) parkConflict(e *Entry, open []string) error {
	e.Conflicts = open
	e.RerereIDs = rerereIDs(q.wt)
	e.MergeTreeConflicts = nil
	dir := filepath.Join(q.entryDir(e.Branch), "conflicts")
	_ = os.RemoveAll(dir)
	out, _, _ := gitFull(q.wt, "merge-tree", "--write-tree", e.BaseTarget, e.BranchSHA)
	lines := strings.Split(out, "\n")
	if len(lines) > 0 && len(lines[0]) == 40 {
		tree := lines[0]
		seen := map[string]bool{}
		for _, l := range lines[1:] {
			if l == "" {
				break // end of "conflicted file info" section
			}
			_, path, ok := strings.Cut(l, "\t")
			if !ok || seen[path] {
				continue
			}
			seen[path] = true
			e.MergeTreeConflicts = append(e.MergeTreeConflicts, path)
			blob, err := git(q.wt, "show", tree+":"+path)
			if err != nil {
				return err
			}
			p := filepath.Join(dir, path)
			if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
				return err
			}
			if err := os.WriteFile(p, []byte(blob+"\n"), 0o600); err != nil {
				return err
			}
		}
	}
	if err := resetWorktree(q.wt); err != nil {
		return err
	}
	q.note(e, "conflict on %v; blobs in %s", open, dir)
	return q.transition(e, AwaitingResolution)
}

func (q *Queue) doVerify(e *Entry) error {
	if _, err := git(q.wt, "checkout", "-q", "--detach", e.RebasedSHA); err != nil {
		return err
	}
	if err := resetWorktree(q.wt); err != nil {
		return err
	}
	cur, err := revParse(q.Repo, "refs/heads/"+e.Target)
	if err != nil {
		return err
	}
	if cur != e.BaseTarget {
		q.note(e, "%s moved before verify (%s -> %s), requeueing", e.Target, e.BaseTarget, cur)
		return q.transition(e, Queued)
	}
	if e.VerifiedTree, err = revParse(q.wt, "HEAD^{tree}"); err != nil {
		return err
	}
	if e.VerifyCmd == "" {
		q.note(e, "no verify command; awaiting confirm")
		return q.transition(e, AwaitingConfirm)
	}
	code, out, err := runVerify(q.wt, e.VerifyCmd, filepath.Join(q.entryDir(e.Branch), "verify.log"), q.VerifyTimeout)
	if err != nil {
		return err
	}
	e.VerifyExit = &code
	if len(out) > 2000 {
		out = out[len(out)-2000:]
	}
	e.VerifyOutput = out
	if code != 0 {
		if len(e.RerereReplayed) > 0 {
			if err := q.forgetReplayed(e); err != nil {
				return err
			}
		}
		return q.fail(e, fmt.Sprintf("verify exited %d", code))
	}
	q.crash("verified")
	return q.startMerge(e)
}

// forgetReplayed re-creates the conflict (rerere replays again, which is harmless) so
// `git rerere forget` can see the unmerged stages, forgets the replayed paths, aborts.
func (q *Queue) forgetReplayed(e *Entry) error {
	if _, err := git(q.wt, "checkout", "-q", "--detach", e.BranchSHA); err != nil {
		return err
	}
	pending := map[string]bool{}
	for _, p := range e.RerereReplayed {
		pending[p] = true
	}
	args := []string{"rebase", e.BaseTarget}
	for len(pending) > 0 {
		if _, _, err := gitFull(q.wt, args...); err == nil || !rebaseInProgress(q.wt) {
			break
		}
		unmerged, _, _, err := rerereSplit(q.wt)
		if err != nil {
			return err
		}
		var here []string
		for _, p := range unmerged {
			if pending[p] {
				here = append(here, p)
				delete(pending, p)
			}
		}
		forgot, err := rerereForget(q.wt, here)
		e.RerereForgotten = append(e.RerereForgotten, forgot...)
		if err != nil {
			return err
		}
		q.note(e, "rerere forget %v (verify failed after replay)", forgot)
		if _, err := git(q.wt, append([]string{"add", "--"}, unmerged...)...); err != nil {
			return err
		}
		args = []string{"rebase", "--continue"}
	}
	return resetWorktree(q.wt)
}

func (q *Queue) startMerge(e *Entry) error {
	cur, err := revParse(q.Repo, "refs/heads/"+e.Target)
	if err != nil {
		return err
	}
	if cur != e.BaseTarget {
		q.note(e, "%s moved before merge (%s -> %s), requeueing", e.Target, e.BaseTarget, cur)
		return q.transition(e, Queued)
	}
	e.TargetBefore = cur
	return q.transition(e, Merging)
}

// doMerge squash-commits the rebased branch onto the target in the integration
// worktree, checks the tree matches what verify saw, then fast-forwards the target.
func (q *Queue) doMerge(e *Entry) error {
	if _, err := git(q.wt, "checkout", "-q", "--detach", e.TargetBefore); err != nil {
		return err
	}
	if err := resetWorktree(q.wt); err != nil {
		return err
	}
	if _, err := git(q.wt, "merge", "-q", "--squash", e.RebasedSHA); err != nil {
		return err
	}
	body, _ := git(q.wt, "log", "--format=%s", e.TargetBefore+".."+e.RebasedSHA)
	msg := fmt.Sprintf("%s (muster-queue squash)\n\n%s", e.Branch, body)
	if _, err := git(q.wt, "commit", "-q", "-m", msg); err != nil {
		return err
	}
	var err error
	if e.MergeCommit, err = revParse(q.wt, "HEAD"); err != nil {
		return err
	}
	if e.MergeTree, err = revParse(q.wt, "HEAD^{tree}"); err != nil {
		return err
	}
	if e.MergeTree != e.VerifiedTree {
		e.TreeMismatch = true
		return fmt.Errorf("merge tree %s != verified tree %s; refusing to fast-forward", e.MergeTree, e.VerifiedTree)
	}
	q.crash("committed")
	if err := fastForward(q.Repo, e.Target, e.TargetBefore, e.MergeCommit); err != nil {
		return err
	}
	q.crash("ff")
	return q.transition(e, Done)
}
