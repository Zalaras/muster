package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

//go:embed index.html
var indexHTML []byte

// hub holds the latest snapshot and pushes each change to every open page.
type hub struct {
	mu   sync.Mutex
	last []byte // JSON of the latest snapshot
	key  string // the snapshot without its clock, to tell a real change from a tick
	subs map[chan []byte]struct{}
}

func newHub() *hub { return &hub{subs: map[chan []byte]struct{}{}} }

// publish stores snap and reports whether anything but the clock changed; only then is it pushed.
func (h *hub) publish(snap Snapshot) bool {
	b, _ := json.Marshal(snap)
	snap.Now = ""
	k, _ := json.Marshal(snap)
	h.mu.Lock()
	defer h.mu.Unlock()
	h.last = b
	if string(k) == h.key {
		return false
	}
	h.key = string(k)
	for c := range h.subs {
		select {
		case c <- b:
		default: // a slow page catches up on the next change
		}
	}
	return true
}

func (h *hub) current() []byte {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.last
}

func (h *hub) subscribe() (chan []byte, func()) {
	c := make(chan []byte, 1)
	h.mu.Lock()
	h.subs[c] = struct{}{}
	h.mu.Unlock()
	return c, func() { h.mu.Lock(); delete(h.subs, c); h.mu.Unlock() }
}

// poll rescans every interval until stop closes.
func (h *hub) poll(scan func() Snapshot, every time.Duration, stop <-chan struct{}) {
	h.publish(scan())
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			h.publish(scan())
		}
	}
}

func (h *hub) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexHTML)
	})
	mux.HandleFunc("GET /api/runs", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(h.current())
	})
	mux.HandleFunc("GET /events", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		c, cancel := h.subscribe()
		defer cancel()
		send := func(b []byte) { _, _ = fmt.Fprintf(w, "data: %s\n\n", b); fl.Flush() }
		send(h.current())
		keep := time.NewTicker(25 * time.Second)
		defer keep.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case b := <-c:
				send(b)
			case <-keep.C:
				_, _ = fmt.Fprint(w, ": keep-alive\n\n")
				fl.Flush()
			}
		}
	})
	return mux
}
