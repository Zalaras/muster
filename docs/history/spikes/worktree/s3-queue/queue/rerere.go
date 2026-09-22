package queue

import (
	"os"
	"path/filepath"
	"strings"
)

// rerere handling. Measured behaviour (git 2.50.1, spikes/worktree/S3-queue.md):
//   - after a conflict where rerere REPLAYED a recorded resolution, that path appears in
//     neither `git rerere status`, nor `git rerere remaining`, nor MERGE_RR — so
//     "pre-resolved" = unmerged paths minus `rerere remaining`;
//   - MERGE_RR (`<id>\t<path>`) lists only paths still awaiting a human resolution, so it
//     is where rr-cache ids for a *new* resolution are captured at stage time;
//   - `git rerere forget <path>` needs the conflict present in the index; it does not
//     need the postimage to be applied in the working tree.

// enableRerere sets the integration worktree's (shared) repo config.
func enableRerere(dir string) error {
	for _, kv := range [][2]string{{"rerere.enabled", "true"}, {"rerere.autoUpdate", "false"}, {"advice.mergeConflict", "false"}} {
		if _, err := git(dir, "config", kv[0], kv[1]); err != nil {
			return err
		}
	}
	return nil
}

// rerereSplit classifies the currently unmerged paths into those rerere already replayed
// and those still needing a resolution.
func rerereSplit(dir string) (unmerged, replayed, remaining []string, err error) {
	unmerged, err = gitLines(dir, "diff", "--name-only", "--diff-filter=U")
	if err != nil {
		return
	}
	remaining, err = gitLines(dir, "rerere", "remaining")
	if err != nil {
		return
	}
	rem := map[string]bool{}
	for _, p := range remaining {
		rem[p] = true
	}
	for _, p := range unmerged {
		if !rem[p] {
			replayed = append(replayed, p)
		}
	}
	return
}

// rerereIDs reads MERGE_RR: the rr-cache id that a hand resolution of each still-open
// conflicted path will be recorded under.
func rerereIDs(dir string) map[string]string {
	ids := map[string]string{}
	p, err := git(dir, "rev-parse", "--git-path", "MERGE_RR")
	if err != nil {
		return ids
	}
	if !filepath.IsAbs(p) {
		p = filepath.Join(dir, p)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return ids
	}
	for _, l := range strings.Split(string(b), "\x00") { // entries are NUL-terminated
		if id, path, ok := strings.Cut(l, "\t"); ok {
			ids[path] = id
		}
	}
	return ids
}

// rerereForget drops the recorded resolutions for paths. It must run while those paths
// are unmerged in the index; callers re-create the conflict first (see forgetReplayed).
func rerereForget(dir string, paths []string) (forgot []string, err error) {
	for _, p := range paths {
		if _, err = git(dir, "rerere", "forget", p); err != nil {
			return
		}
		forgot = append(forgot, p)
	}
	return
}
