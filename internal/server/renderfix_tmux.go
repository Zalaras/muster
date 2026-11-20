//go:build renderfix

package server

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// renderTmux is the paneSpawner for a run with no tmux at all.
type renderTmux struct {
	mu    sync.Mutex
	panes map[string]bool
	next  int
}

func newRenderTmux() *renderTmux { return &renderTmux{panes: map[string]bool{}} }

func (f *renderTmux) NewSession(_ context.Context, id int64, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.next++
	target = fmt.Sprintf("muster-%d:@%d", id, f.next)
	f.panes[target] = true
	return target, fmt.Sprintf("%%%d", f.next), nil
}

func (f *renderTmux) NewNamedSession(_ context.Context, name, _ string, _ map[string]string, _ []string) (target, pane string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.next++
	f.panes[name] = true
	return name, fmt.Sprintf("%%%d", f.next), nil
}

func (f *renderTmux) PaneExists(_ context.Context, target string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.panes[target], nil
}

func (f *renderTmux) KillWindow(_ context.Context, target string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.panes, target)
	return nil
}

func (f *renderTmux) KillSession(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.panes, name)
	return nil
}

func (f *renderTmux) ListSessions(context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	names := make([]string, 0, len(f.panes))
	for name := range f.panes {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func (f *renderTmux) MaxSessionID(context.Context) (int64, error) { return 0, nil }
