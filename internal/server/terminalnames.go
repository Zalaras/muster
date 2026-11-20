package server

import (
	"strconv"
	"sync"
)

const maxTerminalNameLen = 40

type terminalID struct {
	session int64
	n       int
}

type terminalNames struct {
	mu    sync.Mutex
	names map[terminalID]string
}

func newTerminalNames() *terminalNames {
	return &terminalNames{names: make(map[terminalID]string)}
}

func defaultTerminalName(n int) string { return "shell " + strconv.Itoa(n) }

func (t *terminalNames) set(id int64, n int, name string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if name == "" {
		delete(t.names, terminalID{id, n})
		return
	}
	t.names[terminalID{id, n}] = name
}

func (t *terminalNames) effective(id int64, n int) string {
	t.mu.Lock()
	name := t.names[terminalID{id, n}]
	t.mu.Unlock()
	if name == "" {
		return defaultTerminalName(n)
	}
	return name
}

func (t *terminalNames) forget(id int64, n int) { t.set(id, n, "") }

func (t *terminalNames) forgetSession(id int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	for key := range t.names {
		if key.session == id {
			delete(t.names, key)
		}
	}
}
